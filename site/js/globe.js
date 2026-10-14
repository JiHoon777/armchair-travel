// Home globe: day/night textures blended by the real sun, thin atmosphere, stars, pin projection,
// and two patches for the descend: the same Blue Marble at 500 m over about 1,200 km around the
// place (from ~5,000 km down), then the place's own 100 km aerial imagery (from ~2,500 km down).
// Textures are uploaded as decoded (row 0 = north); the shaders flip v where the sphere needs it,
// instead of relying on createImageBitmap's imageOrientation option (ignored by some browsers).
import * as THREE from 'three';
import { GLOBE, EARTH_R_M, TERRAIN } from './config.js';
import { subsolarPoint } from './sun.js';
import { ecef, homeGlobePose } from './paths.js';
import { LAND, landBits, isLand } from './landmask.js';
import { clamp, smoothstep, rng, llToLocal, localToLl, DEG, lerp as lerpN } from './util.js';

const EARTH_VERT = /* glsl */`
varying vec3 vN;
varying vec2 vUv;
varying vec3 vW;
void main() {
  vN = normalize(position);
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const EARTH_FRAG = /* glsl */`
uniform sampler2D uDay;
uniform sampler2D uNight;
uniform vec3 uSun;
uniform float uHasNight;
varying vec3 vN;
varying vec2 vUv;
varying vec3 vW;
void main() {
  vec3 n = normalize(vN);
  float ndl = dot(n, uSun);
  float dayAmt = smoothstep(-0.12, 0.16, ndl);
  vec2 tuv = vec2(vUv.x, 1.0 - vUv.y); // texture row 0 = north; the sphere's v is 1 at the north pole
  vec3 day = texture2D(uDay, tuv).rgb;
  float lit = 0.38 + 0.72 * clamp(ndl * 1.4 + 0.15, 0.0, 1.0);
  vec3 dayCol = day * lit;
  vec3 lights = texture2D(uNight, tuv).rgb;
  vec3 nightCol = day * 0.04 + lights * 1.5 * uHasNight;
  vec3 col = mix(nightCol, dayCol, dayAmt);
  vec3 v = normalize(cameraPosition - vW);
  float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  col += vec3(0.30, 0.52, 1.0) * fres * (0.12 + 0.8 * smoothstep(-0.25, 0.4, ndl));
  col += vec3(1.0, 0.5, 0.2) * exp(-pow(ndl / 0.07, 2.0)) * 0.18 * day;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;
const ATMO_VERT = /* glsl */`
varying vec3 vNv;
varying vec3 vNw;
void main() {
  vNv = normalize(normalMatrix * normal);
  vNw = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const ATMO_FRAG = /* glsl */`
uniform vec3 uSun;
varying vec3 vNv;
varying vec3 vNw;
void main() {
  float k = clamp(-vNv.z / 0.32, 0.0, 1.0);
  float glow = pow(k, 2.2) * (1.0 - smoothstep(0.92, 1.0, k) * 0.6);
  float lit = 0.12 + 0.88 * smoothstep(-0.35, 0.35, dot(vNw, uSun));
  gl_FragColor = vec4(vec3(0.32, 0.56, 1.0) * glow * lit * 0.9, 1.0);
  #include <colorspace_fragment>
}
`;
const PATCH_FRAG = /* glsl */`
uniform sampler2D uMap;
uniform vec3 uSun;
uniform float uOpacity;
uniform vec2 uFeather;     // squircle radius band of the edge fade (0 centre .. 1 edge)
uniform float uNightAlpha; // opacity on the night side
uniform vec3 uGrade;       // the terrain's imagery grade (gamma, saturation, warmth): same look after the swap
varying vec2 vUv;
varying vec3 vN;
void main() {
  vec3 c = texture2D(uMap, vUv).rgb;
  c = pow(max(c, vec3(0.0)), vec3(uGrade.x));
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = max(mix(vec3(lum), c, uGrade.y), vec3(0.0)) * vec3(1.0 + uGrade.z, 1.0, 1.0 - uGrade.z);
  float ndl = dot(normalize(vN), uSun);
  float dayAmt = smoothstep(-0.12, 0.16, ndl);
  float lit = 0.38 + 0.72 * clamp(ndl * 1.4 + 0.15, 0.0, 1.0);
  c = mix(c * 0.04, c * lit, dayAmt);
  // rounded-square fade (a squircle): solid in the middle, soft toward every edge
  vec2 q = abs(vUv - 0.5) * 2.0;
  float d = pow(pow(q.x, 4.0) + pow(q.y, 4.0), 0.25);
  float a = 1.0 - smoothstep(uFeather.x, uFeather.y, d);
  // at night the base globe (with its city lights) shows through
  a *= mix(uNightAlpha, 1.0, dayAmt);
  gl_FragColor = vec4(c, a * uOpacity);
  #include <colorspace_fragment>
}
`;
const PATCH_VERT = /* glsl */`
varying vec2 vUv;
varying vec3 vN;
void main() {
  vUv = uv;
  vN = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

function fallbackDayCanvas() {
  const W = 1024, H = 512;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c2 = cv.getContext('2d');
  const img = c2.createImageData(W, H);
  const bits = landBits();
  const coverage = (lat, lon) => {
    const fr = (LAND.latTop - lat) / LAND.step - 0.5, fc = (lon + 180) / LAND.step - 0.5;
    const r0 = Math.floor(fr), c0 = Math.floor(fc), tr = fr - r0, tc = fc - c0;
    const at = (r, c) => (r < 0 || r >= LAND.rows) ? (lat < -60 ? 1 : 0) : isLand(bits, r, ((c % LAND.cols) + LAND.cols) % LAND.cols);
    return (at(r0, c0) * (1 - tc) + at(r0, c0 + 1) * tc) * (1 - tr) + (at(r0 + 1, c0) * (1 - tc) + at(r0 + 1, c0 + 1) * tc) * tr;
  };
  const rand = rng(3);
  for (let y = 0; y < H; y++) {
    const lat = 90 - ((y + 0.5) / H) * 180;
    const al = Math.abs(lat);
    let lr, lg, lb;
    if (al > 62) { lr = 0.86; lg = 0.88; lb = 0.9; }
    else if (al > 48) { lr = 0.3; lg = 0.4; lb = 0.26; }
    else if (al > 36) { lr = 0.42; lg = 0.45; lb = 0.3; }
    else if (al > 15) { lr = 0.72; lg = 0.6; lb = 0.42; }
    else { lr = 0.2; lg = 0.38; lb = 0.18; }
    const deep = 0.6 + 0.4 * Math.cos(lat * DEG);
    for (let x = 0; x < W; x++) {
      const lon = ((x + 0.5) / W) * 360 - 180;
      let cov = lat < -64 ? 1 : coverage(lat, lon);
      const land = smoothstep(0.3, 0.7, cov);
      const n = 0.92 + 0.16 * rand();
      const or = 0.03, og = 0.11 * deep, ob = 0.27 * deep;
      const ice = al > 74 ? 0.7 : 0;
      const r = (or + (lr - or) * land) * n, g = (og + (lg - og) * land) * n, b = (ob + (lb - ob) * land) * n;
      const k = (y * W + x) * 4;
      img.data[k] = 255 * Math.pow(clamp(r + (0.85 - r) * ice * (1 - land), 0, 1), 1 / 2.2);
      img.data[k + 1] = 255 * Math.pow(clamp(g + (0.88 - g) * ice * (1 - land), 0, 1), 1 / 2.2);
      img.data[k + 2] = 255 * Math.pow(clamp(b + (0.9 - b) * ice * (1 - land), 0, 1), 1 / 2.2);
      img.data[k + 3] = 255;
    }
  }
  c2.putImageData(img, 0, 0);
  return cv;
}

// Grid on the sphere over a lat/lon box or a local square; uv (0,0) = north-west corner.
function patchGeometry(N, pointAt, lift) {
  const pos = new Float32Array((N + 1) * (N + 1) * 3), uv = new Float32Array((N + 1) * (N + 1) * 2);
  const p = {};
  for (let r = 0; r <= N; r++) for (let c = 0; c <= N; c++) {
    pointAt(c / N, r / N, p);
    const i = r * (N + 1) + c;
    pos[i * 3] = p.x * lift; pos[i * 3 + 1] = p.y * lift; pos[i * 3 + 2] = p.z * lift;
    uv[i * 2] = c / N; uv[i * 2 + 1] = r / N;
  }
  const idx = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const a = r * (N + 1) + c, b = a + 1, d = a + N + 1, e = d + 1;
    idx.push(a, d, b, b, d, e);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

export class Globe {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05081a);
    this.camera = new THREE.PerspectiveCamera(GLOBE.FOV, 1, 0.001, 200);
    this.sun = new THREE.Vector3(1, 0, 0);
    this.uniforms = {
      uDay: { value: null },
      uNight: { value: null },
      uSun: { value: this.sun },
      uHasNight: { value: 0 },
    };
    const geo = new THREE.SphereGeometry(GLOBE.RADIUS, 160, 80);
    this.earth = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: EARTH_VERT, fragmentShader: EARTH_FRAG }));
    this.scene.add(this.earth);
    this.atmo = new THREE.Mesh(
      new THREE.SphereGeometry(GLOBE.RADIUS * 1.045, 96, 48),
      new THREE.ShaderMaterial({ uniforms: { uSun: { value: this.sun } }, vertexShader: ATMO_VERT, fragmentShader: ATMO_FRAG, side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }),
    );
    this.scene.add(this.atmo);
    this.scene.add(this._stars());
    // fallback day texture right away so the first frame shows a globe
    const fb = new THREE.CanvasTexture(fallbackDayCanvas());
    fb.flipY = false; // row 0 = north, like the photo textures (EARTH_FRAG flips v)
    fb.colorSpace = THREE.SRGBColorSpace;
    this.uniforms.uDay.value = fb;
    this.fallbackTex = fb;
    this.source = 'fallback';
    this.credit = [];
    this.home = { lat: GLOBE.HOME_LAT, lon: 0, dist: GLOBE.HOME_DIST };
    this._pose = {};
    this._v = new THREE.Vector3();
    this._p = {};
    this.patch = null;
    this.region = null;
  }

  _stars() {
    const n = 1800, R = 60;
    const pos = new Float32Array(n * 3);
    const rand = rng(11);
    for (let i = 0; i < n; i++) {
      const u = rand() * 2 - 1, th = rand() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      pos[i * 3] = r * Math.cos(th) * R; pos[i * 3 + 1] = u * R; pos[i * 3 + 2] = r * Math.sin(th) * R;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ color: 0xc8d2ff, size: 1.3, sizeAttenuation: false, transparent: true, opacity: 0.75, depthWrite: false });
    const p = new THREE.Points(g, m);
    p.frustumCulled = false;
    return p;
  }

  async load(base, mobile) {
    let meta = null;
    try {
      const res = await fetch(base + 'globe.json');
      if (!res.ok) throw new Error(res.status + ' globe.json');
      meta = await res.json();
    } catch (e) {
      console.warn('[globe]', e.message, '- keeping the fallback globe');
      return false;
    }
    this.credit = Array.isArray(meta.credit) ? meta.credit : meta.credit ? [meta.credit] : [];
    const pick = (o) => (o ? (mobile && o.mobile ? o.mobile : o.file) : null);
    const loadTex = async (file) => {
      const res = await fetch(base + file);
      if (!res.ok) throw new Error(res.status + ' ' + file);
      const bmp = await createImageBitmap(await res.blob());
      const t = new THREE.Texture(bmp);
      t.flipY = false; // as decoded: row 0 = north
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      t.needsUpdate = true;
      return t;
    };
    try {
      const day = await loadTex(pick(meta.day));
      this.uniforms.uDay.value = day;
      this.source = 'data';
      this.fallbackTex.dispose();
    } catch (e) { console.warn('[globe] day texture', e.message); }
    try {
      if (meta.night) {
        const night = await loadTex(pick(meta.night));
        this.uniforms.uNight.value = night;
        this.uniforms.uHasNight.value = 1;
      }
    } catch (e) { console.warn('[globe] night texture', e.message); }
    // the 500 m regional patch is not needed for the first view: load it after the globe
    const R = meta.region;
    if (R && R.file && [R.lat_top_deg, R.lat_bottom_deg, R.lon_left_deg, R.lon_right_deg].every(Number.isFinite)) {
      loadTex(pick(R)).then((t) => this.setRegion(t, R)).catch((e) => console.warn('[globe] region patch', e.message));
    }
    return true;
  }

  // The same Blue Marble at 500 m over a lat/lon box around the place (globe.json "region").
  setRegion(texture, box) {
    if (this.region) { this.scene.remove(this.region); this.region.geometry.dispose(); this.region.material.dispose(); }
    const lift = 1 + 1100 / EARTH_R_M;
    const g = patchGeometry(40, (u, v, out) => ecef(lerpN(box.lat_top_deg, box.lat_bottom_deg, v), lerpN(box.lon_left_deg, box.lon_right_deg, u), out), lift);
    const m = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: texture }, uSun: { value: this.sun }, uOpacity: { value: 0 }, uFeather: { value: new THREE.Vector2(0.72, 0.99) }, uNightAlpha: { value: 0 }, uGrade: { value: new THREE.Vector3(1, 1, 0) } },
      vertexShader: PATCH_VERT, fragmentShader: PATCH_FRAG, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2, side: THREE.DoubleSide,
    });
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.region = new THREE.Mesh(g, m);
    this.region.renderOrder = 1;
    this.region.visible = false;
    this.scene.add(this.region);
  }

  // The place's own imagery draped on the globe (100 km square), faded toward its edges.
  setPatch(texture, sizeM) {
    if (!texture || this.patch) return;
    const half = sizeM / 2;
    const ll = {};
    const g = patchGeometry(24, (u, v, out) => { localToLl(-half + u * sizeM, -half + v * sizeM, ll); return ecef(ll.lat, ll.lon, out); }, 1 + 1800 / EARTH_R_M);
    const m = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: texture }, uSun: { value: this.sun }, uOpacity: { value: 0 }, uFeather: { value: new THREE.Vector2(0.4, 0.97) }, uNightAlpha: { value: 1 }, uGrade: { value: new THREE.Vector3(TERRAIN.GRADE[0], TERRAIN.GRADE[1], TERRAIN.GRADE[2]) } },
      vertexShader: PATCH_VERT, fragmentShader: PATCH_FRAG, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, side: THREE.DoubleSide,
    });
    this.patch = new THREE.Mesh(g, m);
    this.patch.renderOrder = 2;
    this.scene.add(this.patch);
  }
  get patchTexture() { return this.patch ? this.patch.material.uniforms.uMap.value : null; }
  // a reloaded terrain brings a new texture: use it (the old one has been freed)
  setPatchTexture(texture) { if (this.patch) this.patch.material.uniforms.uMap.value = texture; }

  clearPatch() {
    if (!this.patch) return;
    this.scene.remove(this.patch);
    this.patch.geometry.dispose();
    this.patch.material.dispose();
    this.patch = null;
  }

  updateSun(ms) {
    const s = subsolarPoint(ms);
    const p = ecef(s.lat, s.lon, this._p);
    this.sun.set(p.x, p.y, p.z);
  }

  // pose from paths.js (space 'globe') or the home pose
  applyPose(pose, aspect, viewOffset) {
    const cam = this.camera;
    cam.position.set(pose.gx, pose.gy, pose.gz);
    cam.up.set(pose.ux, pose.uy, pose.uz);
    cam.lookAt(pose.gtx, pose.gty, pose.gtz);
    const dist = Math.hypot(pose.gx, pose.gy, pose.gz);
    const alt = Math.max(dist - 1, 1e-6);
    cam.near = clamp(alt * 0.25, 2e-5, 0.5);
    cam.far = dist + 70;
    cam.fov = pose.fov;
    cam.aspect = aspect;
    if (viewOffset) cam.setViewOffset(viewOffset.fullW, viewOffset.fullH, viewOffset.x, viewOffset.y, viewOffset.w, viewOffset.h);
    else cam.clearViewOffset();
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    if (this.patch) this.patch.material.uniforms.uOpacity.value = 1 - smoothstep(600000, 2500000, pose.altM);
    if (this.region) {
      const a = 1 - smoothstep(3000000, 5500000, pose.altM);
      this.region.material.uniforms.uOpacity.value = a;
      this.region.visible = a > 0.002;
    }
  }

  homePose(lat, lon, dist) {
    return homeGlobePose(lat, lon, dist, this._pose);
  }

  // Screen position of (lat, lon) in CSS pixels; visible false when behind the globe.
  project(lat, lon, w, h, out = {}) {
    const p = ecef(lat, lon, this._p);
    const v = this._v.set(p.x, p.y, p.z);
    const cam = this.camera.position;
    const facing = (cam.x - v.x) * v.x + (cam.y - v.y) * v.y + (cam.z - v.z) * v.z;
    v.project(this.camera);
    out.x = (v.x * 0.5 + 0.5) * w;
    out.y = (-v.y * 0.5 + 0.5) * h;
    out.visible = facing > 0.02 && v.z < 1;
    out.facing = facing;
    return out;
  }
}
