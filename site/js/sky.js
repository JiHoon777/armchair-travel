// Sky for the terrain scenes: three/addons Sky (Preetham) driven by the real sun, a twilight/night
// dome for when the sun is below the horizon, haze colours that match the rendered horizon,
// gentle terrain light, exposure by sun height, and stars below -6 deg.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { smoothstep, lerp, DEG, rng } from './util.js';
import { TERRAIN } from './config.js';
import { SKY_PARAMS, skyRadiance, acesFilmic, exposureFor, twilightAmounts, twilightColor, SKY_SUN_MIN_DEG } from './skymath.js';

const DOME_VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vDir = wp.xyz - cameraPosition;
  gl_Position = projectionMatrix * viewMatrix * wp;
  gl_Position.z = gl_Position.w;
}
`;
const DOME_FRAG = /* glsl */`
uniform vec3 uSunDir;
uniform float uCover;
uniform float uNight;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float e = d.y;
  vec2 sh = normalize(uSunDir.xz + vec2(1e-5));
  float toward = dot(normalize(d.xz + vec2(1e-5)), sh) * 0.5 + 0.5;
  float hfall = exp(-max(e, 0.0) * 6.0);
  float t3 = toward * toward * toward;
  vec3 zen = vec3(0.03, 0.05, 0.13);
  vec3 hz = mix(vec3(0.30, 0.2, 0.32), vec3(0.9, 0.42, 0.17), t3);
  vec3 tw = mix(zen, hz, hfall);
  vec3 nz = mix(vec3(0.004, 0.007, 0.02), vec3(0.016, 0.024, 0.05), exp(-max(e, 0.0) * 4.0));
  vec3 col = mix(tw, nz, uNight);
  gl_FragColor = vec4(col, uCover);
  #include <colorspace_fragment>
}
`;

function mixArr(a, b, t, o) { o[0] = lerp(a[0], b[0], t); o[1] = lerp(a[1], b[1], t); o[2] = lerp(a[2], b[2], t); return o; }
const WARM = new THREE.Color(1.0, 0.55, 0.27), WHITE = new THREE.Color(1.0, 0.97, 0.92);
const AMB_DAY = TERRAIN.AMB_DAY, AMB_GOLD = [0.2, 0.23, 0.36], AMB_TW = [0.11, 0.13, 0.22], AMB_NIGHT = [0.03, 0.04, 0.085];

export class SkySystem {
  constructor(scene, renderer, terrainUniforms) {
    this.renderer = renderer;
    this.u = terrainUniforms;
    this.scene = scene;
    this.sky = new Sky();
    this.sky.scale.setScalar(2400000);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -3;
    const su = this.sky.material.uniforms;
    for (const k of Object.keys(SKY_PARAMS)) su[k].value = SKY_PARAMS[k];
    scene.add(this.sky);
    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(2000000, 32, 16),
      new THREE.ShaderMaterial({
        uniforms: { uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uCover: { value: 0 }, uNight: { value: 0 } },
        vertexShader: DOME_VERT, fragmentShader: DOME_FRAG,
        side: THREE.BackSide, transparent: true, depthWrite: false, toneMapped: false,
      }),
    );
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -2;
    scene.add(this.dome);
    scene.fog = new THREE.FogExp2(0x9aa7b8, 1 / 120000); // kept in sync for any built-in material
    this.sunDir = new THREE.Vector3(0, 1, 0);
    this._skySun = new THREE.Vector3(0, 1, 0);
    this.elev = 45; this.az = 180; this.night = 0; this.day = 1;
    this._tmp = [0, 0, 0];
    this._s = [0, 1, 0]; this._dT = [0, 0, 0]; this._dA = [0, 0, 0]; this._dS = [0, 0, 0];
    this._fa = [0, 0, 0]; this._fs = [0, 0, 0]; this._ft = [0, 0, 0]; this._amb = [0, 0, 0];
    this._twA = [0, 0, 0]; this._twT = [0, 0, 0];
    this.ambDay = AMB_DAY.slice();   // tunables (config TERRAIN)
    this.hazeElevDeg = TERRAIN.HAZE_FROM_ELEV_DEG;
    this.sunDay = TERRAIN.SUN_DAY;
    this.bounce = TERRAIN.BOUNCE;
    this.stars = this._makeStars();
    scene.add(this.stars);
  }

  _makeStars() {
    const n = 2600, R = 300000;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    const rand = rng(7);
    for (let i = 0; i < n; i++) {
      const u = rand(), v = rand();
      const th = 2 * Math.PI * u, y = v * 1.02 - 0.02;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      pos[i * 3] = Math.cos(th) * r * R; pos[i * 3 + 1] = y * R; pos[i * 3 + 2] = Math.sin(th) * r * R;
      const b = 0.35 + 0.65 * Math.pow(rand(), 3);
      const tint = rand();
      col[i * 3] = b * (tint > 0.8 ? 1 : 0.85); col[i * 3 + 1] = b * 0.9; col[i * 3 + 2] = b * (tint < 0.3 ? 1 : 0.92);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, fog: false, toneMapped: false });
    const p = new THREE.Points(g, m);
    p.frustumCulled = false;
    p.renderOrder = -1;
    return p;
  }

  // elevDeg / azDeg: the real sun at the place for the scene clock (deg; azimuth clockwise from north).
  update(elevDeg, azDeg, camera) {
    this.elev = elevDeg; this.az = azDeg;
    const el = elevDeg * DEG, az = azDeg * DEG;
    const c = Math.cos(el);
    this.sunDir.set(Math.sin(az) * c, Math.sin(el), -Math.cos(az) * c);
    // the Preetham sky gets the sun clamped just below the horizon; the dome handles the rest
    const se = Math.max(elevDeg, SKY_SUN_MIN_DEG) * DEG, sc = Math.cos(se);
    this._skySun.set(Math.sin(az) * sc, Math.sin(se), -Math.cos(az) * sc);
    this.sky.material.uniforms.sunPosition.value.copy(this._skySun);
    const exposure = exposureFor(elevDeg);
    this.renderer.toneMappingExposure = exposure;
    const tw = twilightAmounts(elevDeg);
    const du = this.dome.material.uniforms;
    du.uSunDir.value.copy(this.sunDir);
    du.uCover.value = tw.cover;
    du.uNight.value = tw.night;
    this.dome.visible = tw.cover > 0.001;
    // horizon colours toward / away from the sun, 1.5 deg up, as they appear on screen (linear)
    const s = this._s; s[0] = this._skySun.x; s[1] = this._skySun.y; s[2] = this._skySun.z;
    const h = this.hazeElevDeg * DEG, ch = Math.cos(h), sh = Math.sin(h);
    const toward = this._dT, away = this._dA, side = this._dS;
    toward[0] = Math.sin(az) * ch; toward[1] = sh; toward[2] = -Math.cos(az) * ch;
    away[0] = -toward[0]; away[1] = sh; away[2] = -toward[2];
    side[0] = Math.cos(az) * ch; side[1] = sh; side[2] = Math.sin(az) * ch;
    const fa = acesFilmic(skyRadiance(away, s, SKY_PARAMS, this._tmp), exposure, this._fa);
    const fsd = acesFilmic(skyRadiance(side, s, SKY_PARAMS, this._tmp), exposure, this._fs);
    const ft = acesFilmic(skyRadiance(toward, s, SKY_PARAMS, this._tmp), exposure, this._ft);
    // away colour uses the side direction half-way: less contrast in the haze
    mixArr(fa, fsd, 0.5, fa);
    const twA = twilightColor(sh, 0.0, tw.night, this._twA), twT = twilightColor(sh, 1.0, tw.night, this._twT);
    mixArr(fa, twA, tw.cover, fa);
    mixArr(ft, twT, tw.cover, ft);
    this.u.uFogA.value.setRGB(fa[0], fa[1], fa[2], THREE.LinearSRGBColorSpace);
    this.u.uFogS.value.setRGB(ft[0], ft[1], ft[2], THREE.LinearSRGBColorSpace);
    // the sky's own colour just above the horizon all the way round (the haze meets it there)
    const h0 = 0.3 * DEG, c0 = Math.cos(h0), s0 = Math.sin(h0);
    const hv = this.u.uHorizon.value, hd = this._hd || (this._hd = [0, 0, 0]), hc = this._hc || (this._hc = [0, 0, 0]), tc = this._tc || (this._tc = [0, 0, 0]);
    for (let i = 0; i < hv.length; i++) {
      const a = (i / hv.length) * 2 * Math.PI;
      hd[0] = Math.sin(a) * c0; hd[1] = s0; hd[2] = -Math.cos(a) * c0;
      acesFilmic(skyRadiance(hd, s, SKY_PARAMS, this._tmp), exposure, hc);
      if (tw.cover > 0.001) {
        const toward = Math.cos(a - az) * 0.5 + 0.5; // as the dome shader: d.xz against the sun's xz
        mixArr(hc, twilightColor(s0, toward, tw.night, tc), tw.cover, hc);
      }
      hv[i].set(hc[0], hc[1], hc[2]);
    }
    this.scene.fog.color.copy(this.u.uFogA.value);
    // terrain light: the imagery already has shadows, so direct light stays gentle
    this.night = tw.night;
    this.day = smoothstep(-2, 14, elevDeg);
    // low sun: warm, strong direct light and a dim blue sky light, so walls facing the sun glow
    // and the rest falls into shade (the imagery's own midday shadows stay underneath)
    const golden = smoothstep(-3, 3, elevDeg) * (1 - smoothstep(6, 22, elevDeg));
    const sunK = smoothstep(-1.0, 2.0, elevDeg) * lerp(0.7, this.sunDay, smoothstep(4, 25, elevDeg));
    this.u.uSunColor.value.copy(WARM).lerp(WHITE, smoothstep(3, 30, elevDeg)).multiplyScalar(sunK);
    const a = this._amb;
    if (elevDeg >= 0) mixArr(AMB_GOLD, this.ambDay, smoothstep(0, 18, elevDeg), a);
    else if (elevDeg >= -6) mixArr(AMB_TW, AMB_GOLD, smoothstep(-6, 0, elevDeg), a);
    else mixArr(AMB_NIGHT, AMB_TW, smoothstep(-12, -6, elevDeg), a);
    this.u.uAmbient.value.setRGB(a[0], a[1], a[2], THREE.LinearSRGBColorSpace);
    // light bounced off sunlit red rock into the shade (warm), only while the sun is up
    const bk = this.bounce * smoothstep(-1, 8, elevDeg);
    this.u.uBounce.value.setRGB(bk * 1.0, bk * 0.62, bk * 0.36, THREE.LinearSRGBColorSpace);
    this.u.uShadeAmt.value = lerp(0.28, 0.85, golden);
    this.u.uSunDir.value.copy(this.sunDir);
    if (this.u.uSunDir.value.y < -0.05) { this.u.uSunDir.value.y = -0.05; this.u.uSunDir.value.normalize(); }
    // stars fade in below -6 deg
    this.stars.material.opacity = smoothstep(-6, -12, elevDeg) * 0.95;
    this.stars.visible = this.stars.material.opacity > 0.01;
    if (camera) this.stars.position.copy(camera.position);
  }
}
