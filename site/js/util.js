// Small pure helpers (no DOM, no three.js) shared by the browser app and Node tools.
import { ORIGIN, M_PER_DEG_LAT, M_PER_DEG_LON_EQ } from './config.js';

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const smootherstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
// Cosine ease 0..1 with zero slope at both ends.
export const easeCos = (t) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(t, 0, 1));

export const wrap360 = (a) => ((a % 360) + 360) % 360;
export const wrap180 = (a) => {
  const w = wrap360(a);
  return w > 180 ? w - 360 : w;
};

// Eased scene time: velocity ramps 0 -> 1 over E seconds at the start and 1 -> 0 over E at the
// end (cosine ramps). Returns "path seconds" in [0, T - E]. Speed is exactly 1 in between.
export function easedTime(t, T, E) {
  const e = Math.min(E, T / 2);
  const t0 = clamp(t, 0, T);
  const ramp = (x) => x / 2 - (e / (2 * Math.PI)) * Math.sin((Math.PI * x) / e); // integral of the ramp
  if (e <= 0) return t0;
  if (t0 <= e) return ramp(t0);
  const full = T - e;
  if (t0 <= full) return e / 2 + (t0 - e);
  return e / 2 + (full - e) + (e / 2 - ramp(T - t0));
}
export const easedSpan = (T, E) => easedTime(T, T, E);

// Geographic <-> local metres (contract: x east, z south, y metres above sea level).
export const COS_LAT0 = Math.cos(ORIGIN.lat * DEG);
export function llToLocal(lat, lon, out = {}) {
  out.x = (lon - ORIGIN.lon) * M_PER_DEG_LON_EQ * COS_LAT0;
  out.z = -(lat - ORIGIN.lat) * M_PER_DEG_LAT;
  return out;
}
export function localToLl(x, z, out = {}) {
  out.lon = ORIGIN.lon + x / (M_PER_DEG_LON_EQ * COS_LAT0);
  out.lat = ORIGIN.lat - z / M_PER_DEG_LAT;
  return out;
}

// Heading (deg clockwise from north) and pitch (deg, + up) of a direction in the local frame.
export function headingPitch(dx, dy, dz, out = {}) {
  const h = Math.hypot(dx, dz);
  out.heading = wrap360(Math.atan2(dx, -dz) * RAD);
  out.pitch = Math.atan2(dy, h) * RAD;
  return out;
}
// Unit vector for heading/pitch (local frame).
export function dirFromHP(headingDeg, pitchDeg, out = {}) {
  const h = headingDeg * DEG, p = pitchDeg * DEG;
  const c = Math.cos(p);
  out.x = Math.sin(h) * c;
  out.y = Math.sin(p);
  out.z = -Math.cos(h) * c;
  return out;
}

// Deterministic PRNG (mulberry32).
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Cheap 2D value noise (deterministic), used by the procedural fallback.
function hash2(ix, iy) {
  let h = (ix * 374761393 + iy * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function valueNoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
export function fbm(x, y, oct = 4) {
  let s = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) {
    s += amp * valueNoise(x * f, y * f);
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return s / norm;
}

// Bilinear sample of a row-major float grid (row 0 = north) that spans [-size/2, size/2] in x and z,
// corner aligned (n points per side). Returns NaN outside.
export function sampleGrid(grid, n, size, x, z) {
  const half = size / 2;
  const fx = ((x + half) / size) * (n - 1);
  const fz = ((z + half) / size) * (n - 1);
  if (!(fx >= 0 && fz >= 0 && fx <= n - 1 && fz <= n - 1)) return NaN;
  const c0 = Math.min(Math.floor(fx), n - 2), r0 = Math.min(Math.floor(fz), n - 2);
  const tx = fx - c0, tz = fz - r0;
  const i = r0 * n + c0;
  const a = grid[i], b = grid[i + 1], c = grid[i + n], d = grid[i + n + 1];
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
}

export function fmtKm(m) {
  return m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km` : `${Math.round(m)} m`;
}
