// Procedural canyon heightfield, used when the real terrain files are missing and as the
// synthetic heightAt in tools/check_paths.mjs. Pure: no DOM, no three.js.
// Shaped loosely like the Grand Canyon around Phantom Ranch in the shared local frame:
// river ~1.3 km south of the origin at ~740 m, South Rim ~2,130 m about 4.3 km south of the
// river, North Rim ~2,500 m about 8.6 km north of it, stepped walls and a few buttes.
import { clamp, smoothstep, fbm } from './util.js';

const STEPS = [
  // [s0, s1, f0, f1] : fraction of the way to the rim (s) -> fraction of the depth climbed (f)
  [0.0, 0.04, 0.0, 0.28],   // inner gorge (schist)
  [0.04, 0.22, 0.28, 0.33], // Tonto platform
  [0.22, 0.30, 0.33, 0.55], // Redwall cliff
  [0.30, 0.55, 0.55, 0.72], // Supai slopes
  [0.55, 0.62, 0.72, 0.88], // Coconino cliff
  [0.62, 0.85, 0.88, 0.93], // Toroweap slope
  [0.85, 0.90, 0.93, 1.0],  // Kaibab rim
];
function profile(s) {
  if (s <= 0) return 0;
  if (s >= 0.9) return 1;
  for (const [s0, s1, f0, f1] of STEPS) {
    if (s <= s1) {
      const t = (s - s0) / (s1 - s0);
      const u = t * t * (3 - 2 * t);
      return f0 + (f1 - f0) * u;
    }
  }
  return 1;
}

const BUTTES = [
  // x, offset north of the river (m), radius (m)
  [-7200, 3400, 1200], [-3900, 4600, 1000], [-1200, 3000, 900], [1800, 3900, 1300],
  [4700, 3100, 1000], [7600, 4200, 1200], [-5200, -2600, 700], [3300, -2500, 650],
];
const TRIBS = [-8400, -5600, -2900, -300, 2500, 5300, 8200, 11000, -11200, 14000, -14500];

export function riverZ(x) {
  return 1300 + 700 * Math.sin(x / 3100 + 0.4) + 260 * Math.sin(x / 1150 + 1.7);
}

export function proceduralHeight(x, z) {
  const zr = riverZ(x);
  const d = z - zr;                 // > 0 south of the river
  const ad = Math.abs(d);
  const wS = 4300 + 600 * Math.sin(x / 2300 + 1.1) + 500 * (fbm(x / 4000, 3.1, 3) - 0.5);
  const wN = 8600 + 1500 * Math.sin(x / 2900 + 2.3) + 900 * (fbm(x / 5000, 7.7, 3) - 0.5);
  const w = d > 0 ? wS : wN;
  let s = ad / w;
  // side canyons cut back into the walls
  let notch = 0;
  for (const xk of TRIBS) {
    const bend = 0.18 * d + 300 * Math.sin(d / 900);
    const width = 260 + 0.07 * ad;
    const e = (x - xk - bend) / width;
    notch = Math.max(notch, Math.exp(-e * e));
  }
  s *= 1 - 0.42 * notch * smoothstep(1.25, 0.2, s);
  // buttes (temples) left standing inside the canyon
  for (const [bx, off, rb] of BUTTES) {
    const bz = riverZ(bx) - off;
    const dx = x - bx, dz = z - bz;
    const ang = Math.atan2(dz, dx);
    const wob = 1 + 0.28 * Math.sin(3 * ang + bx * 0.001) + 0.18 * Math.sin(5 * ang + off * 0.002);
    const dist = Math.hypot(dx / 1.45, dz) / wob;
    if (dist < rb) {
      const m = smoothstep(rb, rb * 0.35, dist);
      s = Math.max(s, 0.86 * m);
    }
  }
  const f = profile(s);
  const river = 742 - x * 0.0022;
  let plateau = 2130 + 380 * smoothstep(-1000, -9000, z) + 220 * smoothstep(-9000, -32000, z) -
    260 * smoothstep(9000, 42000, z);
  plateau += 40 * (fbm(x / 2600 + 11, z / 2600 + 5, 4) - 0.5) + 14 * (fbm(x / 400, z / 400, 3) - 0.5);
  const bottomNoise = 6 * (fbm(x / 300, z / 300, 2) - 0.5);
  return river + (plateau - river) * f + (1 - f) * bottomNoise;
}

// Row-major grid (row 0 = north), corner-aligned over [-size/2, size/2].
export function makeProceduralDem(n, size) {
  const g = new Float32Array(n * n);
  const half = size / 2, step = size / (n - 1);
  let min = Infinity, max = -Infinity;
  for (let r = 0; r < n; r++) {
    const z = -half + r * step;
    for (let c = 0; c < n; c++) {
      const h = proceduralHeight(-half + c * step, z);
      g[r * n + c] = h;
      if (h < min) min = h;
      if (h > max) max = h;
    }
  }
  return { grid: g, n, size, min, max };
}

// Colour (sRGB 0-255) for the procedural texture: strata by depth fraction plus a baked hillshade.
const STRATA = [
  [0.0, [62, 98, 86]],      // river
  [0.025, [70, 56, 48]],    // schist
  [0.28, [104, 82, 62]],    // Tapeats
  [0.30, [138, 130, 100]],  // Tonto
  [0.34, [150, 82, 58]],    // Redwall (stained)
  [0.56, [168, 92, 64]],    // Supai
  [0.72, [182, 108, 76]],   // Hermit
  [0.76, [214, 194, 154]],  // Coconino
  [0.89, [186, 156, 120]],  // Toroweap
  [0.94, [204, 188, 156]],  // Kaibab
  [1.01, [204, 188, 156]],
];
export function proceduralColor(x, z, h, nx, ny, nz, out) {
  const zr = riverZ(x);
  const river = 742 - x * 0.0022;
  let plateau = 2130 + 380 * smoothstep(-1000, -9000, z) + 220 * smoothstep(-9000, -32000, z) -
    260 * smoothstep(9000, 42000, z);
  const f = clamp((h - river) / Math.max(200, plateau - river), 0, 1.05);
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < STRATA.length - 1; i++) {
    const [f0, c0] = STRATA[i], [f1, c1] = STRATA[i + 1];
    if (f <= f1) {
      const t = clamp((f - f0) / (f1 - f0), 0, 1);
      r = c0[0] + (c1[0] - c0[0]) * t; g = c0[1] + (c1[1] - c0[1]) * t; b = c0[2] + (c1[2] - c0[2]) * t;
      break;
    }
  }
  // flat plateau tops get vegetation (forest north, pinyon-juniper south)
  const flat = smoothstep(0.86, 0.97, ny) * smoothstep(0.93, 0.99, f);
  const veg = fbm(x / 350, z / 350, 3);
  const north = z < zr - 2000 ? 1 : 0;
  const vr = north ? 78 + 30 * veg : 112 + 40 * veg, vg = north ? 92 + 26 * veg : 106 + 30 * veg, vb = north ? 58 + 16 * veg : 78 + 20 * veg;
  r += (vr - r) * flat * 0.85; g += (vg - g) * flat * 0.85; b += (vb - b) * flat * 0.85;
  // baked hillshade (sun from the south-east, 45 deg)
  const lx = 0.5, ly = 0.7071, lz = 0.5;
  const shade = clamp(0.55 + 0.75 * (nx * lx + ny * ly + nz * lz) - 0.53, 0.45, 1.25);
  const n2 = 0.92 + 0.16 * fbm(x / 60, z / 60, 2);
  out[0] = clamp(r * shade * n2, 0, 255);
  out[1] = clamp(g * shade * n2, 0, 255);
  out[2] = clamp(b * shade * n2, 0, 255);
  return out;
}
