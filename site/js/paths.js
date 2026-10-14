// Scripted camera paths. PURE: no DOM, no three.js; importable from Node (tools/check_paths.mjs).
//
// pose(sceneId, t, ctx, out) fills `out` with the camera pose for scene time t (seconds):
//   space 'terrain': x, y, z (local metres), tx, ty, tz (look-at), heading, pitch, roll, fov
//   space 'globe'  : gx, gy, gz (globe units, Earth radius 1), gtx, gty, gtz, ux, uy, uz (up),
//                    altM, heading, pitch, roll, fov
//   space 'pano'   : yaw (deg, + = turn right, relative to the photo's initial view), pitch, fov
//   always         : cloud (0..1 cloud overlay), fade (0..1 dark fade), cut (pose may jump here)
//
// Local frame (contract): x east, z south (north = -z), y metres above sea level.
// Globe frame: unit sphere, +y = north pole, lon 0 -> +x, lon 90E -> -z (matches SphereGeometry UVs).
import {
  COMFORT, SCENE_DUR, DESCEND, ASCEND, WIDE, APPROACH, STAND, DAYLAPSE, CAMERA, DEFAULT_HINTS,
  EARTH_R_M, GLOBE, PANO_AUTO_YAW_DEG_S, PANO_PITCH_DEG, FADE_S,
} from './config.js';
import {
  clamp, lerp, smoothstep, smootherstep, easedTime, easedSpan, llToLocal, localToLl,
  headingPitch, dirFromHP, DEG, RAD, wrap180, wrap360,
} from './util.js';
import { sunPosition } from './sun.js';

const E = COMFORT.EASE_S;
const FLOW = COMFORT.MAX_FLOW * COMFORT.FLOW_MARGIN;

// ------------------------------------------------------------------ terrain sampling helpers
const DEFAULT_GROUND = 2600; // conservative plateau height when no heightAt is given
const DEFAULT_RIVER = 750;

function hAt(ctx, x, z) {
  if (!ctx.heightAt) return DEFAULT_GROUND;
  const h = ctx.heightAt(x, z);
  return Number.isFinite(h) ? h : DEFAULT_GROUND;
}
const RING_DIRS = 12;
// max terrain height within radius r (centre + two rings)
export function maxAround(ctx, x, z, r) {
  let m = hAt(ctx, x, z);
  for (let ring = 1; ring <= 2; ring++) {
    const rr = (r * ring) / 2;
    for (let k = 0; k < RING_DIRS; k++) {
      const a = (k / RING_DIRS) * Math.PI * 2 + ring * 0.26;
      const h = hAt(ctx, x + Math.cos(a) * rr, z + Math.sin(a) * rr);
      if (h > m) m = h;
    }
  }
  return m;
}
function minAround(ctx, x, z, r) {
  let m = hAt(ctx, x, z);
  for (let ring = 1; ring <= 3; ring++) {
    const rr = (r * ring) / 3;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const h = hAt(ctx, x + Math.cos(a) * rr, z + Math.sin(a) * rr);
      if (h < m) m = h;
    }
  }
  return m;
}
// Height the camera must stay above at (x, z): any terrain within 350 m horizontally must be
// at least MIN_CLEARANCE below, which guarantees a 3D clearance >= MIN_CLEARANCE.
function floorAt(ctx, x, z) {
  return maxAround(ctx, x, z, 350) + COMFORT.MIN_CLEARANCE_M + 25;
}
// 3D distance from a point to the sampled terrain (exported for the checker). Negative if below.
export function clearance3D(heightAt, x, y, z, radius = 700) {
  const h0 = heightAt(x, z);
  if (!Number.isFinite(h0)) return Infinity;
  if (y <= h0) return y - h0;
  let best = y - h0;
  for (let rr = 40; rr <= radius; rr += rr < 200 ? 40 : 80) {
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const h = heightAt(x + Math.cos(a) * rr, z + Math.sin(a) * rr);
      if (!Number.isFinite(h)) continue;
      // terrain higher than the camera at this horizontal distance: a wall is at most rr away
      const d = y < h ? rr : Math.hypot(rr, y - h);
      if (d < best) best = d;
    }
  }
  return best;
}
function softMax(a, b, k) {
  return (a + b + Math.sqrt((a - b) * (a - b) + k * k)) / 2;
}
function lineClear(ctx, ax, ay, az, bx, by, bz, margin) {
  const n = 40;
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const x = lerp(ax, bx, t), y = lerp(ay, by, t), z = lerp(az, bz, t);
    if (hAt(ctx, x, z) > y - margin) return false;
  }
  return true;
}

// ------------------------------------------------------------------ globe helpers
export function ecef(lat, lon, out = {}) {
  const la = lat * DEG, lo = lon * DEG;
  out.x = Math.cos(la) * Math.cos(lo);
  out.y = Math.sin(la);
  out.z = -Math.cos(la) * Math.sin(lo);
  return out;
}
export function ecefToLl(x, y, z, out = {}) {
  const r = Math.hypot(x, y, z) || 1;
  out.lat = Math.asin(clamp(y / r, -1, 1)) * RAD;
  out.lon = Math.atan2(-z, x) * RAD;
  return out;
}
// Great-circle destination (deg) from (lat, lon), bearing deg, distance m.
function destination(lat, lon, bearingDeg, distM, out = {}) {
  const d = distM / EARTH_R_M, b = bearingDeg * DEG, la = lat * DEG, lo = lon * DEG;
  const la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(b));
  const lo2 = lo + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2));
  out.lat = la2 * RAD;
  out.lon = lo2 * RAD;
  return out;
}
function slerpUnit(a, b, t, out) {
  const dot = clamp(a.x * b.x + a.y * b.y + a.z * b.z, -1, 1);
  const om = Math.acos(dot);
  if (om < 1e-6) { out.x = b.x; out.y = b.y; out.z = b.z; return out; }
  const s = Math.sin(om);
  const k0 = Math.sin((1 - t) * om) / s, k1 = Math.sin(t * om) / s;
  out.x = a.x * k0 + b.x * k1; out.y = a.y * k0 + b.y * k1; out.z = a.z * k0 + b.z * k1;
  return out;
}
export function angleBetweenDeg(a, b) {
  return Math.acos(clamp(a.x * b.x + a.y * b.y + a.z * b.z, -1, 1)) * RAD;
}
function northTangent(p, out) {
  // projection of the pole axis onto the tangent plane at unit vector p
  const k = p.y;
  out.x = -p.x * k; out.y = 1 - p.y * k; out.z = -p.z * k;
  const L = Math.hypot(out.x, out.y, out.z) || 1;
  out.x /= L; out.y /= L; out.z /= L;
  return out;
}

// Before a descend, the home globe turns so the place sits where the descend expects it
// (GLOBE.HOME_LAT, place lon + HOME_LON_OFFSET). Turn duration keeps the rate under the ceiling.
export function globeTurnPlan(fromLat, fromLon, placeLon) {
  const a = ecef(fromLat, fromLon, {});
  const toLat = GLOBE.HOME_LAT, toLon = placeLon + GLOBE.HOME_LON_OFFSET;
  const b = ecef(toLat, toLon, {});
  const deg = angleBetweenDeg(a, b);
  const dur = deg < 0.5 ? 0 : Math.max(0.8, (deg * 1.5) / (COMFORT.GLOBE_TURN_MAX_DEG_S * 0.95));
  return { deg, dur, to: { lat: toLat, lon: toLon }, from: { lat: fromLat, lon: fromLon } };
}
// Sub-point along that turn at fraction u (0..1, eased by the caller).
export function globeTurnAt(plan, u, out = {}) {
  const a = ecef(plan.from.lat, plan.from.lon, {}), b = ecef(plan.to.lat, plan.to.lon, {});
  const s = slerpUnit(a, b, u, {});
  return ecefToLl(s.x, s.y, s.z, out);
}

// Home globe camera: sub-point (lat, lon), distance from the centre in Earth radii.
export function homeGlobePose(lat, lon, dist, out = {}) {
  const p = ecef(lat, lon, {});
  out.space = 'globe';
  out.gx = p.x * dist; out.gy = p.y * dist; out.gz = p.z * dist;
  out.gtx = 0; out.gty = 0; out.gtz = 0;
  const n = northTangent(p, {});
  out.ux = n.x; out.uy = n.y; out.uz = n.z;
  out.altM = (dist - 1) * EARTH_R_M;
  out.heading = 0; out.pitch = -90; out.roll = 0; out.fov = GLOBE.FOV;
  out.cloud = 0; out.fade = 0; out.cut = false;
  return out;
}

// ------------------------------------------------------------------ context
const ll = (o) => (o && Number.isFinite(o.lat) && Number.isFinite(o.lon) ? o : null);

// widePitch: the orbit's pitch (deg). Landscape screens look flatter (-18) so the sky shows above
// the far rim; portrait screens keep -25 (their taller field of view already shows the sky).
export function makePathContext({ place = null, heightAt = null, globeStart = null, durations = null, widePitch = WIDE.PITCH_DEG } = {}) {
  const cam = (place && place.camera) || {};
  const pick = (k) => ll(cam[k]) || DEFAULT_HINTS[k];
  const wf = pick('wide_focus');
  const at = pick('approach_target');
  const st = pick('stand');
  const df = pick('daylapse_from');
  const look = ll(cam.daylapse_from && cam.daylapse_from.look_at) || DEFAULT_HINTS.daylapse_from.look_at;
  const dur = { ...SCENE_DUR };
  if (place && Array.isArray(place.scenes)) {
    for (const s of place.scenes) if (s && dur[s.id] !== undefined && Number.isFinite(s.dur_s) && s.dur_s > 5) dur[s.id] = s.dur_s;
  }
  if (durations) Object.assign(dur, durations);
  const placeLat = (place && Number.isFinite(place.lat)) ? place.lat : wf.lat;
  const placeLon = (place && Number.isFinite(place.lon)) ? place.lon : wf.lon;
  const ctx = {
    dur, heightAt,
    hasTerrain: !!heightAt,
    widePitch,
    hintsLL: { wide_focus: wf, approach_target: at, stand: st, daylapse_from: df, look_at: look },
    placeLL: { lat: placeLat, lon: placeLon },
    F: llToLocal(wf.lat, wf.lon),
    T: llToLocal(at.lat, at.lon),
    D: llToLocal(df.lat, df.lon),
    DL: llToLocal(look.lat, look.lon),
    globeStart: globeStart || { lat: GLOBE.HOME_LAT, lon: placeLon + GLOBE.HOME_LON_OFFSET, dist: GLOBE.HOME_DIST },
    notes: [],
  };
  ctx.wide = buildWide(ctx);
  ctx.descend = buildDescend(ctx);
  ctx.approach = buildApproach(ctx);
  ctx.daylapse = buildDaylapse(ctx);
  ctx.ascend = buildAscend(ctx);
  ctx.standTerrain = buildStandTerrain(ctx);
  return ctx;
}

// Rebuild only the descend plan (cheap) when the home globe has moved.
export function withGlobeStart(ctx, globeStart) {
  ctx.globeStart = globeStart;
  ctx.descend = buildDescend(ctx);
  return ctx;
}

// ------------------------------------------------------------------ wide orbit
function buildWide(ctx) {
  const r = WIDE.RADIUS_M, alt = WIDE.ALT_M;
  const lookY = alt - r * Math.tan(-ctx.widePitch * DEG);
  // slowest allowed angular speed over the whole circle (flow = r*w / height above ground)
  let minHagl = Infinity;
  for (let k = 0; k < 72; k++) {
    const a = (k / 72) * 360;
    const x = ctx.F.x + r * Math.sin(a * DEG), z = ctx.F.z - r * Math.cos(a * DEG);
    minHagl = Math.min(minHagl, alt - maxAround(ctx, x, z, 300));
  }
  minHagl = Math.max(minHagl, 300);
  let w = (FLOW * minHagl) / r; // rad/s
  w = Math.min(w, WIDE.MAX_DEG_S * DEG, COMFORT.TARGET_YAW_DEG_S * 0.9 * DEG);
  const span = easedSpan(ctx.dur.wide, E);
  const a0 = WIDE.START_AZ_DEG;
  const a1 = a0 + WIDE.DIR * w * RAD * span;
  return { r, alt, lookY, w, a0, a1, minHagl, span };
}
function widePose(t, ctx, out) {
  const W = ctx.wide;
  const a = W.a0 + WIDE.DIR * W.w * RAD * easedTime(t, ctx.dur.wide, E);
  terrainOut(out, ctx.F.x + W.r * Math.sin(a * DEG), W.alt, ctx.F.z - W.r * Math.cos(a * DEG),
    ctx.F.x, W.lookY, ctx.F.z, CAMERA.FOV);
  return out;
}

// ------------------------------------------------------------------ descend (globe -> terrain)
function buildDescend(ctx) {
  const T = ctx.dur.descend;
  const W = ctx.wide;
  const target = localToLl(ctx.F.x, ctx.F.z);
  const tUnit = ecef(target.lat, target.lon, {});
  const gs = ctx.globeStart;
  const sHome = ecef(gs.lat, gs.lon, {});
  const turnDeg = angleBetweenDeg(sHome, tUnit);
  // the camera swings over the place while the view moves from the globe centre to the place;
  // both rotate the view the same way, so budget for the sum
  const turnS = clamp(((turnDeg + 15) * 1.5) / (COMFORT.GLOBE_TURN_MAX_DEG_S * 0.85), 4, DESCEND.TURN_MAX_S);
  const pitchStart = Math.max(DESCEND.PITCH_START_S, Math.min(turnS, 8));
  const alt0 = Math.max((gs.dist - 1) * EARTH_R_M, 1e6);
  return {
    T, target, tUnit, sHome, turnDeg, turnS, pitchStart,
    lnAlt0: Math.log(alt0), lnAlt1: Math.log(W.alt), lookY: W.lookY,
    swap: DESCEND.GLOBE_END_S,
  };
}
// Ease at one end only (0..1 over [0, T]).
const easeInOnly = (t, T) => easedTime(clamp(t, 0, T), 2 * T, E) / easedTime(T, 2 * T, E);
const easeOutOnly = (t, T) => 1 - easeInOnly(T - clamp(t, 0, T), T);
// Two constant zoom rates: globe part reaches START_ALT_M at the swap (under the clouds), then the
// terrain part settles onto the orbit. Rates are constant in log altitude (steady looming).
function descendAlt(t, ctx) {
  const P = ctx.descend;
  const t0 = DESCEND.ZOOM_START_S, sw = P.swap;
  const lnMid = Math.log(DESCEND.START_ALT_M);
  if (t <= t0) return Math.exp(P.lnAlt0);
  if (t < sw) return Math.exp(lerp(P.lnAlt0, lnMid, easeInOnly(t - t0, sw - t0)));
  return Math.exp(lerp(lnMid, P.lnAlt1, easeOutOnly(t - sw, P.T - sw)));
}
function descendPitch(t, ctx) {
  const P = ctx.descend;
  return -90 + (90 + ctx.widePitch) * smoothstep(P.pitchStart, P.T, t);
}
const _g = { a: {}, b: {}, c: {}, n: {}, r: {}, ll: {} };
function descendPose(t, ctx, out) {
  const P = ctx.descend;
  const alt = descendAlt(t, ctx);
  const pitch = descendPitch(t, ctx);
  const dH = (alt - P.lookY) / Math.tan(-pitch * DEG); // horizontal distance camera -> look-at
  const cloud = t < P.swap
    ? smoothstep(DESCEND.CLOUD_IN[0], DESCEND.CLOUD_IN[1], t)
    : 1 - smoothstep(DESCEND.CLOUD_OUT[0], DESCEND.CLOUD_OUT[1], t);
  if (t >= P.swap) {
    // terrain phase: look at the wide-orbit centre from the south (heading 0)
    terrainOut(out, ctx.F.x, alt, ctx.F.z + dH, ctx.F.x, P.lookY, ctx.F.z, CAMERA.FOV);
    out.pitch = pitch;
    out.cloud = cloud;
    return out;
  }
  out.cloud = cloud;
  out.fade = 0;
  out.cut = false;
  // globe phase
  const turn = smoothstep(0, P.turnS, t);
  const sub = destination(P.target.lat, P.target.lon, 180, dH, _g.ll);
  const sEnd = ecef(sub.lat, sub.lon, _g.a);
  const s = slerpUnit(P.sHome, sEnd, turn, _g.b);
  const rad = 1 + alt / EARTH_R_M;
  out.space = 'globe';
  out.gx = s.x * rad; out.gy = s.y * rad; out.gz = s.z * rad;
  const lookR = 1 + P.lookY / EARTH_R_M;
  const w = turn;
  out.gtx = P.tUnit.x * lookR * w; out.gty = P.tUnit.y * lookR * w; out.gtz = P.tUnit.z * lookR * w;
  // up: cos(p) * radial - sin(p) * north   (heading 0)
  const n = northTangent(s, _g.n);
  const cp = Math.cos(pitch * DEG), sp = Math.sin(pitch * DEG);
  out.ux = cp * s.x - sp * n.x; out.uy = cp * s.y - sp * n.y; out.uz = cp * s.z - sp * n.z;
  out.altM = alt;
  out.heading = 0; out.pitch = pitch; out.roll = 0; out.fov = GLOBE.FOV + (CAMERA.FOV - GLOBE.FOV) * smoothstep(8, P.swap, t);
  return out;
}

// ------------------------------------------------------------------ approach (spiral down to the story spot)
function bezier(p0, p1, p2, p3, t, out) {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  out.x = a * p0.x + b * p1.x + c * p2.x + d * p3.x;
  out.z = a * p0.z + b * p1.z + c * p2.z + d * p3.z;
  return out;
}
function buildApproach(ctx) {
  const W = ctx.wide;
  const aEnd = W.a1;
  const P0 = { x: ctx.F.x + W.r * Math.sin(aEnd * DEG), y: W.alt, z: ctx.F.z - W.r * Math.cos(aEnd * DEG) };
  const L0 = { x: ctx.F.x, y: W.lookY, z: ctx.F.z };
  const T = ctx.T;
  const riverY = ctx.heightAt ? minAround(ctx, T.x, T.z, 300) : DEFAULT_RIVER;
  const look = { x: T.x, y: riverY + APPROACH.LOOK_ABOVE_RIVER_M, z: T.z };
  const yWant = riverY + APPROACH.END_ABOVE_RIVER_M;
  const yHi = riverY + APPROACH.END_ABOVE_RIVER_RANGE[1];
  const b0 = wrap360(Math.atan2(P0.x - T.x, -(P0.z - T.z)) * RAD);
  const span = easedSpan(ctx.dur.approach, E);
  // 1. candidate end points: open air (floor rule), inside the 900-1200 m band, clear view down
  const cands = [];
  for (const r of APPROACH.END_RADIUS_M) {
    for (let a = 0; a < 360; a += 10) {
      const x = T.x + r * Math.sin(a * DEG), z = T.z - r * Math.cos(a * DEG);
      const y = Math.max(yWant, floorAt(ctx, x, z) + 30);
      if (ctx.heightAt && y > yHi) continue;
      const los = !ctx.heightAt || lineClear(ctx, x, y, z, look.x, look.y, look.z, 25);
      const hEnd = Math.max(80, y - maxAround(ctx, x, z, 150));
      const dH = Math.hypot(x - P0.x, z - P0.z);
      const est = dH / (FLOW * 2500) + Math.log(Math.max(1.01, 3000 / hEnd)) / FLOW;
      cands.push({ x, y, z, a, r, los, est, score: est + (los ? 0 : 60) + Math.abs(wrap180(a - b0)) * 0.05 });
    }
  }
  cands.sort((p, q) => p.score - q.score);
  const pickList = [];
  for (const c of cands) {
    if (pickList.length >= 6) break;
    if (pickList.every((q) => Math.hypot(q.x - c.x, q.z - c.z) > 600)) pickList.push(c);
  }
  if (!pickList.length) {
    const r = APPROACH.END_RADIUS_M[1];
    const x = T.x + r * Math.sin(b0 * DEG), z = T.z - r * Math.cos(b0 * DEG);
    pickList.push({ x, y: Math.max(yWant, floorAt(ctx, x, z) + 30), z, a: b0, r, los: false, est: 0, score: 0 });
    ctx.notes.push('approach: no end point inside 900-1200 m above the river; ended higher');
  }
  // 2. build full paths for the best few (two descent profiles each), keep the one that fits best
  let best = null;
  for (const c of pickList) {
    for (const prof of [[0.12, 0.96], [0.3, 0.99]]) {
      for (const arc of [APPROACH.END_ARC_DEG, APPROACH.END_ARC_DEG / 2]) {
        const path = approachPath(ctx, P0, L0, look, c, aEnd, prof, arc);
        const fits = path.total <= span;
        const rank = (fits ? 0 : 1000 + path.total - span) + (c.los ? 0 : 50) + (arc < APPROACH.END_ARC_DEG ? 8 : 0) + path.total * 0.05;
        if (!best || rank < best.rank) best = { ...path, rank, cand: c };
        if (fits) break;
      }
    }
  }
  if (best.total > span) ctx.notes.push(`approach: path needs ${best.total.toFixed(0)} s at the comfort limits, ${span.toFixed(0)} s available; it stops early`);
  return { ...best, P0, L0, look, riverY, end: best.cand, span, scale: Math.max(1, best.total / span) };
}
function approachPath(ctx, P0, L0, look, best, aEnd, prof, arcDeg) {
  const T = ctx.T;
  // final arc keeps orbiting the spot in the orbit's direction; flip if the other way is clearer
  const arcFloor = (sense) => {
    let m = -Infinity;
    for (let k = 0; k <= 8; k++) {
      const a = best.a + sense * arcDeg * (k / 8);
      m = Math.max(m, floorAt(ctx, T.x + best.r * Math.sin(a * DEG), T.z - best.r * Math.cos(a * DEG)));
    }
    return m;
  };
  let sense = WIDE.DIR;
  if (arcFloor(sense) > best.y && arcFloor(-sense) < arcFloor(sense)) sense = -sense;
  // horizontal Bezier from P0 (leaving along the orbit tangent) to the end point (arriving along the arc)
  const dist = Math.hypot(best.x - P0.x, best.z - P0.z);
  const tan0 = { x: WIDE.DIR * Math.cos(aEnd * DEG), z: WIDE.DIR * Math.sin(aEnd * DEG) };
  const tanE = { x: sense * Math.cos(best.a * DEG), z: sense * Math.sin(best.a * DEG) };
  const B0 = { x: P0.x, z: P0.z }, B3 = { x: best.x, z: best.z };
  const B1 = { x: P0.x + tan0.x * dist * 0.38, z: P0.z + tan0.z * dist * 0.38 };
  const B2 = { x: best.x - tanE.x * dist * 0.38, z: best.z - tanE.z * dist * 0.38 };

  const N1 = 900, N2 = 240, N = N1 + N2;
  const px = new Float64Array(N + 1), py = new Float64Array(N + 1), pz = new Float64Array(N + 1);
  const lx = new Float64Array(N + 1), ly = new Float64Array(N + 1), lz = new Float64Array(N + 1);
  const floor = new Float64Array(N + 1);
  const tmp = {};
  for (let i = 0; i <= N; i++) {
    if (i <= N1) {
      const u = i / N1;
      bezier(B0, B1, B2, B3, u, tmp);
      px[i] = tmp.x; pz[i] = tmp.z;
      py[i] = lerp(P0.y, best.y, smootherstep(prof[0], prof[1], u));
      const k = smootherstep(0.08, 0.8, u);
      lx[i] = lerp(L0.x, look.x, k); ly[i] = lerp(L0.y, look.y, k); lz[i] = lerp(L0.z, look.z, k);
    } else {
      const u = (i - N1) / N2;
      const a = best.a + sense * arcDeg * u;      px[i] = T.x + best.r * Math.sin(a * DEG); pz[i] = T.z - best.r * Math.cos(a * DEG);
      py[i] = best.y;
      lx[i] = look.x; ly[i] = look.y; lz[i] = look.z;
    }
    floor[i] = floorAt(ctx, px[i], pz[i]);
  }
  // smooth floor (moving max, then moving average keeps it >= the raw floor)
  const fmax = movingMax(floor, 18);
  const fs = movingAvg(fmax, 18);
  for (let i = 0; i <= N; i++) py[i] = softMax(py[i], fs[i], 80);
  // time cost per segment: slowest of flow, yaw and pitch limits
  const hp0 = {}, hp1 = {};
  const cost = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const ds = Math.hypot(px[i + 1] - px[i], py[i + 1] - py[i], pz[i + 1] - pz[i]);
    const hagl = Math.max(60, py[i] - maxAround(ctx, px[i], pz[i], 150));
    headingPitch(lx[i] - px[i], ly[i] - py[i], lz[i] - pz[i], hp0);
    headingPitch(lx[i + 1] - px[i + 1], ly[i + 1] - py[i + 1], lz[i + 1] - pz[i + 1], hp1);
    const dYaw = Math.abs(wrap180(hp1.heading - hp0.heading));
    const dPitch = Math.abs(hp1.pitch - hp0.pitch);
    cost[i] = Math.max(ds / (FLOW * hagl), dYaw / (COMFORT.TARGET_YAW_DEG_S * 0.85), dPitch / (COMFORT.MAX_PITCH_DEG_S * 0.6), 1e-4);
  }
  const cs = movingAvg(movingMax(cost, 20), 20); // same window: the average stays >= every raw cost
  const cum = new Float64Array(N + 1);
  for (let i = 0; i < N; i++) cum[i + 1] = cum[i] + cs[i];
  return { sense, px, py, pz, lx, ly, lz, cum, total: cum[N], N, arcDeg, prof };
}
function movingMax(a, w) {
  const n = a.length, o = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let m = -Infinity;
    for (let j = Math.max(0, i - w); j <= Math.min(n - 1, i + w); j++) if (a[j] > m) m = a[j];
    o[i] = m;
  }
  return o;
}
function movingAvg(a, w) {
  const n = a.length, o = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0, c = 0;
    for (let j = Math.max(0, i - w); j <= Math.min(n - 1, i + w); j++) { s += a[j]; c++; }
    o[i] = s / c;
  }
  return o;
}
function approachPose(t, ctx, out) {
  const A = ctx.approach;
  const tau = easedTime(t, ctx.dur.approach, E);
  // progress in "cost seconds": either everything slowed to fit, or limits respected and stop early
  const c = A.total <= A.span ? (tau / A.span) * A.total : tau;
  // binary search
  let lo = 0, hi = A.N;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (A.cum[mid] <= c) lo = mid; else hi = mid;
  }
  const seg = A.cum[lo + 1] - A.cum[lo];
  const f = seg > 0 ? clamp((c - A.cum[lo]) / seg, 0, 1) : 0;
  const i = lo, j = Math.min(lo + 1, A.N);
  terrainOut(out,
    lerp(A.px[i], A.px[j], f), lerp(A.py[i], A.py[j], f), lerp(A.pz[i], A.pz[j], f),
    lerp(A.lx[i], A.lx[j], f), lerp(A.ly[i], A.ly[j], f), lerp(A.lz[i], A.lz[j], f), APPROACH.FOV);
  out.fade = smoothstep(ctx.dur.approach - FADE_S / 2, ctx.dur.approach, t);
  return out;
}

// ------------------------------------------------------------------ stand (360 photo)
// The automatic turn stays inside the photo's canyon arc. arc = [lo, hi]: the view-centre yaws
// (relative to the photo's initial view) that keep the whole frame on the canyon, from pano.json
// auto_arc_deg minus half the screen's horizontal field of view. The view starts on the initial
// view (0), turns right to the arc's right end and then back left, as far as the scene allows at
// no more than STAND.MAX_DEG_S (a sine: zero speed at the turning point, eased at both ends).
// Without an arc: the old steady turn to the right.
// View-centre range (relative yaws) for a photo whose canyon spans autoArcDeg = [from, to] in photo
// yaw (degrees from the left edge, `to` may exceed 360), seen with this horizontal field of view.
export function standArc(autoArcDeg, initialYawDeg, hfovDeg) {
  if (!Array.isArray(autoArcDeg) || autoArcDeg.length !== 2 || !Number.isFinite(initialYawDeg)) return null;
  let a = autoArcDeg[0], b = autoArcDeg[1];
  while (b <= a) b += 360;
  // express the arc around the initial view (the initial yaw may sit at either end of the wrap)
  let lo = a - initialYawDeg, hi = b - initialYawDeg;
  while (hi < 0) { lo += 360; hi += 360; }
  while (lo > 0) { lo -= 360; hi -= 360; }
  const half = (Number.isFinite(hfovDeg) ? hfovDeg : 90) / 2;
  return [lo + half, hi - half];
}
export function standYaw(t, T, arc) {
  if (!arc) return PANO_AUTO_YAW_DEG_S * easedTime(t, T, E);
  const lo = Math.min(arc[0], 0), hi = Math.max(arc[1], 0);
  const c = (lo + hi) / 2, A = (hi - lo) / 2;
  if (!(A > 0.5)) return 0;
  const span = easedSpan(T, E);
  const u = easedTime(t, T, E) / span;
  const phi0 = Math.asin(clamp(-c / A, -1, 1));
  const dphi = Math.min(1.5 * Math.PI - phi0, (STAND.MAX_DEG_S * span) / A);
  return c + A * Math.sin(phi0 + dphi * u);
}
function standPose(t, ctx, out, opts) {
  const T = ctx.dur.stand;
  out.space = 'pano';
  out.yaw = opts && opts.reducedMotion ? 0 : standYaw(t, T, opts && opts.arc);
  out.pitch = opts && Number.isFinite(opts.standPitch) ? opts.standPitch : PANO_PITCH_DEG;
  out.heading = out.yaw; out.roll = 0;
  out.fov = STAND.FOV;
  out.cloud = 0;
  out.fade = Math.max(1 - smoothstep(0, FADE_S / 2, t), smoothstep(T - FADE_S / 2, T, t));
  out.cut = t < 1e-9;
  return out;
}

// When the 360 photo is missing: hover off the viewpoint and pan slowly over the canyon.
function buildStandTerrain(ctx) {
  const st = ctx.hintsLL.stand;
  const S = llToLocal(st.lat, st.lon);
  const hp = headingPitch(ctx.F.x - S.x, 0, ctx.F.z - S.z, {});
  const y = Math.max((ctx.heightAt ? hAt(ctx, S.x, S.z) : 2150) + 160, floorAt(ctx, S.x, S.z) + 10);
  return { x: S.x, y, z: S.z, heading: hp.heading, pitch: -12 };
}
function standTerrainPose(t, ctx, out) {
  const P = ctx.standTerrain, T = ctx.dur.stand;
  const u = easedTime(t, T, E) / easedSpan(T, E);
  const hd = P.heading + (smootherstep(0, 1, u) - 0.5) * 30;
  const d = dirFromHP(hd, P.pitch, _g.r);
  terrainOut(out, P.x, P.y, P.z, P.x + d.x * 4000, P.y + d.y * 4000, P.z + d.z * 4000, STAND.FOV);
  out.fade = Math.max(1 - smoothstep(0, FADE_S / 2, t), smoothstep(T - FADE_S / 2, T, t));
  out.cut = t < 1e-9;
  return out;
}

// ------------------------------------------------------------------ daylapse (time runs, camera nearly still)
function buildDaylapse(ctx) {
  const D = ctx.D, L = ctx.DL;
  const lookY = ctx.heightAt ? hAt(ctx, L.x, L.z) + 120 : 1500;
  const dx = L.x - D.x, dz = L.z - D.z, dist = Math.hypot(dx, dz) || 1;
  const side = { x: -dz / dist, z: dx / dist }; // to the right of the view
  const half = DAYLAPSE.DOLLY_M / 2;
  const a = { x: D.x - side.x * half, z: D.z - side.z * half };
  const b = { x: D.x + side.x * half, z: D.z + side.z * half };
  let y = (ctx.heightAt ? hAt(ctx, D.x, D.z) : 2150) + DAYLAPSE.ABOVE_GROUND_M;
  for (let k = 0; k <= 10; k++) y = Math.max(y, floorAt(ctx, lerp(a.x, b.x, k / 10), lerp(a.z, b.z, k / 10)) + 10);
  const base = headingPitch(dx, lookY - y, dz, {});
  const lookDist = Math.hypot(dist, lookY - y);
  return { a, b, y, look: { x: L.x, y: lookY, z: L.z }, heading: base.heading, pitch: base.pitch, lookDist };
}
function daylapsePose(t, ctx, out) {
  const P = ctx.daylapse, T = ctx.dur.daylapse;
  const u = easedTime(t, T, E) / easedSpan(T, E);
  const s = smootherstep(0, 1, u);
  const x = lerp(P.a.x, P.b.x, s), z = lerp(P.a.z, P.b.z, s);
  const hd = P.heading + (s - 0.5) * DAYLAPSE.YAW_SWEEP_DEG;
  const d = dirFromHP(hd, P.pitch, _g.r);
  const L = P.lookDist;
  terrainOut(out, x, P.y, z, x + d.x * L, P.y + d.y * L, z + d.z * L, DAYLAPSE.FOV);
  out.fade = 1 - smoothstep(0, FADE_S / 2, t);
  out.cut = t < 1e-9;
  return out;
}

// Map daylapse scene time -> epoch ms. Runs from sunrise-30 min to civil dusk in RUN_S seconds,
// slower when the sun is low (golden hours). Returns a function (t) => ms.
export function makeDaylapseClock(sunriseMs, civilDuskMs, lat, lon, durS = SCENE_DUR.daylapse) {
  const t0 = sunriseMs - DAYLAPSE.BEFORE_SUNRISE_MIN * 60000;
  const t1 = civilDuskMs;
  const N = 400;
  const cum = new Float64Array(N + 1);
  const pos = {};
  for (let i = 0; i < N; i++) {
    const ms = lerp(t0, t1, (i + 0.5) / N);
    const el = sunPosition(ms, lat, lon, pos).elevation;
    const golden = Math.exp(-(((el - 4) / 7) ** 2));
    cum[i + 1] = cum[i] + 1 + DAYLAPSE.GOLDEN_SLOWDOWN * golden; // weight = screen seconds per slice
  }
  const run = Math.min(DAYLAPSE.RUN_S, durS - 2 * DAYLAPSE.HOLD_START_S);
  const hold = (durS - run) / 2;
  return (t) => {
    const u = clamp((t - hold) / run, 0, 1) * cum[N];
    let lo = 0, hi = N;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= u) lo = m; else hi = m; }
    const f = (u - cum[lo]) / Math.max(1e-9, cum[lo + 1] - cum[lo]);
    return lerp(t0, t1, (lo + clamp(f, 0, 1)) / N);
  };
}

// ------------------------------------------------------------------ ascend (terrain -> globe)
function buildAscend(ctx) {
  const target = { lat: ctx.placeLL.lat, lon: ctx.placeLL.lon };
  const home = { lat: GLOBE.HOME_LAT, lon: ctx.placeLL.lon + GLOBE.HOME_LON_OFFSET };
  return {
    target, home, tUnit: ecef(target.lat, target.lon, {}), hUnit: ecef(home.lat, home.lon, {}),
    lnAlt0: Math.log(ASCEND.GLOBE_START_ALT_M), lnAlt1: Math.log((GLOBE.HOME_DIST - 1) * EARTH_R_M),
  };
}
function ascendPose(t, ctx, out, from) {
  const A = ctx.ascend, T = ctx.dur.ascend;
  const sw = ASCEND.TERRAIN_END_S;
  const cloud = t < sw ? smoothstep(ASCEND.CLOUD_IN[0], ASCEND.CLOUD_IN[1], t) : 1 - smoothstep(ASCEND.CLOUD_OUT[0], ASCEND.CLOUD_OUT[1], t);
  if (t < sw) {
    // lift up and slightly back, keeping the view direction (clouds close in by TERRAIN_END_S)
    const f = from || daylapsePose(ctx.dur.daylapse, ctx, {});
    const d = dirFromHP(f.heading, 0, _g.c);
    const rise = 120 * (Math.exp(0.5 * easedTime(t, sw * 2, E)) - 1);
    const dx = f.tx - f.x, dy = f.ty - f.y, dz = f.tz - f.z;
    const x = f.x - d.x * rise * 0.5, y = f.y + rise, z = f.z - d.z * rise * 0.5;
    terrainOut(out, x, y, z, x + dx, y + dy, z + dz, f.fov);
    out.cloud = cloud;
    return out;
  }
  out.cloud = cloud;
  out.fade = 0;
  out.cut = false;
  const tg = t - sw, Tg = T - sw;
  const u = easedTime(tg, Tg, E) / easedSpan(Tg, E);
  const alt = Math.exp(lerp(A.lnAlt0, A.lnAlt1, u));
  const s = slerpUnit(A.tUnit, A.hUnit, smootherstep(0, 1, u), _g.b);
  const rad = 1 + alt / EARTH_R_M;
  const n = northTangent(s, _g.n);
  out.space = 'globe';
  out.gx = s.x * rad; out.gy = s.y * rad; out.gz = s.z * rad;
  out.gtx = 0; out.gty = 0; out.gtz = 0;
  out.ux = n.x; out.uy = n.y; out.uz = n.z;
  out.altM = alt; out.heading = 0; out.pitch = -90; out.roll = 0; out.fov = GLOBE.FOV;
  return out;
}

// ------------------------------------------------------------------ common
function terrainOut(out, x, y, z, tx, ty, tz, fov) {
  out.space = 'terrain';
  out.x = x; out.y = y; out.z = z;
  out.tx = tx; out.ty = ty; out.tz = tz;
  headingPitch(tx - x, ty - y, tz - z, out);
  out.roll = 0;
  out.fov = fov;
  out.cloud = out.cloud || 0;
  out.fade = 0;
  out.cut = false;
  return out;
}

export function sceneDuration(id, ctx) {
  return (ctx && ctx.dur[id]) || SCENE_DUR[id] || 0;
}

// Main entry. opts: { reducedMotion, from (daylapse end pose for ascend) }
export function pose(sceneId, t, ctx, out = {}, opts = null) {
  out.cloud = 0;
  switch (sceneId) {
    case 'descend': return descendPose(t, ctx, out);
    case 'wide': return widePose(t, ctx, out);
    case 'approach': return approachPose(t, ctx, out);
    case 'stand': return standPose(t, ctx, out, opts);
    case 'daylapse': return daylapsePose(t, ctx, out);
    case 'ascend': return ascendPose(t, ctx, out, opts && opts.from);
    case 'stand-terrain': return standTerrainPose(t, ctx, out);
    default: throw new Error('unknown scene ' + sceneId);
  }
}

// One representative still per scene for prefers-reduced-motion (no flights).
export function stillTime(sceneId, ctx) {
  switch (sceneId) {
    case 'wide': return ctx.dur.wide * 0.3;
    case 'approach': return ctx.dur.approach;
    case 'stand': return ctx.dur.stand * 0.5;
    case 'daylapse': return ctx.dur.daylapse * 0.5;
    default: return 0;
  }
}
