// "Stand at the viewpoint": an equirectangular 360 photo on an inside-out sphere.
import * as THREE from 'three';
import { DEG, clamp } from './util.js';

export class Pano {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b1026);
    this.camera = new THREE.PerspectiveCamera(62, 1, 1, 2000);
    this.camera.rotation.order = 'YXZ';
    const g = new THREE.SphereGeometry(500, 96, 48);
    g.scale(-1, 1, 1); // inside-out without mirroring the photo
    // the photo is uploaded as decoded (row 0 = top) on every path: flip the sphere's v instead of
    // relying on createImageBitmap's imageOrientation option, which some browsers ignore
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
    this.material = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, transparent: true, opacity: 0 });
    this.mesh = new THREE.Mesh(g, this.material);
    this.scene.add(this.mesh);
    this.meta = null;
    this.texture = null;
    this.ready = false;
    this.failed = false;
    this._loading = null;
    this.opacity = 0;
  }

  async loadMeta(base) {
    if (this.meta) return this.meta;
    try {
      const res = await fetch(base + 'pano.json');
      if (!res.ok) throw new Error(res.status + ' pano.json');
      this.meta = await res.json();
    } catch (e) {
      this.meta = null;
      this.failed = true;
      console.warn('[pano]', e.message);
    }
    return this.meta;
  }

  // Loads the image (mobile size when asked). Resolves true when the texture is ready.
  load(base, mobile) {
    if (this.ready) return Promise.resolve(true);
    if (this._loading) return this._loading;
    this._loading = (async () => {
      const meta = await this.loadMeta(base);
      if (!meta || !meta.file) { this.failed = true; return false; }
      const file = mobile && meta.file_mobile ? meta.file_mobile : meta.file;
      try {
        const res = await fetch(base + file);
        if (!res.ok) throw new Error(res.status + ' ' + file);
        const blob = await res.blob();
        let tex;
        try {
          const bmp = await createImageBitmap(blob);
          tex = new THREE.Texture(bmp);
        } catch {
          const img = new Image();
          const url = URL.createObjectURL(blob);
          img.src = url;
          try { await img.decode(); } finally { URL.revokeObjectURL(url); }
          tex = new THREE.Texture(img);
        }
        tex.flipY = false; // the sphere's v is flipped (constructor)
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.generateMipmaps = true;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.anisotropy = 4;
        tex.needsUpdate = true;
        this.texture = tex;
        this.material.map = tex;
        this.material.needsUpdate = true;
        // photo's main view direction faces the camera at heading 0 (see paths.js 'pano')
        const u0 = Number.isFinite(meta.initial_yaw_deg) ? meta.initial_yaw_deg : 180;
        this.mesh.rotation.y = u0 * DEG + Math.PI / 2;
        this.ready = true;
        this.failed = false;
        return true;
      } catch (e) {
        console.warn('[pano]', e.message);
        this.failed = true;
        return false;
      } finally {
        this._loading = null;
      }
    })();
    return this._loading;
  }

  // heading: degrees, + = turn right; pitch: degrees, + = up
  setView(headingDeg, pitchDeg, fov, aspect) {
    const cam = this.camera;
    cam.rotation.y = -headingDeg * DEG;
    cam.rotation.x = clamp(pitchDeg, -80, 80) * DEG;
    cam.rotation.z = 0;
    if (cam.fov !== fov || cam.aspect !== aspect) {
      cam.fov = fov; cam.aspect = aspect;
      cam.updateProjectionMatrix();
    }
  }

  setOpacity(a) {
    this.opacity = a;
    this.material.opacity = a;
    this.material.transparent = a < 0.999;
    this.mesh.visible = a > 0.001 && this.ready;
  }

  dispose() {
    if (this.texture) {
      this.texture.dispose();
      if (this.texture.image && this.texture.image.close) this.texture.image.close();
    }
    this.texture = null;
    this.material.map = null;
    this.material.needsUpdate = true;
    this.ready = false;
  }
}
