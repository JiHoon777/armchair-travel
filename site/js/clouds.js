// Full-screen cloud layer used to cross between the globe and the terrain (and back).
import * as THREE from 'three';

const VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;
const FRAG = /* glsl */`
uniform float uCover;
uniform float uTime;
uniform float uZoom;
uniform float uAspect;
uniform vec3 uLight;
uniform vec3 uShade;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return s;
}
void main() {
  vec2 c = vUv - 0.5;
  c.x *= uAspect;
  // radial zoom: clouds stream outward as we pass through them
  vec2 p = c / uZoom * 2.6 + vec2(uTime * 0.03, uTime * 0.01);
  float n = fbm(p * 1.4);
  float n2 = fbm(p * 3.1 + 4.0);
  float d = n * 0.75 + n2 * 0.25;
  float a = smoothstep(0.0, 1.0, (uCover - 0.5) * 3.0 + (d - 0.5) * 1.4 + 0.5);
  vec3 col = mix(uShade, uLight, smoothstep(0.35, 0.8, d));
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}
`;

export class CloudOverlay {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.uniforms = {
      uCover: { value: 0 }, uTime: { value: 0 }, uZoom: { value: 1 }, uAspect: { value: 1 },
      uLight: { value: new THREE.Color(0.92, 0.93, 0.96) }, uShade: { value: new THREE.Color(0.62, 0.66, 0.74) },
    };
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
    }));
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  // cover 0..1, zoom grows while passing through, night 0..1 darkens the clouds
  render(renderer, cover, time, zoom, aspect, night = 0) {
    if (cover < 0.002) return;
    const u = this.uniforms;
    u.uCover.value = cover;
    u.uTime.value = time;
    u.uZoom.value = zoom;
    u.uAspect.value = aspect;
    const k = 1 - 0.85 * night;
    u.uLight.value.setRGB(0.92 * k, 0.93 * k, 0.96 * k + 0.02 * night);
    u.uShade.value.setRGB(0.6 * k + 0.02 * night, 0.64 * k + 0.03 * night, 0.72 * k + 0.06 * night);
    const ac = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(this.scene, this.camera);
    renderer.autoClear = ac;
  }
}
