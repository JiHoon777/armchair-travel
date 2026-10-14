// Terrain: real DEM + imagery from data/grand-canyon/terrain, or a procedural canyon fallback.
//
// Heights live in a float texture (R32F) and are read in the vertex shader with texelFetch, so
// every chunk shares one of four grid geometries (129/65/33/17 vertices per side). Each chunk is
// a THREE.LOD; normals come from neighbouring DEM texels at the level's spacing.
//
// Cast shadows: a small GPU pass marches from every texel of a sun-visibility texture toward the
// sun through the DEM (core, then outer) and is re-rendered only when the sun has moved more than
// SHADOW.MIN_DEG (the day-lapse; elsewhere about once a minute). The aerial photos carry their own
// noon shadows (best fit: sun azimuth 195 deg, elevation 30 deg, docs/proto/terrain.md); the same
// pass run once for that sun lifts those pixels, so the moving sun owns the shadows.
import * as THREE from 'three';
import { TERRAIN, SHADOW } from './config.js';
import { sampleGrid, clamp } from './util.js';
import { makeProceduralDem, proceduralColor } from './procedural.js';

const HAZE_GLSL = /* glsl */`
uniform vec3 uFogA;
uniform vec3 uFogS;
uniform vec3 uSunDir;
uniform float uHazeK;
uniform float uHazeH;
uniform vec2 uEdge;
uniform vec3 uHorizon[16]; // the rendered sky just above the horizon, every 22.5 deg clockwise from north
vec3 horizonAt(vec3 dv) {
  float u = mod(atan(dv.x, -dv.z) / 6.2831853 * 16.0 + 16.0, 16.0);
  int i0 = int(min(floor(u), 15.0));
  int i1 = i0 == 15 ? 0 : i0 + 1;
  return mix(uHorizon[i0], uHorizon[i1], fract(u));
}
vec3 applyHaze(vec3 col, vec3 world) {
  vec3 dv = world - cameraPosition;
  float dist = length(dv);
  float y0 = cameraPosition.y, y1 = world.y;
  float dy = y1 - y0;
  float e0 = exp(-max(y0, -500.0) / uHazeH), e1 = exp(-max(y1, -500.0) / uHazeH);
  float avgD = abs(dy) < 1.0 ? e0 : (e0 - e1) * uHazeH / dy;
  float fog = 1.0 - exp(-uHazeK * dist * avgD);
  float edge = smoothstep(uEdge.x, uEdge.y, max(abs(world.x), abs(world.z)));
  fog = 1.0 - (1.0 - fog) * (1.0 - edge);
  vec2 vd = normalize(dv.xz + vec2(1e-4));
  vec2 sd = normalize(uSunDir.xz + vec2(1e-4));
  float toward = pow(max(dot(vd, sd), 0.0), 6.0) * smoothstep(-0.25, 0.05, uSunDir.y);
  vec3 hazeC = mix(uFogA, uFogS, toward);
  // just under the horizon line the haze becomes the sky's own horizon colour (per azimuth), so the
  // far, fully hazed ground meets the sky without a step; lower down it keeps the bluer haze
  float ve = dv.y / max(dist, 1.0);
  hazeC = mix(hazeC, horizonAt(dv), smoothstep(-0.07, -0.004, ve));
  return mix(col, hazeC, fog);
}
`;

const VERT = /* glsl */`
uniform highp sampler2D uDem;
uniform vec2 uDemN;
uniform float uSpacing;
uniform vec2 uOrigin;
uniform float uYOffset;
uniform vec4 uTileRect;
uniform highp sampler2D uCoreDem; // outer mesh only: vertices under the core take the core's height
uniform vec2 uCoreN;
uniform float uCoreSpacing;
uniform float uCoreHalf;            // 0 = off
attribute float aSkirt;
attribute float aStep;
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNormalW;
float H(ivec2 p) {
  p = clamp(p, ivec2(0), ivec2(uDemN) - 1);
  return texelFetch(uDem, p, 0).r;
}
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec2 tc = (wp.xz - uOrigin) / uSpacing;
  ivec2 ij = ivec2(floor(tc + 0.5));
  float h = H(ij);
  int s = int(aStep + 0.5);
  float hl = H(ij - ivec2(s, 0)), hr = H(ij + ivec2(s, 0));
  float hu = H(ij - ivec2(0, s)), hd = H(ij + ivec2(0, s));
  float d = 2.0 * float(s) * uSpacing;
  vNormalW = normalize(vec3(hl - hr, d, hu - hd));
  if (uCoreHalf > 0.0 && max(abs(wp.x), abs(wp.z)) < uCoreHalf) {
    // the outer grid is too coarse for narrow gorges at the core's edge; following the core here
    // keeps triangles that straddle the edge from overhanging the core (no see-through notches)
    ivec2 cj = clamp(ivec2(floor((wp.xz + uCoreHalf) / uCoreSpacing + 0.5)), ivec2(0), ivec2(uCoreN) - 1);
    h = texelFetch(uCoreDem, cj, 0).r;
  }
  wp.y = h + uYOffset - aSkirt;
  vWorld = wp.xyz;
  vUv = (wp.xz - uTileRect.xy) * uTileRect.zw;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */`
uniform sampler2D uMap;
uniform float uHasMap;
uniform vec3 uBaseColor;
uniform vec3 uSunColor;
uniform vec3 uAmbient;
uniform vec3 uBounce;
uniform float uShadeAmt;
uniform float uHole;
uniform vec3 uGrade; // x: gamma (<1 lifts shadows), y: saturation, z: warmth
uniform sampler2D uOuterMap; // core tiles: the outer imagery, blended in near the core edge
uniform vec4 uOuterRect;
uniform vec3 uEdgeBlend;     // x..y: distance band from the centre, z: strength (0 = off)
uniform sampler2D uShadowMap;    // sun visibility for the current sun (1 = lit)
uniform sampler2D uImgShadowMap; // sun visibility for the photo's own (noon) sun
uniform vec4 uShadowRect;        // x0, z0, 1/size, on
uniform float uDebake;           // brightness lift for the photo's baked cast shadows
uniform float uSteepK;           // steep walls: blend toward the blurred local colour
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNormalW;
${HAZE_GLSL}
void main() {
  float edgeD = max(abs(vWorld.x), abs(vWorld.z));
  if (uHole > 0.0 && edgeD < uHole) discard;
  vec3 n = normalize(vNormalW);
  vec2 uv = clamp(vUv, 0.0, 1.0);
  vec3 albedo = uHasMap > 0.5 ? texture2D(uMap, uv).rgb : uBaseColor;
  // steep walls: a vertical photo pixel is smeared down the cliff; there, lean on the photo's
  // blurred local colour (a coarser mip), a little darker, so the streaks read as rock
  vec3 soft = texture2D(uMap, uv, 3.0).rgb;
  float steep = (1.0 - smoothstep(0.42, 0.66, n.y)) * uSteepK * uHasMap;
  albedo = mix(albedo, soft * 0.9, steep);
  // soften the sharp-to-blurry imagery step at the core edge (sampled outside any branch so
  // the mip level stays defined)
  vec3 outerAlb = texture2D(uOuterMap, clamp((vWorld.xz - uOuterRect.xy) * uOuterRect.zw, 0.0, 1.0)).rgb;
  albedo = mix(albedo, outerAlb, uEdgeBlend.z * smoothstep(uEdgeBlend.x, uEdgeBlend.y, edgeD));
  // cast shadows: the current sun's, and the photo's own ones lifted out of the albedo
  vec2 suv = (vWorld.xz - uShadowRect.xy) * uShadowRect.z;
  float vis = mix(1.0, texture2D(uShadowMap, suv).r, uShadowRect.w);
  float visImg = mix(1.0, texture2D(uImgShadowMap, suv).r, uShadowRect.w);
  albedo *= mix(1.0, uDebake, 1.0 - visImg);
  // grade for aerial imagery: contrast (gamma), saturation and warmth
  albedo = pow(max(albedo, vec3(0.0)), vec3(uGrade.x));
  float lum = dot(albedo, vec3(0.2126, 0.7152, 0.0722));
  albedo = max(mix(vec3(lum), albedo, uGrade.y), vec3(0.0)) * vec3(1.0 + uGrade.z, 1.0, 1.0 - uGrade.z);
  float flatL = max(uSunDir.y, 0.22);
  float shade = mix(1.0, clamp(dot(n, uSunDir) / flatL, 0.0, 1.7), uShadeAmt);
  vec3 col = albedo * (uAmbient + uBounce + uSunColor * shade * vis);
  col = applyHaze(col, vWorld);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

const APRON_VERT = /* glsl */`
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const APRON_FRAG = /* glsl */`
uniform vec3 uBaseColor;
uniform vec3 uSunColor;
uniform vec3 uAmbient;
varying vec3 vWorld;
${HAZE_GLSL}
void main() {
  vec3 col = uBaseColor * (uAmbient + uSunColor);
  col = applyHaze(col, vWorld);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

// Shared lighting/haze uniforms (sky.js writes them every frame).
export function makeTerrainUniforms() {
  return {
    uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.5).normalize() },
    uSunColor: { value: new THREE.Color(0.45, 0.43, 0.4) },
    uAmbient: { value: new THREE.Color(0.58, 0.58, 0.6) },
    uBounce: { value: new THREE.Color(0, 0, 0) },
    uShadeAmt: { value: 0.3 },
    uFogA: { value: new THREE.Color(0.6, 0.66, 0.75) },
    uFogS: { value: new THREE.Color(0.75, 0.72, 0.68) },
    uHazeK: { value: TERRAIN.HAZE_DENSITY_SEA },
    uHazeH: { value: TERRAIN.HAZE_SCALE_H_M },
    uEdge: { value: new THREE.Vector2(TERRAIN.EDGE_FADE_M[0], TERRAIN.EDGE_FADE_M[1]) },
    uHorizon: { value: Array.from({ length: 16 }, () => new THREE.Vector3(0.8, 0.82, 0.85)) },
    uGrade: { value: new THREE.Vector3(TERRAIN.GRADE[0], TERRAIN.GRADE[1], TERRAIN.GRADE[2]) },
    uDebake: { value: SHADOW.DEBAKE },
    uSteepK: { value: TERRAIN.STEEP_SOFTEN },
  };
}

// ------------------------------------------------------------------ sun-visibility pass
const SHADOW_VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;
const shadowFrag = (steps) => /* glsl */`
precision highp float;
uniform highp sampler2D uCoreDem;
uniform vec2 uCoreN;
uniform float uCoreSize;
uniform highp sampler2D uOuterDem;
uniform vec2 uOuterN;
uniform float uOuterSize;
uniform float uHasOuter;
uniform vec3 uSun;     // unit vector toward the sun (local frame: x east, y up, z south)
uniform float uMaxH;   // highest terrain: a ray above it is free
uniform vec4 uRect;    // x0, z0, size of the area this texture covers
uniform float uStep0;
uniform float uGrow;
varying vec2 vUv;
float hAt(vec2 p) {
  float hc = uCoreSize * 0.5;
  if (abs(p.x) <= hc && abs(p.y) <= hc) {
    vec2 f = (p + hc) / uCoreSize * (uCoreN - 1.0);
    return texelFetch(uCoreDem, clamp(ivec2(floor(f + 0.5)), ivec2(0), ivec2(uCoreN) - 1), 0).r;
  }
  if (uHasOuter > 0.5) {
    float ho = uOuterSize * 0.5;
    if (abs(p.x) <= ho && abs(p.y) <= ho) {
      vec2 f = (p + ho) / uOuterSize * (uOuterN - 1.0);
      return texelFetch(uOuterDem, clamp(ivec2(floor(f + 0.5)), ivec2(0), ivec2(uOuterN) - 1), 0).r;
    }
  }
  return -1.0e4;
}
void main() {
  vec2 p0 = uRect.xy + vUv * uRect.z;
  float h0 = hAt(p0) + 3.0;
  vec2 d = normalize(uSun.xz + vec2(1e-6));
  float slope = max(uSun.y, 0.004) / max(length(uSun.xz), 1e-4); // rise per metre toward the sun
  float s = uStep0;
  float occ = -1.0; // highest terrain above the ray, as a tangent (angle) seen from p0
  for (int i = 0; i < ${steps}; i++) {
    float rayH = h0 + s * slope;
    if (rayH > uMaxH) break;
    occ = max(occ, (hAt(p0 + d * s) - rayH) / s);
    s *= uGrow;
  }
  // soft edge a little wider than the sun's disc (hides the texture's 20 m steps)
  gl_FragColor = vec4(1.0 - smoothstep(-0.006, 0.014, occ), 0.0, 0.0, 1.0);
}
`;

// Grid geometry for one LOD level of a chunk: (cells/step + 1)^2 vertices, positions in metres
// from (0,0) to (chunkSize, chunkSize), plus outward-facing skirts on all four edges.
function makeGridGeometry(cells, step, chunkSize, skirt, useUint32 = false) {
  const nv = cells / step + 1;
  const sp = chunkSize / (nv - 1);
  const nMain = nv * nv, nSk = 4 * nv;
  const pos = new Float32Array((nMain + nSk) * 3);
  const aSkirt = new Float32Array(nMain + nSk);
  const aStep = new Float32Array(nMain + nSk).fill(step);
  for (let r = 0; r < nv; r++) for (let c = 0; c < nv; c++) {
    const i = r * nv + c;
    pos[i * 3] = c * sp; pos[i * 3 + 1] = 0; pos[i * 3 + 2] = r * sp;
  }
  const idx = [];
  for (let r = 0; r < nv - 1; r++) for (let c = 0; c < nv - 1; c++) {
    const i00 = r * nv + c, i01 = i00 + 1, i10 = i00 + nv, i11 = i10 + 1;
    idx.push(i00, i10, i01, i01, i10, i11);
  }
  // skirts: edges as vertex lists with their outward direction
  const edges = [
    { list: Array.from({ length: nv }, (_, c) => c), out: [0, 0, -1] },                     // north
    { list: Array.from({ length: nv }, (_, c) => (nv - 1) * nv + c), out: [0, 0, 1] },      // south
    { list: Array.from({ length: nv }, (_, r) => r * nv), out: [-1, 0, 0] },                // west
    { list: Array.from({ length: nv }, (_, r) => r * nv + nv - 1), out: [1, 0, 0] },        // east
  ];
  let k = nMain;
  for (const e of edges) {
    const base = k;
    for (const vi of e.list) {
      pos[k * 3] = pos[vi * 3]; pos[k * 3 + 1] = 0; pos[k * 3 + 2] = pos[vi * 3 + 2];
      aSkirt[k] = skirt;
      k++;
    }
    for (let j = 0; j < nv - 1; j++) {
      const t0 = e.list[j], t1 = e.list[j + 1], b0 = base + j, b1 = base + j + 1;
      // triangle (t0, b0, t1): its normal = (b0 - t0) x (t1 - t0); with b0 straight below t0
      // that is (0,-1,0) x (d) -> check against the outward direction, flip if needed
      const dx = pos[t1 * 3] - pos[t0 * 3], dz = pos[t1 * 3 + 2] - pos[t0 * 3 + 2];
      const nx = -dz * 1, nz = dx * 1; // (0,-1,0) x (dx,0,dz) = (-dz, 0, dx)
      const okDir = nx * e.out[0] + nz * e.out[2] > 0;
      if (okDir) idx.push(t0, b0, t1, t1, b0, b1);
      else idx.push(t0, t1, b0, t1, b1, b0);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSkirt', new THREE.BufferAttribute(aSkirt, 1));
  g.setAttribute('aStep', new THREE.BufferAttribute(aStep, 1));
  const total = nMain + nSk;
  g.setIndex(new THREE.BufferAttribute(useUint32 || total > 65535 ? new Uint32Array(idx) : new Uint16Array(idx), 1));
  return g;
}

async function fetchBlob(url, signal) {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.blob();
}

// Exact Terrarium decode: no colour conversion, no premultiplication.
export async function decodeTerrariumBlob(blob) {
  const bmp = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const w = bmp.width, h = bmp.height;
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const c2 = canvas.getContext('2d', { willReadFrequently: true });
  c2.drawImage(bmp, 0, 0);
  bmp.close && bmp.close();
  const data = c2.getImageData(0, 0, w, h).data;
  const g = new Float32Array(w * h);
  let min = Infinity, max = -Infinity;
  for (let i = 0, j = 0; i < w * h; i++, j += 4) {
    const v = data[j] * 256 + data[j + 1] + data[j + 2] / 256 - 32768;
    g[i] = v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { grid: g, n: w, h, min, max };
}

function demTexture(grid, n) {
  const t = new THREE.DataTexture(grid, n, n, THREE.RedFormat, THREE.FloatType);
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

const DEG = Math.PI / 180;
const angleDeg = (a, b) => Math.acos(clamp(a.x * b.x + a.y * b.y + a.z * b.z, -1, 1)) / DEG;
const closeImage = (t) => { try { if (t && t.image && t.image.close) t.image.close(); } catch { /* already closed */ } };

export class Terrain {
  // mobile: lighter meshes; smallTextures: the 1024 px imagery (phones, data saver)
  constructor(renderer, { mobile = false, smallTextures = mobile } = {}) {
    this.renderer = renderer;
    this.mobile = mobile;
    this.smallTextures = smallTextures;
    this._gen = 0;
    this.uniforms = makeTerrainUniforms();
    this.group = new THREE.Group();
    this.group.name = 'terrain';
    this.ready = false;
    this.source = 'none';
    this.info = { checks: [], textures: 0, texturesWanted: 0, warnings: [] };
    this.core = null;
    this.outer = null;
    this.meta = null;
    this._texQueue = [];
    this._disposables = [];
    this.anisotropy = Math.min(TERRAIN.ANISO_CAP, renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1);
    this.heightAt = this.heightAt.bind(this);
    this.outerTexture = null; // shared with the globe patch
    this._shadow = null;      // render targets + pass, made on first use
    this._shadowSun = null;   // sun direction of the last visibility render
    this._wantSun = null;     // sun direction asked for last
    this._shadowAt = 0;
    this._imgShadowDone = false;
    this.info.shadowRenders = 0;
  }

  heightAt(x, z) {
    if (this.core) {
      const h = sampleGrid(this.core.grid, this.core.n, this.core.size, x, z);
      if (Number.isFinite(h)) return h;
    }
    if (this.outer) return sampleGrid(this.outer.grid, this.outer.n, this.outer.size, x, z) + 0;
    return NaN;
  }

  // Load the real data. Resolves true when the DEM is in place (imagery keeps streaming).
  async load(base) {
    this.base = base;
    let meta;
    try {
      const res = await fetch(base + 'meta.json');
      if (!res.ok) throw new Error(res.status + ' meta.json');
      meta = await res.json();
      if (!meta.core || !meta.core.dem) throw new Error('meta.json has no core.dem');
    } catch (e) {
      this._warn(`terrain data missing (${e.message}); using the procedural canyon`);
      this.useProcedural();
      return false;
    }
    this.meta = meta;
    try {
      const [coreBlob, outerBlob] = await Promise.all([
        fetchBlob(base + meta.core.dem.file),
        meta.outer && meta.outer.dem ? fetchBlob(base + meta.outer.dem.file).catch(() => null) : Promise.resolve(null),
      ]);
      const core = await decodeTerrariumBlob(coreBlob);
      const outer = outerBlob ? await decodeTerrariumBlob(outerBlob) : null;
      if (this.source === 'procedural') return false; // gave up waiting earlier; keep what is on screen
      if ((core.n - 1) % TERRAIN.CHUNK_CELLS !== 0) throw new Error(`core DEM is ${core.n}px; needs k*${TERRAIN.CHUNK_CELLS}+1`);
      this.core = { ...core, size: meta.core.size_m };
      this.outer = outer ? { ...outer, size: meta.outer.size_m } : null;
    } catch (e) {
      this._warn(`terrain DEM failed (${e.message}); using the procedural canyon`);
      this.useProcedural();
      return false;
    }
    this._verifyChecks(meta);
    this.source = 'data';
    this.uniforms.uDebake.value = SHADOW.DEBAKE;
    this._build();
    this.ready = true;
    this._loadTextures(meta);
    return true;
  }

  _verifyChecks(meta) {
    if (!Array.isArray(meta.checks)) return;
    const o = meta.origin || { lat: 36.115, lon: -112.105 };
    for (const c of meta.checks) {
      const x = (c.lon - o.lon) * 111320 * Math.cos((o.lat * Math.PI) / 180);
      const z = -(c.lat - o.lat) * 110574;
      const got = this.heightAt(x, z);
      const diff = got - c.elev_m;
      this.info.checks.push({ name: c.name, expected: c.elev_m, got: Math.round(got * 10) / 10, ok: Math.abs(diff) <= 5 });
      if (!(Math.abs(diff) <= 5)) this._warn(`DEM check ${c.name}: expected ${c.elev_m} m, decoded ${got.toFixed(1)} m`);
    }
  }

  _warn(msg) {
    this.info.warnings.push(msg);
    console.warn('[terrain]', msg);
  }

  useProcedural() {
    const t0 = performance.now();
    // coarse on purpose: this runs on the main thread only when the real data is missing
    const core = makeProceduralDem(385, 20000);
    const outer = makeProceduralDem(129, 100000);
    this.core = core;
    this.outer = outer;
    this.meta = null;
    this.source = 'procedural';
    this.uniforms.uDebake.value = 1; // the procedural texture has no baked cast shadows
    this._build({ tileGrid: 1 });
    // procedural imagery on canvases
    const coreTex = this._proceduralTexture(core, this.mobile ? 512 : 768);
    const outerTex = this._proceduralTexture(outer, 384);
    this._setTileTexture(0, 0, coreTex);
    this._setOuterTexture(outerTex);
    this.ready = true;
    this.info.proceduralMs = Math.round(performance.now() - t0);
  }

  _proceduralTexture(dem, px) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = px;
    const c2 = canvas.getContext('2d');
    const img = c2.createImageData(px, px);
    const half = dem.size / 2, step = dem.size / (px - 1), e = dem.size / (dem.n - 1);
    const col = [0, 0, 0];
    for (let r = 0; r < px; r++) {
      const z = -half + r * step;
      for (let c = 0; c < px; c++) {
        const x = -half + c * step;
        const h = sampleGrid(dem.grid, dem.n, dem.size, x, z);
        const hl = sampleGrid(dem.grid, dem.n, dem.size, clamp(x - e, -half, half), z);
        const hr = sampleGrid(dem.grid, dem.n, dem.size, clamp(x + e, -half, half), z);
        const hu = sampleGrid(dem.grid, dem.n, dem.size, x, clamp(z - e, -half, half));
        const hd = sampleGrid(dem.grid, dem.n, dem.size, x, clamp(z + e, -half, half));
        let nx = (hl - hr) / (2 * e), nz = (hu - hd) / (2 * e), ny = 1;
        const L = Math.hypot(nx, ny, nz); nx /= L; ny /= L; nz /= L;
        proceduralColor(x, z, h, nx, ny, nz, col);
        const k = (r * px + c) * 4;
        img.data[k] = col[0]; img.data[k + 1] = col[1]; img.data[k + 2] = col[2]; img.data[k + 3] = 255;
      }
    }
    c2.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.flipY = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.anisotropy;
    return tex;
  }

  _build(opts = {}) {
    this._clearMeshes();
    const core = this.core;
    const cells = TERRAIN.CHUNK_CELLS;
    const chunksPerSide = (core.n - 1) / cells;
    const chunkSize = core.size / chunksPerSide;
    const tileGrid = opts.tileGrid || (this.meta && this.meta.core.tex && this.meta.core.tex.grid) || 3;
    const chunksPerTile = chunksPerSide / tileGrid;
    this.layout = { chunksPerSide, chunkSize, tileGrid, chunksPerTile };
    // geometries per LOD level (shared by all chunks)
    const levels = TERRAIN.LOD_STEPS.filter((s) => cells / s >= 2);
    this.lodGeoms = levels.map((s, i) => {
      const g = makeGridGeometry(cells, s, chunkSize, TERRAIN.SKIRT_M[i] || 300);
      const hr = (core.max - core.min) + (TERRAIN.SKIRT_M[i] || 300);
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(chunkSize / 2, 0, chunkSize / 2), Math.hypot(chunkSize / Math.SQRT2, hr));
      g.boundingBox = null;
      return g;
    });
    this._disposables.push(...this.lodGeoms);
    this.demTex = demTexture(core.grid, core.n);
    this._disposables.push(this.demTex);
    const spacing = core.size / (core.n - 1);
    // one material per imagery tile
    const tileSize = core.size / tileGrid;
    const baseCol = new THREE.Color(0.30, 0.17, 0.10); // linear; close to the canyon's average colour
    this.tileMats = [];
    for (let tr = 0; tr < tileGrid; tr++) for (let tc = 0; tc < tileGrid; tc++) {
      const x0 = -core.size / 2 + tc * tileSize, z0 = -core.size / 2 + tr * tileSize;
      const m = new THREE.ShaderMaterial({
        uniforms: {
          ...this.uniforms,
          uDem: { value: this.demTex },
          uDemN: { value: new THREE.Vector2(core.n, core.n) },
          uSpacing: { value: spacing },
          uOrigin: { value: new THREE.Vector2(-core.size / 2, -core.size / 2) },
          uYOffset: { value: 0 },
          uTileRect: { value: new THREE.Vector4(x0, z0, 1 / tileSize, 1 / tileSize) },
          uMap: { value: null },
          uHasMap: { value: 0 },
          uBaseColor: { value: baseCol },
          uHole: { value: 0 },
          uCoreDem: { value: null },
          uCoreN: { value: new THREE.Vector2(1, 1) },
          uCoreSpacing: { value: 1 },
          uCoreHalf: { value: 0 },
          uOuterMap: { value: null },
          uOuterRect: { value: new THREE.Vector4(-50000, -50000, 1 / 100000, 1 / 100000) },
          uEdgeBlend: { value: new THREE.Vector3(0, 1, 0) },
          ...this._shadowUniforms('core'),
        },
        vertexShader: VERT,
        fragmentShader: FRAG,
      });
      m.name = `terrain-tile-${tr}-${tc}`;
      this.tileMats.push(m);
      this._disposables.push(m);
    }
    // chunks
    const lodDist = TERRAIN.LOD_DIST_M.map((d) => d * (this.mobile ? TERRAIN.LOD_DIST_MOBILE_SCALE : 1));
    this.chunks = [];
    for (let r = 0; r < chunksPerSide; r++) for (let c = 0; c < chunksPerSide; c++) {
      const x0 = -core.size / 2 + c * chunkSize, z0 = -core.size / 2 + r * chunkSize;
      const mean = this._chunkMean(r, c, chunksPerSide);
      const lod = new THREE.LOD();
      lod.position.set(x0 + chunkSize / 2, mean, z0 + chunkSize / 2);
      const tile = Math.floor(r / chunksPerTile) * tileGrid + Math.floor(c / chunksPerTile);
      this.lodGeoms.forEach((g, i) => {
        const mesh = new THREE.Mesh(g, this.tileMats[tile]);
        mesh.position.set(-chunkSize / 2, 0, -chunkSize / 2);
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        lod.addLevel(mesh, lodDist[i] || 1e9, 0.08);
      });
      lod.matrixAutoUpdate = false;
      lod.updateMatrix();
      this.group.add(lod);
      this.chunks.push(lod);
    }
    // outer ring terrain (dropped, hole under the core)
    if (this.outer) {
      const o = this.outer;
      const step = this.mobile ? 2 : 1;
      const geo = makeGridGeometry(o.n - 1, step, o.size, 3000, true);
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(o.size / 2, 0, o.size / 2), o.size);
      this._disposables.push(geo);
      // heights near the core edge are lowered to the core edge (see _seamOuterGrid)
      this.outerDemTex = demTexture(this._seamOuterGrid(), o.n);
      this._disposables.push(this.outerDemTex);
      const m = new THREE.ShaderMaterial({
        uniforms: {
          ...this.uniforms,
          uDem: { value: this.outerDemTex },
          uDemN: { value: new THREE.Vector2(o.n, o.n) },
          uSpacing: { value: o.size / (o.n - 1) },
          uOrigin: { value: new THREE.Vector2(-o.size / 2, -o.size / 2) },
          uYOffset: { value: -TERRAIN.OUTER_DROP_M },
          uTileRect: { value: new THREE.Vector4(-o.size / 2, -o.size / 2, 1 / o.size, 1 / o.size) },
          uMap: { value: null },
          uHasMap: { value: 0 },
          uBaseColor: { value: baseCol },
          uHole: { value: this.seamRing },
          uCoreDem: { value: this.demTex },
          uCoreN: { value: new THREE.Vector2(core.n, core.n) },
          uCoreSpacing: { value: core.size / (core.n - 1) },
          uCoreHalf: { value: 0 }, // seam handled on the CPU (_seamOuterGrid)
          uOuterMap: { value: null },
          uOuterRect: { value: new THREE.Vector4(0, 0, 1, 1) },
          uEdgeBlend: { value: new THREE.Vector3(0, 1, 0) },
          ...this._shadowUniforms('outer'),
        },
        vertexShader: VERT,
        fragmentShader: FRAG,
      });
      m.name = 'terrain-outer';
      this.outerMat = m;
      this._disposables.push(m);
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(-o.size / 2, 0, -o.size / 2);
      mesh.renderOrder = 1;
      this.group.add(mesh);
      this.outerMesh = mesh;
    }
    // apron far beyond the data, fully hazed; below the lowest edge point so it never overhangs
    // a gorge that runs out of the data (otherwise the sky shows through that notch)
    const edgeH = this._edgeMin();
    const ring = new THREE.RingGeometry(this.outer ? this.outer.size * 0.42 : core.size * 0.45, TERRAIN.APRON_RADIUS_M, 64, 1);
    ring.rotateX(-Math.PI / 2);
    this._disposables.push(ring);
    const am = new THREE.ShaderMaterial({
      uniforms: { ...this.uniforms, uBaseColor: { value: new THREE.Color(0.5, 0.42, 0.33) } },
      vertexShader: APRON_VERT,
      fragmentShader: APRON_FRAG,
    });
    this._disposables.push(am);
    const apron = new THREE.Mesh(ring, am);
    apron.position.y = edgeH - 150;
    apron.renderOrder = 2;
    this.group.add(apron);
    this.apron = apron;
  }

  // The outer grid (195 m) cannot follow the core's edge (13 m). Where its triangles that cross
  // the core boundary sat above the core edge, a view from inside the core passed over the edge
  // and under the outer surface: see-through notches showing the sky, plus sub-pixel gaps where
  // the per-pixel discard of the outer met the core edge (tools/check_cracks.mjs).
  // Fix: every outer vertex whose triangles reach the ring around the boundary is kept at least
  // `margin` below the lowest core height under those triangles. The outer then runs under the
  // core for one cell (hidden by the depth test, it fills sub-pixel seams) and meets the boundary
  // at or below the core edge, so nothing can be seen through; the core's skirts close the step
  // from outside views. The cost is a shallow trench one or two cells wide just outside the core.
  _seamOuterGrid() {
    const o = this.outer, c = this.core;
    const n = o.n, cell = o.size / (n - 1), half = o.size / 2, ch = c.size / 2;
    const cn = c.n, cs = c.size / (cn - 1), cg = c.grid;
    const g = new Float32Array(o.grid);
    const drop = TERRAIN.OUTER_DROP_M, margin = 3;
    // the outer mesh uses every 2nd texel on phones (see _build): its triangles span 2 cells there
    const span = cell * (this.mobile ? 2 : 1);
    const toIdx = (v) => (v + ch) / cs;
    let changed = 0;
    for (let r = 0; r < n; r++) {
      const z = -half + r * cell, az = Math.abs(z);
      if (az > ch + span) continue;
      for (let k = 0; k < n; k++) {
        const x = -half + k * cell, ax = Math.abs(x);
        if (ax > ch + span || Math.max(ax, az) < ch - 2 * span) continue; // outside the ring
        // lowest core height under this vertex's triangles (footprint: +-1 mesh step)
        const i0 = Math.max(0, Math.floor(toIdx(x - span))), i1 = Math.min(cn - 1, Math.ceil(toIdx(x + span)));
        const j0 = Math.max(0, Math.floor(toIdx(z - span))), j1 = Math.min(cn - 1, Math.ceil(toIdx(z + span)));
        if (i0 > i1 || j0 > j1) continue;
        let m = Infinity;
        for (let j = j0; j <= j1; j++) {
          const row = j * cn;
          for (let i = i0; i <= i1; i++) { const v = cg[row + i]; if (v < m) m = v; }
        }
        // the shader draws stored - drop; keep that `margin` under the core
        const inside = ax < ch && az < ch;
        const v = inside ? m + drop - margin : Math.min(g[r * n + k], m + drop - margin);
        if (v !== g[r * n + k]) changed++;
        g[r * n + k] = v;
      }
    }
    this.info.seamVertices = changed;
    this.seamRing = ch - span; // the outer is drawn from here outward (uHole)
    return g;
  }

  _chunkMean(r, c, cps) {
    const core = this.core, n = core.n, cells = (n - 1) / cps;
    let s = 0, k = 0;
    for (let i = 0; i <= cells; i += 16) for (let j = 0; j <= cells; j += 16) {
      s += core.grid[(r * cells + i) * n + c * cells + j]; k++;
    }
    return s / k;
  }
  _edgeMin() {
    const d = this.outer || this.core;
    const n = d.n;
    let m = Infinity;
    for (let i = 0; i < n; i++) {
      m = Math.min(m, d.grid[i], d.grid[(n - 1) * n + i], d.grid[i * n], d.grid[i * n + n - 1]);
    }
    return Number.isFinite(m) ? m : 0;
  }

  _setTileTexture(tr, tc, tex) {
    const m = this.tileMats && this.layout ? this.tileMats[tr * this.layout.tileGrid + tc] : null;
    if (!m) { tex.dispose(); closeImage(tex); return; }
    m.uniforms.uMap.value = tex;
    m.uniforms.uHasMap.value = 1;
    this._disposables.push(tex);
  }
  _setOuterTexture(tex) {
    this.outerTexture = tex;
    this._disposables.push(tex);
    if (this.outerMat) {
      this.outerMat.uniforms.uMap.value = tex;
      this.outerMat.uniforms.uHasMap.value = 1;
    }
    // core tiles fade toward the outer imagery over the last stretch before the core edge
    if (this.outer && this.core) {
      const ho = this.outer.size / 2, hc = this.core.size / 2;
      const [b0, b1, k] = TERRAIN.EDGE_BLEND;
      for (const m of this.tileMats || []) {
        m.uniforms.uOuterMap.value = tex;
        m.uniforms.uOuterRect.value.set(-ho, -ho, 1 / this.outer.size, 1 / this.outer.size);
        m.uniforms.uEdgeBlend.value.set(hc - b0, hc - b1, k);
      }
    }
  }

  async _loadTextures(meta) {
    const base = this.base;
    const mob = this.smallTextures;
    const gen = this._gen;
    const jobs = [];
    if (meta.outer && meta.outer.tex) {
      const f = mob && meta.outer.tex.mobile_file ? meta.outer.tex.mobile_file : meta.outer.tex.file;
      jobs.push({ url: base + f, apply: (t) => this._setOuterTexture(t) });
    }
    const tx = meta.core.tex;
    if (tx) {
      const grid = tx.grid || 3;
      const pattern = mob && tx.mobile_file ? tx.mobile_file : tx.file;
      // centre tile first, then the rest
      const order = [];
      for (let r = 0; r < grid; r++) for (let c = 0; c < grid; c++) order.push([r, c]);
      const mid = (grid - 1) / 2;
      order.sort((a, b) => Math.hypot(a[0] - mid, a[1] - mid) - Math.hypot(b[0] - mid, b[1] - mid));
      for (const [r, c] of order) {
        const f = pattern.replace('{row}', r).replace('{col}', c);
        jobs.push({ url: base + f, apply: (t) => this._setTileTexture(r, c, t) });
      }
    }
    this.info.texturesWanted = jobs.length;
    // up to 3 in flight; uploads are applied one per frame from the queue
    let next = 0;
    let done;
    this.texturesDone = new Promise((r) => { done = r; });
    const worker = async () => {
      while (next < jobs.length) {
        const job = jobs[next++];
        try {
          const blob = await fetchBlob(job.url);
          const bmp = await createImageBitmap(blob);
          if (gen !== this._gen) { bmp.close && bmp.close(); continue; } // disposed meanwhile
          const tex = new THREE.Texture(bmp);
          tex.flipY = false;
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = this.anisotropy;
          tex.generateMipmaps = true;
          tex.minFilter = THREE.LinearMipmapLinearFilter;
          tex.needsUpdate = true;
          this._texQueue.push({ tex, apply: job.apply, gen });
        } catch (e) {
          this._warn(`imagery ${job.url.split('/').pop()} failed (${e.message})`);
        }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    done(true);
  }

  // Debug: show one LOD level on every chunk (tools/check_cracks.mjs isolates LOD seams this way).
  forceLod(level) {
    for (const ch of this.chunks || []) {
      ch.autoUpdate = false;
      const n = ch.levels.length;
      ch.levels.forEach((l, i) => { l.object.visible = i === Math.min(Math.max(0, level | 0), n - 1); });
    }
  }

  // Upload everything that is queued now (used before debug screenshots).
  flushTextures() {
    while (this._texQueue.length) this.update();
  }

  // Call once per frame: uploads at most one queued texture.
  update() {
    const job = this._texQueue.shift();
    if (job) {
      if (job.gen !== this._gen) { job.tex.dispose(); closeImage(job.tex); return; }
      try { this.renderer.initTexture(job.tex); } catch { /* upload on first use */ }
      job.apply(job.tex);
      this.info.textures++;
    }
  }

  _clearMeshes() {
    for (const ch of [...this.group.children]) this.group.remove(ch);
    for (const d of this._disposables) {
      if (d.dispose) d.dispose();
      if (d.isTexture) closeImage(d); // the decoded bitmap, not only the GPU copy
    }
    this._disposables = [];
    this.chunks = [];
    this.tileMats = [];
    this.outerMat = null;
    this.outerMesh = null;
    this._imgShadowDone = false;
    this._shadowSun = null;
  }

  // Free everything (GPU textures, decoded bitmaps, DEM grids); load() builds it again.
  dispose() {
    this._gen++;
    this._clearMeshes();
    for (const job of this._texQueue) { job.tex.dispose(); closeImage(job.tex); }
    this._texQueue = [];
    this.outerTexture = null;
    this.core = null;
    this.outer = null;
    this.demTex = null;
    this.outerDemTex = null;
    this.info.textures = 0;
    this.info.texturesWanted = 0;
    if (this._shadow) {
      for (const rt of Object.values(this._shadow.rt)) rt.dispose();
      this._shadow.mat.dispose();
      this._shadow.geo.dispose();
      this._shadow = null;
    }
    this.ready = false;
  }

  // ------------------------------------------------------------------ cast shadows
  _shadowConfig() {
    let swift = false;
    try {
      const gl = this.renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      swift = /swiftshader|llvmpipe|software/i.test(String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER)));
    } catch { /* unknown renderer */ }
    // software rendering (headless checks) and phones: smaller textures, fewer steps
    return this.mobile || swift ? SHADOW.LIGHT : SHADOW.FULL;
  }
  _ensureShadowPass() {
    if (this._shadow) return this._shadow;
    const cfg = this._shadowConfig();
    const mk = (size) => {
      const rt = new THREE.WebGLRenderTarget(size, size, { format: THREE.RedFormat, type: THREE.UnsignedByteType, depthBuffer: false, stencilBuffer: false, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
      rt.texture.wrapS = rt.texture.wrapT = THREE.ClampToEdgeWrapping;
      return rt;
    };
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uCoreDem: { value: null }, uCoreN: { value: new THREE.Vector2(1, 1) }, uCoreSize: { value: 1 },
        uOuterDem: { value: null }, uOuterN: { value: new THREE.Vector2(1, 1) }, uOuterSize: { value: 1 }, uHasOuter: { value: 0 },
        uSun: { value: new THREE.Vector3(0, 1, 0) }, uMaxH: { value: 3000 }, uRect: { value: new THREE.Vector4(0, 0, 1, 0) },
        uStep0: { value: 15 }, uGrow: { value: 1.07 },
      },
      vertexShader: SHADOW_VERT, fragmentShader: shadowFrag(cfg.steps),
      depthTest: false, depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    const scene = new THREE.Scene();
    scene.add(mesh);
    this._shadow = {
      cfg, geo, mat, scene, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1),
      rt: { core: mk(cfg.core), outer: mk(cfg.outer), imgCore: mk(cfg.core), imgOuter: mk(cfg.outer) },
    };
    return this._shadow;
  }
  // per-material uniforms (the textures are filled in once the pass exists)
  _shadowUniforms(part) {
    const sh = this._ensureShadowPass();
    const size = part === 'core' ? this.core.size : this.outer.size;
    return {
      uShadowMap: { value: part === 'core' ? sh.rt.core.texture : sh.rt.outer.texture },
      uImgShadowMap: { value: part === 'core' ? sh.rt.imgCore.texture : sh.rt.imgOuter.texture },
      uShadowRect: { value: new THREE.Vector4(-size / 2, -size / 2, 1 / size, 0) },
    };
  }
  _renderVisibility(sun, rtCore, rtOuter) {
    const sh = this._shadow, u = sh.mat.uniforms, c = this.core, o = this.outer;
    u.uCoreDem.value = this.demTex; u.uCoreN.value.set(c.n, c.n); u.uCoreSize.value = c.size;
    u.uHasOuter.value = o && this.outerDemTex ? 1 : 0;
    if (o && this.outerDemTex) { u.uOuterDem.value = this.outerDemTex; u.uOuterN.value.set(o.n, o.n); u.uOuterSize.value = o.size; }
    u.uMaxH.value = Math.max(c.max, o ? o.max : -Infinity) + 5;
    u.uSun.value.copy(sun);
    const r = this.renderer, prevRT = r.getRenderTarget(), prevAuto = r.autoClear;
    r.autoClear = true;
    const pass = (rt, size, step0, reach) => {
      u.uRect.value.set(-size / 2, -size / 2, size, 0);
      u.uStep0.value = step0;
      u.uGrow.value = Math.pow(reach / step0, 1 / sh.cfg.steps);
      r.setRenderTarget(rt);
      r.render(sh.scene, sh.cam);
    };
    // core: from one DEM cell out to 60 km (a 1,500 m wall at 1.5 deg sun); outer: coarser steps
    pass(rtCore, c.size, (c.size / (c.n - 1)) * 1.2, SHADOW.REACH_M);
    if (o && rtOuter) pass(rtOuter, o.size, (o.size / (o.n - 1)) * 1.2, SHADOW.REACH_M);
    r.setRenderTarget(prevRT);
    r.autoClear = prevAuto;
    this.info.shadowRenders++;
  }
  _setShadowsOn() {
    for (const m of [...(this.tileMats || []), this.outerMat]) if (m && m.uniforms.uShadowRect) m.uniforms.uShadowRect.value.w = 1;
  }
  // Call each frame in the terrain scenes with the sun direction (unit, toward the sun). Renders
  // the visibility again only when the sun moved more than SHADOW.MIN_DEG, at most every
  // SHADOW.MIN_MS; the photo's own sun is rendered once per build.
  updateShadows(sunDir) {
    if (!this.ready || !this.core || !this.demTex) return;
    this._wantSun = this._wantSun || new THREE.Vector3();
    this._wantSun.copy(sunDir);
    const sh = this._ensureShadowPass();
    if (!this._imgShadowDone) {
      const e = SHADOW.IMAGERY_SUN.ELEV_DEG * DEG, a = SHADOW.IMAGERY_SUN.AZ_DEG * DEG;
      this._renderVisibility(new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)), sh.rt.imgCore, sh.rt.imgOuter);
      this._imgShadowDone = true;
    }
    const now = performance.now();
    if (this._shadowSun) {
      if (angleDeg(sunDir, this._shadowSun) < SHADOW.MIN_DEG) return;
      if (now - this._shadowAt < SHADOW.MIN_MS) return;
      if (sunDir.y < -0.06) return; // the sun is down: no direct light to shade
    }
    this._renderVisibility(sunDir, sh.rt.core, sh.rt.outer);
    this._shadowSun = (this._shadowSun || new THREE.Vector3()).copy(sunDir);
    this._shadowAt = now;
    this._setShadowsOn();
  }
  // screenshots: the visibility matches the sun asked for last
  shadowsReady() {
    if (!this.ready || !this._wantSun) return true;
    if (!this._shadowSun) return false;
    return angleDeg(this._wantSun, this._shadowSun) < SHADOW.MIN_DEG || this._wantSun.y < -0.06;
  }
}
