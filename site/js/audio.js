// Ambient nature sound with WebAudio. Nothing plays until unlock() runs inside a click.
// Gentle 3 s fades, mute toggle, -10 dB duck while the narration speaks.
// One decode per session (shared promise). Phones decode to 22.05 kHz mono (about 16 MB for the
// 180 s loop instead of about 69 MB at 48 kHz stereo).
import { AUDIO } from './config.js';

const dbToGain = (db) => Math.pow(10, db / 20);

export class AudioEngine {
  constructor({ light = false } = {}) {
    this.ctx = null;
    this.light = light;       // phones: smaller decoded buffer
    this.enabled = false;     // the viewer wants sound
    this.playing = false;
    this.buffer = null;
    this.source = null;
    this.meta = null;
    this.level = 1;           // loudness normalisation from audio.json lufs
    this.fallback = false;
    this.decodes = 0;         // decodeAudioData calls (tools check this stays 1)
    this.onState = null;      // (state) => void, AudioContext state changes
    this._loading = null;
    this._decoding = null;
    this._duck = false;
    this._paused = false;
  }

  get available() { return typeof window !== 'undefined' && !!(window.AudioContext || window.webkitAudioContext); }
  get running() { return !!this.ctx && this.ctx.state === 'running'; }

  // Must be called from a user gesture (click / key). Creates the context once, and resumes it when
  // it was suspended (tab switch, phone call, iOS interruption).
  unlock() {
    if (!this.available) return false;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0;
      this.duckGain = this.ctx.createGain();
      this.duckGain.gain.value = 1;
      this.bed = this.ctx.createGain();
      this.bed.gain.value = 1;
      this.bed.connect(this.duckGain).connect(this.master).connect(this.ctx.destination);
      this.ctx.onstatechange = () => { if (this.onState) this.onState(this.ctx.state); };
    }
    if (this.ctx.state !== 'running' && this.ctx.state !== 'closed') this.ctx.resume().catch(() => {});
    return true;
  }

  async load(base) {
    if (this._loading) return this._loading;
    this._loading = (async () => {
      try {
        const res = await fetch(base + 'audio.json');
        if (!res.ok) throw new Error(res.status + ' audio.json');
        const meta = await res.json();
        this.meta = meta.ambient || null;
        if (!this.meta || !this.meta.file) throw new Error('audio.json has no ambient.file');
        if (Number.isFinite(this.meta.lufs)) this.level = Math.min(2.5, dbToGain(AUDIO.TARGET_LUFS - this.meta.lufs));
        const r2 = await fetch(base + this.meta.file);
        if (!r2.ok) throw new Error(r2.status + ' ' + this.meta.file);
        this._encoded = await r2.arrayBuffer();
        return true;
      } catch (e) {
        console.warn('[audio]', e.message, '- using a soft wind instead');
        this.fallback = true;
        return false;
      }
    })();
    return this._loading;
  }

  // One decode, shared by every caller.
  _ensureBuffer() {
    if (this.buffer || !this.ctx) return Promise.resolve();
    if (!this._decoding) this._decoding = this._decode();
    return this._decoding;
  }

  async _decode() {
    if (this._loading) await this._loading;
    if (this._encoded) {
      try {
        const data = this._encoded;
        this._encoded = null; // the decoder may detach it; one decode only
        this.decodes++;
        this.buffer = this.light ? await this._decodeLight(data) : await this.ctx.decodeAudioData(data);
        return;
      } catch (e) {
        console.warn('[audio] decode failed', e && e.message);
        this.fallback = true;
      }
    }
    this.buffer = this._windBuffer();
    this.level = 0.5;
  }

  // 22.05 kHz mono through an OfflineAudioContext (buffers play in any context). Falls back to a
  // normal decode where the offline decode is missing.
  async _decodeLight(data) {
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    let buf = null;
    if (OAC) {
      try {
        const rate = 22050;
        const off = new OAC(1, rate, rate);
        buf = await off.decodeAudioData(data.slice(0));
      } catch { buf = null; }
    }
    if (!buf) buf = await this.ctx.decodeAudioData(data);
    if (buf.numberOfChannels === 1) return buf;
    const mono = this.ctx.createBuffer(1, buf.length, buf.sampleRate);
    const out = mono.getChannelData(0);
    const n = buf.numberOfChannels;
    for (let ch = 0; ch < n; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < d.length; i++) out[i] += d[i] / n;
    }
    return mono;
  }

  // Soft procedural wind (brown noise, slow swells) when no recording is available.
  _windBuffer() {
    const sr = this.ctx.sampleRate, len = sr * 12;
    const buf = this.ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let last = 0, seed = 1234 + ch * 77;
      const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 * 2 - 1; };
      for (let i = 0; i < len; i++) {
        last = (last + 0.02 * rand()) / 1.02;
        const t = i / sr;
        const swell = 0.55 + 0.45 * Math.sin((2 * Math.PI * t) / 12 + ch) * Math.sin((2 * Math.PI * t) / 6 + 0.7);
        d[i] = last * 3.2 * swell;
      }
      // loop seam: crossfade the ends
      const f = Math.floor(sr * 0.5);
      for (let i = 0; i < f; i++) {
        const k = i / f;
        d[i] = d[i] * k + d[len - f + i] * (1 - k);
      }
    }
    return buf;
  }

  _target() {
    if (!this.enabled || this._paused) return 0;
    return AUDIO.MASTER * this.level;
  }
  _ramp(param, value, seconds) {
    const now = this.ctx.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(value, now + seconds);
  }

  async setEnabled(on) {
    this.enabled = on;
    if (!this.ctx) return;
    if (on) {
      await this._ensureBuffer();
      if (!this.enabled) return;
      if (!this.source && this.buffer) {
        const src = this.ctx.createBufferSource();
        src.buffer = this.buffer;
        src.loop = true;
        // audio.json loop_hint: a decoder that ignores the MP3 gapless header leaves the encoder
        // priming/padding in the buffer; loop only the real 180 s then
        const m = this.meta;
        if (m && Number.isFinite(m.duration_s) && this.buffer.duration - m.duration_s > 0.01) {
          const g = m.mp3_gapless || {};
          const sr = m.sample_rate || 44100;
          src.loopStart = Number.isFinite(g.priming_samples) ? g.priming_samples / sr : 0;
          src.loopEnd = Math.min(this.buffer.duration, src.loopStart + m.duration_s);
          this.loopTrimmed = true;
        }
        src.connect(this.bed);
        src.start(0, src.loopStart || 0);
        this.source = src;
      }
      this.playing = true;
    }
    this._ramp(this.master.gain, this._target(), on ? AUDIO.FADE_S : 0.8);
  }

  setPaused(p) {
    this._paused = p;
    if (this.ctx) this._ramp(this.master.gain, this._target(), p ? 1.2 : AUDIO.FADE_S);
  }

  duck(on) {
    this._duck = on;
    if (this.ctx) this._ramp(this.duckGain.gain, on ? dbToGain(AUDIO.DUCK_DB) : 1, 1.0);
  }

  // Tab hidden: suspend the context; visible again: resume (may be refused outside a gesture).
  suspend() { return this.ctx && this.ctx.state === 'running' ? this.ctx.suspend().catch(() => {}) : Promise.resolve(); }
  resume() { return this.ctx && this.ctx.state !== 'running' && this.ctx.state !== 'closed' ? this.ctx.resume().catch(() => {}) : Promise.resolve(); }
}
