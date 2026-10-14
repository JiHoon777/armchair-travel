#!/usr/bin/env node
// Comfort check for the scripted camera paths (site/js/paths.js).
// Samples every scene at 30 Hz and prints max yaw/pitch rate, roll, optical flow, zoom rate and
// minimum terrain clearance. Exits 1 if any limit in site/js/config.js is exceeded.
//
//   node tools/check_paths.mjs                 synthetic heightAt (procedural canyon)
//   node tools/check_paths.mjs --dem real      real DEM from site/data/grand-canyon/terrain (if present)
//   node tools/check_paths.mjs --dem both      both, when the real DEM exists
//   --hz 30  --json  --quiet
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pose, makePathContext, clearance3D, globeTurnPlan, standArc } from '../site/js/paths.js';
import { COMFORT, SCENE_ORDER, GLOBE, DESCEND, ASCEND, WIDE, STAND, LOOK_SNAP_S } from '../site/js/config.js';
import { returnTime } from '../site/js/look.js';
import { proceduralHeight } from '../site/js/procedural.js';
import { sampleGrid, wrap180, RAD } from '../site/js/util.js';
import { decodePNG, terrariumToFloat } from './lib/png.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SITE = path.join(ROOT, 'site');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const HZ = Number(opt('--hz', 30));
const demMode = opt('--dem', 'synthetic');
const asJson = args.includes('--json');

function readJSON(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function realHeightAt() {
  const dir = path.join(SITE, 'data/grand-canyon/terrain');
  const meta = readJSON(path.join(dir, 'meta.json'));
  if (!meta) return null;
  const load = (part) => {
    const f = path.join(dir, meta[part].dem.file);
    if (!fs.existsSync(f)) return null;
    const img = decodePNG(fs.readFileSync(f));
    return { grid: terrariumToFloat(img), n: img.width, size: meta[part].size_m };
  };
  const core = load('core'), outer = load('outer');
  if (!core) return null;
  const fn = (x, z) => {
    const h = sampleGrid(core.grid, core.n, core.size, x, z);
    if (Number.isFinite(h)) return h;
    return outer ? sampleGrid(outer.grid, outer.n, outer.size, x, z) : NaN;
  };
  // self-check against the contract's check points
  const checks = [];
  if (Array.isArray(meta.checks)) {
    for (const c of meta.checks) {
      const x = (c.lon - meta.origin.lon) * 111320 * Math.cos(meta.origin.lat * Math.PI / 180);
      const z = -(c.lat - meta.origin.lat) * 110574;
      checks.push({ name: c.name, expected: c.elev_m, got: Math.round(fn(x, z) * 10) / 10 });
    }
  }
  return { fn, checks, label: `real DEM (${core.n}px core${outer ? `, ${outer.n}px outer` : ''})` };
}

function placeFile() {
  return readJSON(path.join(SITE, 'data/grand-canyon/place.json'));
}
// The 360 photo's automatic turn: pano.json auto_arc_deg seen on a 16:9 desktop (vertical fov 62,
// horizontal 93.8) and a 390x844 phone (main.js fovFor: vertical 80, horizontal 42.4).
function standArcs() {
  const pano = readJSON(path.join(SITE, 'data/grand-canyon/pano/pano.json'));
  if (!pano || !Array.isArray(pano.auto_arc_deg)) return [];
  const hfov = (vfov, aspect) => 2 * Math.atan(Math.tan((vfov / 2) * Math.PI / 180) * aspect) * 180 / Math.PI;
  return [
    { name: 'desktop arc', arc: standArc(pano.auto_arc_deg, pano.initial_yaw_deg, hfov(STAND.FOV, 16 / 9)) },
    { name: 'phone arc', arc: standArc(pano.auto_arc_deg, pano.initial_yaw_deg, hfov(80, 390 / 844)) },
  ];
}

const LIMITS = {
  yaw: COMFORT.MAX_YAW_DEG_S, pitch: COMFORT.MAX_PITCH_DEG_S, roll: COMFORT.ROLL_DEG,
  flow: COMFORT.MAX_FLOW, clearance: COMFORT.MIN_CLEARANCE_M, zoom: COMFORT.ZOOM_MAX_PER_S,
  turn: COMFORT.GLOBE_TURN_MAX_DEG_S,
};
const ZOOM_SCENES = new Set(['descend', 'ascend']);

function measure(sceneId, ctx, heightAt, label, extra = null) {
  const T = ctx.dur[sceneId];
  const dt = 1 / HZ;
  const n = Math.round(T * HZ);
  let prev = null, prevT = 0;
  const m = { scene: sceneId, label, dur: T, yaw: 0, pitch: 0, roll: 0, flow: 0, flowInfo: 0, zoom: 0, turn: 0, clearance: Infinity, yawAt: 0, flowAt: 0, clearAt: 0, samples: 0, yawMin: Infinity, yawMax: -Infinity };
  const from = sceneId === 'ascend' ? pose('daylapse', ctx.dur.daylapse, ctx, {}) : null;
  for (let i = 0; i <= n; i++) {
    const t = Math.min(T, i * dt);
    const p = pose(sceneId, t, ctx, {}, { from, ...(extra || {}) });
    if (p.space === 'pano') { m.yawMin = Math.min(m.yawMin, p.yaw); m.yawMax = Math.max(m.yawMax, p.yaw); }
    m.samples++;
    m.roll = Math.max(m.roll, Math.abs(p.roll || 0));
    if (p.space === 'terrain' && heightAt) {
      const c = clearance3D(heightAt, p.x, p.y, p.z);
      if (c < m.clearance) { m.clearance = c; m.clearAt = t; }
    }
    if (prev && prev.space === p.space && t > prevT) {
      const h = t - prevT;
      const yawRate = Math.abs(wrap180(p.heading - prev.heading)) / h;
      const pitchRate = Math.abs(p.pitch - prev.pitch) / h;
      // in the globe phase, heading is fixed and pitch is the intended local pitch
      if (yawRate > m.yaw) { m.yaw = yawRate; m.yawAt = t; }
      m.pitch = Math.max(m.pitch, pitchRate);
      if (p.space === 'terrain') {
        const vx = (p.x - prev.x) / h, vy = (p.y - prev.y) / h, vz = (p.z - prev.z) / h;
        const speed = Math.hypot(vx, vy, vz);
        const ground = heightAt ? heightAt(p.x, p.z) : 2600;
        const hagl = Math.max(1, p.y - (Number.isFinite(ground) ? ground : 2600));
        const flow = speed / hagl;
        if (ZOOM_SCENES.has(sceneId)) {
          m.flowInfo = Math.max(m.flowInfo, flow);
          const lx = p.tx - p.x, ly = p.ty - p.y, lz = p.tz - p.z;
          const L = Math.hypot(lx, ly, lz) || 1;
          const vpar = Math.abs((vx * lx + vy * ly + vz * lz) / L);
          m.zoom = Math.max(m.zoom, vpar / L);
        } else if (flow > m.flow) { m.flow = flow; m.flowAt = t; }
      } else if (p.space === 'globe') {
        const z = Math.abs(Math.log(p.altM) - Math.log(prev.altM)) / h;
        m.zoom = Math.max(m.zoom, z);
        // view direction turn rate in the inertial globe frame
        const a = norm(p.gtx - p.gx, p.gty - p.gy, p.gtz - p.gz), b = norm(prev.gtx - prev.gx, prev.gty - prev.gy, prev.gtz - prev.gz);
        const ang = Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) * RAD / h;
        m.turn = Math.max(m.turn, ang);
      }
    }
    prev = p; prevT = t;
  }
  m.fail = [];
  if (m.yaw > LIMITS.yaw + 1e-6) m.fail.push(`yaw ${m.yaw.toFixed(2)}`);
  if (m.pitch > LIMITS.pitch + 1e-6) m.fail.push(`pitch ${m.pitch.toFixed(2)}`);
  if (m.roll > LIMITS.roll + 1e-9) m.fail.push(`roll ${m.roll}`);
  if (m.flow > LIMITS.flow + 1e-9) m.fail.push(`flow ${m.flow.toFixed(3)}`);
  if (m.zoom > LIMITS.zoom + 1e-9) m.fail.push(`zoom ${m.zoom.toFixed(3)}`);
  if (m.turn > LIMITS.turn + 1e-6) m.fail.push(`globe turn ${m.turn.toFixed(1)}`);
  if (heightAt && m.clearance < LIMITS.clearance) m.fail.push(`clearance ${m.clearance.toFixed(0)} m`);
  m.warn = [];
  if (!ZOOM_SCENES.has(sceneId) && m.yaw > COMFORT.TARGET_YAW_DEG_S + 1e-6) m.warn.push(`yaw above the ${COMFORT.TARGET_YAW_DEG_S} deg/s target`);
  return m;
}
function norm(x, y, z) { const L = Math.hypot(x, y, z) || 1; return [x / L, y / L, z / L]; }

function run(heightAt, label) {
  const place = placeFile();
  const rows = [];
  const notes = new Set();
  // The descend starts from the home view. If the globe has drifted, the app first turns it back
  // (globeTurnPlan); check that turn from the far side and the descend from the home view.
  const lon = (place && place.lon) || -112.1081;
  const far = globeTurnPlan(-10, lon + 178, lon);
  const farRate = far.dur > 0 ? (1.5 * far.deg) / far.dur : 0;
  notes.add(`globe pre-turn from the far side: ${far.deg.toFixed(0)} deg in ${far.dur.toFixed(1)} s, peak ${farRate.toFixed(1)} deg/s (smoothstep)`);
  if (farRate > LIMITS.turn + 1e-6) rows.push({ scene: 'pre-turn', variant: 'far side', dur: far.dur, yaw: 0, pitch: 0, roll: 0, flow: 0, zoom: 0, turn: farRate, clearance: Infinity, fail: [`globe turn ${farRate.toFixed(1)}`], warn: [] });
  // the home globe distance depends on the layout: 3.15 radii by default, up to 9 on a phone in
  // portrait (main.js layoutHome clamps fitDist to 2.2..9). The descend starts from there.
  const starts = [
    { name: 'home view', gs: null },
    { name: 'phone 9R', gs: { lat: GLOBE.HOME_LAT, lon: lon + GLOBE.HOME_LON_OFFSET, dist: 9 } },
    { name: 'wide 2.2R', gs: { lat: GLOBE.HOME_LAT, lon: lon + GLOBE.HOME_LON_OFFSET, dist: 2.2 } },
  ];
  for (const st of starts) {
    // landscape screens fly the flatter wide pitch (descend, wide and approach depend on it)
    for (const wp of [WIDE.PITCH_DEG, WIDE.PITCH_LANDSCAPE_DEG]) {
      const land = wp === WIDE.PITCH_LANDSCAPE_DEG;
      const ctx = makePathContext({ place, heightAt, globeStart: st.gs, widePitch: wp });
      ctx.notes.forEach((x) => notes.add(x));
      for (const id of SCENE_ORDER) {
        if (land && !['descend', 'wide', 'approach'].includes(id)) continue;
        if (id === 'descend' || st.name === 'home view') {
          const m = measure(id, ctx, heightAt, label);
          m.variant = (id === 'descend' ? st.name : '') + (land ? (id === 'descend' ? ' L' : 'landscape') : '');
          rows.push(m);
        }
      }
      if (st.name === 'home view' && land) {
        const A = ctx.approach;
        notes.add(`landscape (wide pitch ${wp}): approach ends ${(A.end.y - A.riverY).toFixed(0)} m above the river, needs ${A.total.toFixed(0)} s of ${A.span.toFixed(0)} s`);
      }
    }
    const ctx = makePathContext({ place, heightAt, globeStart: st.gs });
    if (st.name === 'home view') {
      for (const sa of standArcs()) {
        const m = measure('stand', ctx, heightAt, label, { arc: sa.arc });
        m.variant = sa.name;
        rows.push(m);
        notes.add(`stand ${sa.name}: view centre must stay in [${sa.arc[0].toFixed(0)}, ${sa.arc[1].toFixed(0)}] deg; sweep covers ${m.yawMin.toFixed(0)}..${m.yawMax.toFixed(0)} deg, peak ${m.yaw.toFixed(2)} deg/s`);
        if (m.yawMin < Math.min(sa.arc[0], 0) - 0.5 || m.yawMax > Math.max(sa.arc[1], 0) + 0.5) m.fail.push('stand sweep leaves the canyon arc');
      }
    }
    if (st.name === 'home view') {
      const A = ctx.approach;
      notes.add(`wide orbit: ${(ctx.wide.w * RAD).toFixed(2)} deg/s, ${Math.abs(ctx.wide.a1 - ctx.wide.a0).toFixed(0)} deg in ${ctx.dur.wide} s, min height above ground ${ctx.wide.minHagl.toFixed(0)} m`);
      notes.add(`approach: end ${A.end.r} m from the target at ${A.end.y.toFixed(0)} m (river ${A.riverY.toFixed(0)} m -> ${(A.end.y - A.riverY).toFixed(0)} m above), view of the river ${A.end.los ? 'clear' : 'blocked'}, needs ${A.total.toFixed(0)} s of ${A.span.toFixed(0)} s`);
      notes.add(`daylapse: camera ${ctx.daylapse.y.toFixed(0)} m, heading ${ctx.daylapse.heading.toFixed(0)}, pitch ${ctx.daylapse.pitch.toFixed(1)}`);
    }
  }
  return { label, rows, notes: [...notes] };
}

// Look-around return (look.js): after release the offset eases back with a cosine whose peak rate is
// offset * pi / (2T); big offsets dip to dark instead. Check the worst cases stay under the limits.
function lookReturnRows() {
  const out = [];
  for (const [yaw, pitch, fov] of [[15, 0, 0], [40, 0, 0], [45, 22, 0], [90, 0, 0], [170, 50, 12], [0, 20, 0], [0, 0, -18], [0, 0, 12]]) {
    const T = returnTime(yaw, pitch, fov);
    const snap = T > LOOK_SNAP_S;
    const k = Math.PI / (2 * T);
    out.push({ yaw, pitch, fov, T, snap, yawRate: snap ? 0 : yaw * k, pitchRate: snap ? 0 : Math.max(pitch, Math.abs(fov)) * k });
  }
  return out;
}
const results = [];
const synth = { fn: proceduralHeight, label: 'synthetic heightAt (procedural canyon)' };
if (demMode === 'synthetic' || demMode === 'both') results.push(run(synth.fn, synth.label));
if (demMode === 'real' || demMode === 'both') {
  const real = realHeightAt();
  if (real) {
    const r = run(real.fn, real.label);
    r.checks = real.checks;
    results.push(r);
  } else {
    console.log(`real DEM not found under site/data/grand-canyon/terrain${demMode === 'real' ? '' : ' (skipped)'}`);
    if (demMode === 'real') process.exit(2);
  }
}

let failed = 0;
if (asJson) {
  console.log(JSON.stringify(results, null, 1));
  failed = results.some((r) => r.rows.some((m) => m.fail.length));
} else {
  const f = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '-');
  console.log(`limits: yaw <= ${LIMITS.yaw} deg/s (target ${COMFORT.TARGET_YAW_DEG_S}), pitch <= ${LIMITS.pitch} deg/s, roll = 0, flow <= ${LIMITS.flow} rad/s (cruise), zoom <= ${LIMITS.zoom}/s (descend/ascend), globe turn <= ${LIMITS.turn} deg/s, clearance >= ${LIMITS.clearance} m; ${HZ} Hz`);
  for (const r of results) {
    console.log(`\n== ${r.label}`);
    if (r.checks && r.checks.length) {
      for (const c of r.checks) console.log(`   check ${c.name}: meta ${c.expected} m, decoded ${c.got} m`);
    }
    console.log('scene      variant     dur   yaw°/s  pitch°/s roll  flow    zoom/s  turn°/s  clear m   result');
    for (const m of r.rows) {
      const flow = ZOOM_SCENES.has(m.scene) ? `(${f(m.flowInfo, 3)})` : f(m.flow, 3);
      const res = m.fail.length ? 'FAIL ' + m.fail.join(', ') : 'ok' + (m.warn.length ? ' (' + m.warn.join('; ') + ')' : '');
      if (m.fail.length) failed++;
      console.log(`${m.scene.padEnd(10)} ${(m.variant || '').padEnd(10)} ${String(m.dur).padStart(4)}  ${f(m.yaw).padStart(6)}  ${f(m.pitch).padStart(7)}  ${String(m.roll).padStart(4)}  ${flow.padStart(7)}  ${f(m.zoom, 3).padStart(6)}  ${f(m.turn, 1).padStart(6)}  ${(Number.isFinite(m.clearance) ? m.clearance.toFixed(0) : '-').padStart(7)}   ${res}`);
    }
    for (const n of r.notes) console.log('  - ' + n);
  }
  console.log('\n== look-around return after release (look.js returnTime)');
  for (const L of lookReturnRows()) {
    const bad = L.yawRate > LIMITS.yaw * 0.9 + 1e-6 || L.pitchRate > LIMITS.pitch * 0.9 + 1e-6;
    if (bad) failed++;
    console.log(`   offset yaw ${String(L.yaw).padStart(3)}, pitch ${String(L.pitch).padStart(2)}, fov ${String(L.fov).padStart(3)}: ${L.snap ? `dark dip (a return would take ${L.T.toFixed(1)} s)` : `return ${L.T.toFixed(1)} s, peak yaw ${L.yawRate.toFixed(2)} deg/s, pitch/fov ${L.pitchRate.toFixed(2)} deg/s`}${bad ? '  FAIL' : ''}`);
  }
  console.log(`\nflow in parentheses = descend/ascend zoom moves along the line of sight; checked with the zoom limit instead (see config.js COMFORT.ZOOM_MAX_PER_S).`);
  console.log(failed ? `\n${failed} scene(s) exceed a limit` : '\nall scenes within limits');
}
process.exit(failed ? 1 : 0);
