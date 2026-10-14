// Pure sky maths (no three.js): CPU port of three/addons Sky.js (Preetham) and three's ACES
// filmic tone mapping, so fog/haze colours can match the rendered horizon. Node-testable.
import { clamp, lerp } from './util.js';

export const SKY_PARAMS = { turbidity: 4.2, rayleigh: 1.25, mieCoefficient: 0.0045, mieDirectionalG: 0.8 };

// ---- CPU port of the Sky.js shader (same constants) so the fog can match the horizon exactly.
const TOTAL_RAYLEIGH = [5.804542996261093e-6, 1.3562911419845635e-5, 3.0265902468824876e-5];
const MIE_CONST = [1.8399918514433978e14, 2.7798023919660528e14, 4.0790479543861094e14];
const CUTOFF = 1.6110731556870734, STEEP = 1.5, EE = 1000;
function sunIntensity(zc) {
  zc = clamp(zc, -1, 1);
  return EE * Math.max(0, 1 - Math.exp(-((CUTOFF - Math.acos(zc)) / STEEP)));
}
// Returns linear radiance (before tone mapping) for unit direction d, unit sun s.
export function skyRadiance(d, s, p = SKY_PARAMS, out = [0, 0, 0]) {
  const sunE = sunIntensity(s[1]);
  const sunfade = 1; // unit sun vector, as in three's current example
  const rc = p.rayleigh - (1 - sunfade);
  const c = 0.2 * p.turbidity * 10e-18;
  const zen = Math.acos(Math.max(0, d[1]));
  const inv = 1 / (Math.cos(zen) + 0.15 * Math.pow(93.885 - (zen * 180) / Math.PI, -1.253));
  const sR = 8.4e3 * inv, sM = 1.25e3 * inv;
  const cosT = d[0] * s[0] + d[1] * s[1] + d[2] * s[2];
  const rPhase = (3 / (16 * Math.PI)) * (1 + (cosT * 0.5 + 0.5) ** 2);
  const g = p.mieDirectionalG, g2 = g * g;
  const mPhase = (1 / (4 * Math.PI)) * ((1 - g2) / Math.pow(1 - 2 * g * cosT + g2, 1.5));
  const mixK = clamp(Math.pow(1 - s[1], 5), 0, 1);
  for (let i = 0; i < 3; i++) {
    const bR = TOTAL_RAYLEIGH[i] * rc;
    const bM = 0.434 * c * MIE_CONST[i] * p.mieCoefficient;
    const fex = Math.exp(-(bR * sR + bM * sM));
    const ratio = (bR * rPhase + bM * mPhase) / (bR + bM);
    let lin = Math.pow(sunE * ratio * (1 - fex), 1.5);
    lin *= lerp(1, Math.pow(sunE * ratio * fex, 0.5), mixK);
    const l0 = 0.1 * fex;
    const tex = (lin + l0) * 0.04 + (i === 1 ? 0.0003 : i === 2 ? 0.00075 : 0);
    out[i] = Math.pow(tex, 1 / (1.2 + 1.2 * sunfade));
  }
  return out;
}
// three.js ACESFilmicToneMapping (r170), returns linear sRGB in 0..1
export function acesFilmic(rgb, exposure, out = [0, 0, 0]) {
  const k = exposure / 0.6;
  const r = rgb[0] * k, g = rgb[1] * k, b = rgb[2] * k;
  // input matrix (columns as in GLSL)
  const ir = 0.59719 * r + 0.35458 * g + 0.04823 * b;
  const ig = 0.07600 * r + 0.90834 * g + 0.01566 * b;
  const ib = 0.02840 * r + 0.13383 * g + 0.83777 * b;
  const fit = (v) => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.4329510) + 0.238081);
  const fr = fit(ir), fg = fit(ig), fb = fit(ib);
  out[0] = clamp(1.60475 * fr - 0.53108 * fg - 0.07367 * fb, 0, 1);
  out[1] = clamp(-0.10208 * fr + 1.10813 * fg - 0.00605 * fb, 0, 1);
  out[2] = clamp(-0.00327 * fr - 0.07276 * fg + 1.07602 * fb, 0, 1);
  return out;
}

export function exposureFor(elevDeg) {
  // a little brighter as the sun goes down so dusk keeps colour (the twilight dome takes over below)
  if (elevDeg >= 12) return 0.42;
  if (elevDeg >= 0) return lerp(0.75, 0.42, elevDeg / 12);
  return 0.75;
}

// Twilight/night dome laid over the Preetham sky (Preetham has no light once the sun is ~2 deg
// below the horizon). cover: how much the dome replaces Preetham; night: 0 twilight .. 1 night.
export function twilightAmounts(elevDeg) {
  const sm = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  // the dome starts just before sunset: Preetham turns murky grey within ~1 deg of the horizon
  return { cover: sm(1.0, -3.0, elevDeg), night: sm(-6, -13, elevDeg) };
}
// Linear colour of the dome for elevation e (sine of view elevation) and toward (0 away .. 1 sun side).
export function twilightColor(e, toward, night, out = [0, 0, 0]) {
  const hfall = Math.exp(-Math.max(e, 0) * 6);
  const t3 = toward * toward * toward;
  for (let i = 0; i < 3; i++) {
    const zen = [0.03, 0.05, 0.13][i];
    const hz = lerp([0.30, 0.2, 0.32][i], [0.9, 0.42, 0.17][i], t3);
    const tw = lerp(zen, hz, hfall);
    const nz = lerp([0.004, 0.007, 0.02][i], [0.016, 0.024, 0.05][i], Math.exp(-Math.max(e, 0) * 4));
    out[i] = lerp(tw, nz, night);
  }
  return out;
}
// The Sky shader gets the sun clamped here so its colours stay sane below the horizon.
export const SKY_SUN_MIN_DEG = 0.8;
