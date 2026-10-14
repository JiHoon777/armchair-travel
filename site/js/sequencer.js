// Tour state machine: home -> descend -> wide -> approach -> stand -> daylapse -> ascend -> home
// (and round again when started with 그냥 틀어 두기). Only keeps time; main.js renders the poses.
import { SCENE_ORDER, JUMP_FADE_S } from './config.js';
import { clamp, smoothstep } from './util.js';

export class Sequencer {
  constructor({ durations, onScene = () => {}, onHome = () => {} } = {}) {
    this.dur = { ...durations };
    this.order = SCENE_ORDER.slice();
    this.onScene = onScene;
    this.onHome = onHome;
    this.state = 'home';   // 'home' | 'tour'
    this.mode = 'once';    // 'loop' | 'once'
    this.scene = null;
    this.t = 0;
    this.paused = false;
    this.hold = null;      // (scene, t) => bool : freeze time (waiting for data)
    this.jump = null;      // {to, toT, k, phase}
    this.homeDwell = 0;
    this.loops = 0;
  }

  setDurations(d) { this.dur = { ...this.dur, ...d }; }
  dur_(id) { return this.dur[id] || 0; }
  index() { return this.order.indexOf(this.scene); }

  start(mode, sceneId = 'descend', t = 0) {
    this.mode = mode;
    this.state = 'tour';
    this.paused = false;
    this.jump = null;
    this._enter(sceneId, t, null);
  }

  stop() {
    const prev = this.scene;
    this.state = 'home';
    this.scene = null;
    this.t = 0;
    this.jump = null;
    this.paused = false;
    this.onHome(prev);
  }

  _enter(id, t, prev) {
    this.scene = id;
    this.t = clamp(t, 0, this.dur_(id));
    this.onScene(id, prev, this.t);
  }

  pause() { this.paused = true; }
  resume() { this.paused = false; }
  toggle() { this.paused = !this.paused; return this.paused; }

  // Jump with a short dark fade. to: scene id; toT: start time
  jumpTo(to, toT = 0) {
    if (this.state !== 'tour') return;
    this.jump = { to, toT, k: 0, phase: 'out' };
  }
  next() {
    if (this.state !== 'tour') return;
    const i = this.index();
    if (i < 0) return;
    if (i >= this.order.length - 1) { this.jump = { to: null, k: 0, phase: 'out' }; return; }
    this.jumpTo(this.order[i + 1], 0);
  }
  prev() {
    if (this.state !== 'tour') return;
    const i = this.index();
    if (this.t > 5 || i <= 0) this.jumpTo(this.scene, 0);
    else this.jumpTo(this.order[i - 1], 0);
  }

  // 0..1 extra dark fade for jumps
  get jumpFade() {
    if (!this.jump) return 0;
    return this.jump.phase === 'out' ? smoothstep(0, 1, this.jump.k) : 1 - smoothstep(0, 1, this.jump.k);
  }

  update(dt) {
    if (this.state !== 'tour') return;
    const half = JUMP_FADE_S / 2;
    if (this.jump) {
      this.jump.k += dt / half;
      if (this.jump.k >= 1) {
        if (this.jump.phase === 'out') {
          const prev = this.scene;
          if (this.jump.to === null) { this.jump = null; this._finishTour(prev); return; }
          this._enter(this.jump.to, this.jump.toT, prev);
          this.jump = { ...this.jump, phase: 'in', k: 0 };
        } else this.jump = null;
      }
      if (this.jump && this.jump.phase === 'out') return; // hold time while fading out
    }
    if (this.paused) return;
    let nt = this.t + dt;
    if (this.hold && this.hold(this.scene, nt)) return;
    const d = this.dur_(this.scene);
    if (nt >= d) {
      const i = this.index();
      const prev = this.scene;
      if (i >= this.order.length - 1) { this._finishTour(prev); return; }
      this._enter(this.order[i + 1], nt - d, prev);
      return;
    }
    this.t = nt;
  }

  _finishTour(prev) {
    this.loops++;
    this.state = 'home';
    this.scene = null;
    this.t = 0;
    this.onHome(prev);
  }
}
