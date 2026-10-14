// "90초 듣기": the device's own Korean voice reads narration_ko sentence by sentence, each sentence
// shown as a caption. Without a Korean voice (or when the voice fails at once) the text runs as
// timed captions instead. Pause/resume works in both modes.
export class Narrator {
  constructor({ onSentence = () => {}, onStart = () => {}, onEnd = () => {}, onMode = () => {} } = {}) {
    this.onSentence = onSentence;
    this.onStart = onStart;
    this.onEnd = onEnd;
    this.onMode = onMode;     // (withVoice) when the mode changes after the start (voice failed)
    this.playing = false;
    this.paused = false;
    this.withVoice = false;
    this.voice = null;
    this.synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
    this._timer = 0;
    this._timerFn = null;
    this._timerDue = 0;
    this._remain = null;
    this._run = 0;
    if (this.synth) {
      this._pickVoice();
      try { this.synth.addEventListener('voiceschanged', () => this._pickVoice()); } catch { /* old Safari */ }
    }
  }

  _pickVoice() {
    if (!this.synth) return;
    const vs = this.synth.getVoices() || [];
    const ko = vs.filter((v) => /^ko(-|_|$)/i.test(v.lang));
    // prefer local, then names that tend to sound natural
    ko.sort((a, b) => (b.localService - a.localService) || (/yuna|sora|heami|google/i.test(b.name) - /yuna|sora|heami|google/i.test(a.name)));
    this.voice = ko[0] || null;
  }

  async _waitVoice(ms = 1200) {
    if (!this.synth || this.voice) return this.voice;
    const t0 = performance.now();
    while (!this.voice && performance.now() - t0 < ms) {
      await new Promise((r) => setTimeout(r, 150));
      this._pickVoice();
    }
    return this.voice;
  }

  get hasVoice() { return !!this.voice; }

  // Call from the click itself: iOS Safari only lets speech start inside a user gesture, so a
  // silent utterance is queued right away and the real sentences follow once a voice is known.
  play(sentences) {
    this.stop();
    const list = (sentences || []).map((s) => String(s).trim()).filter(Boolean);
    if (!list.length) return;
    const run = ++this._run;
    this.playing = true;
    this.paused = false;
    if (this.synth) {
      try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; u.lang = 'ko-KR'; this.synth.speak(u); } catch { /* no speech */ }
    }
    this._run_(list, run);
  }

  async _run_(list, run) {
    await this._waitVoice();
    if (run !== this._run) return;
    this.withVoice = !!this.voice;
    this.onStart(this.withVoice);
    let i = 0;
    const textHold = (text) => Math.max(2500, (text.length / 6.5) * 1000 + 700); // reading pace
    const voiceHold = (text) => Math.max(2500, (text.length / 7) * 1000);       // listening pace
    const next = () => {
      if (run !== this._run) return;
      if (i >= list.length) { this._finish(); return; }
      const idx = i, text = list[i++];
      this.onSentence(text, idx, list.length, this.withVoice);
      this._sentenceStart = performance.now();
      if (!this.withVoice) { this._schedule(textHold(text), next); return; }
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ko-KR';
      u.voice = this.voice;
      u.rate = 1.0;
      u.pitch = 1.0;
      const t0 = performance.now();
      let done = false;
      const after = (failed) => {
        if (done || run !== this._run) return;
        done = true;
        // a voice that errors or "ends" at once on the first sentence is not speaking: text instead
        if (idx === 0 && (failed || performance.now() - t0 < 300)) {
          this.withVoice = false;
          this.onMode(false);
          this.onSentence(text, idx, list.length, false);
          this._schedule(Math.max(250, this._sentenceStart + textHold(text) - performance.now()), next);
          return;
        }
        // never faster than the listening pace, even when the engine ends early
        this._schedule(Math.max(250, this._sentenceStart + voiceHold(text) - performance.now()), next);
      };
      u.onend = () => after(false);
      u.onerror = () => after(true);
      try { this.synth.speak(u); } catch { after(true); }
    };
    next();
  }

  _schedule(ms, fn) {
    clearTimeout(this._timer);
    this._timerFn = fn;
    if (this.paused) { this._remain = ms; this._timerDue = 0; return; }
    this._remain = null;
    this._timerDue = performance.now() + ms;
    this._timer = setTimeout(() => { this._timerDue = 0; fn(); }, ms);
  }

  _finish() {
    this.playing = false;
    this.paused = false;
    this.onEnd();
  }

  stop() {
    const was = this.playing;
    this._run++;
    clearTimeout(this._timer);
    this._timerDue = 0; this._remain = null; this._timerFn = null;
    if (this.synth) { try { this.synth.cancel(); } catch { /* ignore */ } }
    this.playing = false;
    this.paused = false;
    if (was) this.onEnd();
  }

  pause() {
    if (!this.playing || this.paused) return;
    this.paused = true;
    this._pausedAt = performance.now();
    if (this._timerDue) {
      clearTimeout(this._timer);
      this._remain = Math.max(0, this._timerDue - performance.now());
      this._timerDue = 0;
    }
    if (this.withVoice && this.synth) { try { this.synth.pause(); } catch { /* ignore */ } }
  }

  resume() {
    if (!this.playing || !this.paused) return;
    this.paused = false;
    if (this._pausedAt && this._sentenceStart) this._sentenceStart += performance.now() - this._pausedAt;
    this._pausedAt = 0;
    if (this._remain !== null && this._timerFn) { const ms = this._remain; this._remain = null; this._schedule(ms, this._timerFn); }
    if (this.withVoice && this.synth) { try { this.synth.resume(); } catch { /* ignore */ } }
  }
}
