// Look around on top of the scripted camera: drag adds yaw/pitch, wheel/pinch nudges the field of
// view. After release the offsets wait LOOK_RESUME_S, then ease back to the path. The return is
// slow enough to stay under the comfort limits (returnTime); a big offset that would need more than
// LOOK_SNAP_S dips to dark for LOOK_SNAP_FADE_S and comes back on the path instead of swinging.
import { LOOK_RESUME_S, LOOK_RETURN_S, LOOK_RETURN_MARGIN, LOOK_SNAP_S, LOOK_SNAP_FADE_S, COMFORT } from './config.js';
import { clamp, easeCos, smoothstep } from './util.js';

// Duration of a cosine return from these offsets (deg). The cosine ease peaks at offset * pi / (2T)
// per second, so T is the shortest time that keeps every channel under its limit (the field-of-view
// offset is held to the pitch rate).
export function returnTime(yaw, pitch, fov) {
  const k = Math.PI / 2;
  const yawMax = COMFORT.MAX_YAW_DEG_S * LOOK_RETURN_MARGIN;
  const pitchMax = COMFORT.MAX_PITCH_DEG_S * LOOK_RETURN_MARGIN;
  return Math.max(LOOK_RETURN_S, (Math.abs(yaw) * k) / yawMax, (Math.abs(pitch) * k) / pitchMax, (Math.abs(fov) * k) / pitchMax);
}

export class Look {
  constructor(el, { onInteract = () => {}, onTap = () => {} } = {}) {
    this.el = el;
    this.onInteract = onInteract;
    this.onTap = onTap;
    this.yaw = 0; this.pitch = 0; this.fov = 0;
    this.enabled = false;
    this.keepYaw = false;         // 360 photo: the turn is kept (main.js absorbs it), only pitch/fov return
    this.pointers = new Map();
    this.idleFor = Infinity;      // seconds since the last touch
    this.returning = null;        // {yaw, pitch, fov, t, T, keepYaw}
    this.snap = null;             // {t, done, keepYaw}: dark dip back to the path
    this.fade = 0;                // 0..1 dark overlay requested by the snap (main.js adds it to the fade)
    this.resume = 1;              // 0 while held / waiting, eases to 1 when the path takes over again
    this.fovRef = 50;
    this._pinch = null;
    this._down = null;
    el.addEventListener('pointerdown', (e) => this._onDown(e));
    el.addEventListener('pointermove', (e) => this._onMove(e));
    el.addEventListener('pointerup', (e) => this._onUp(e));
    el.addEventListener('pointercancel', (e) => this._onUp(e));
    el.addEventListener('lostpointercapture', (e) => this._onUp(e));
    el.addEventListener('wheel', (e) => this._onWheel(e), { passive: false });
  }

  get holding() { return this.pointers.size > 0; }

  // Back on the path at once (scene cuts that start from dark, tour start/end). Fingers that are
  // still down stay tracked, so a drag that crosses a cut keeps working.
  reset() {
    this.yaw = 0; this.pitch = 0; this.fov = 0;
    this.returning = null;
    this.snap = null;
    this.fade = 0;
    this.idleFor = this.holding ? 0 : Infinity;
    if (!this.holding) this._lastTouch = 0;
    this.resume = this.holding ? 0 : 1;
    if (this._pinch) this._pinch.fov = 0;
  }

  _touch() {
    this.idleFor = 0;
    this._lastTouch = performance.now();
    this.returning = null;
    this.snap = null;             // the fade (if any) decays in update()
    this.resume = 0;
    this.onInteract();
  }

  _degPerPx() {
    const h = this.el.clientHeight || 600;
    return this.fovRef / h;
  }

  _onDown(e) {
    if (e.button !== undefined && e.button > 0) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { this.el.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
    if (this.pointers.size === 1) this._down = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false };
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this._pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), fov: this.fov };
    }
    if (this.enabled) this._touch();
    else this.onInteract();
  }

  _onMove(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (this._down && Math.hypot(e.clientX - this._down.x, e.clientY - this._down.y) > 8) this._down.moved = true;
    if (!this.enabled) return;
    if (this.pointers.size >= 2 && this._pinch) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      this.fov = clamp(this._pinch.fov - Math.log(d / Math.max(1, this._pinch.d)) * 22, -18, 12);
    } else {
      const k = this._degPerPx();
      this.yaw = clamp(this.yaw - dx * k, -170, 170);
      this.pitch = clamp(this.pitch + dy * k, -50, 50);
    }
    this._touch();
  }

  _onUp(e) {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this._pinch = null;
    if (this.pointers.size === 0 && this._down) {
      const quick = performance.now() - this._down.t < 350;
      if (quick && !this._down.moved) this.onTap(e);
      this._down = null;
    }
    if (this.enabled) this._touch();
  }

  _onWheel(e) {
    if (!this.enabled) return;
    e.preventDefault();
    this.fov = clamp(this.fov + Math.sign(e.deltaY) * Math.min(4, Math.abs(e.deltaY) * 0.03), -18, 12);
    this._touch();
  }

  // Keyboard look (arrow keys are taken for scenes, so this is for future use).
  nudge(dyaw, dpitch) {
    this.yaw = clamp(this.yaw + dyaw, -170, 170);
    this.pitch = clamp(this.pitch + dpitch, -50, 50);
    this._touch();
  }

  // For the 360 photo: keep where the viewer turned to (no swing back), return only pitch/zoom.
  absorbYaw() {
    const y = this.yaw;
    this.yaw = 0;
    if (this.returning) this.returning.yaw = 0;
    return y;
  }

  update(dt) {
    if (this.holding) { this.idleFor = 0; this._lastTouch = performance.now(); this.resume = 0; this._decayFade(dt); return; }
    // idle time in real seconds (slow frames must not stretch the 4 s wait)
    this.idleFor = this._lastTouch ? (performance.now() - this._lastTouch) / 1000 : Infinity;
    if (this.idleFor < LOOK_RESUME_S) { this.resume = 0; this._decayFade(dt); return; }
    const keepYaw = this.keepYaw;
    const ry = keepYaw ? 0 : this.yaw;
    if (!this.returning && !this.snap && (ry || this.pitch || this.fov)) {
      const T = returnTime(ry, this.pitch, this.fov);
      if (T > LOOK_SNAP_S) this.snap = { t: 0, done: false, keepYaw };
      else this.returning = { yaw: ry, pitch: this.pitch, fov: this.fov, t: 0, T, keepYaw };
    }
    if (this.snap) {
      // out to dark, jump, back in. main.js draws a frame with the values of the previous update,
      // so the jump is made in the same update that reports full dark: the frame that shows it is
      // fully dark at any frame rate (with slow frames the fade-out simply ends early)
      const s = this.snap, h = LOOK_SNAP_FADE_S / 2;
      if (!s.done) {
        s.t += dt;
        if (s.t >= h) {
          s.done = true; s.tIn = 0;
          if (!s.keepYaw) this.yaw = 0;
          this.pitch = 0; this.fov = 0;
          this.fade = 1;
        } else this.fade = smoothstep(0, h, s.t);
      } else {
        s.tIn += dt;
        this.fade = 1 - smoothstep(0, h, s.tIn);
        if (s.tIn >= h) { this.snap = null; this.fade = 0; }
      }
    } else this._decayFade(dt);
    if (this.returning) {
      const r = this.returning;
      r.t += dt;
      const k = 1 - easeCos(r.t / r.T);
      if (!r.keepYaw) this.yaw = r.yaw * k;
      this.pitch = r.pitch * k; this.fov = r.fov * k;
      if (r.t >= r.T) {
        if (!r.keepYaw) this.yaw = 0;
        this.pitch = 0; this.fov = 0; this.returning = null;
      }
    }
    this.resume = Math.min(1, easeCos((this.idleFor - LOOK_RESUME_S) / LOOK_RETURN_S));
  }

  _decayFade(dt) {
    if (this.fade > 0) this.fade = Math.max(0, this.fade - dt / (LOOK_SNAP_FADE_S / 2));
  }
}
