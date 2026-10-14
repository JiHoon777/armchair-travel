#!/usr/bin/env node
// Crack / seam detector for the terrain (INTEGRATE). Renders camera poses with ?debug=crack
// (no sky, pure magenta background, no clouds, no GUI), then counts magenta pixels that are NOT
// connected to the sky at the top of the frame: those are holes in the terrain (cracks between
// LOD chunks, gaps at the core/outer seam, see-through notches). Needs tools/serve.sh.
//
//   node tools/check_cracks.mjs              desktop 1280x720 and phone 390x844 (lowres)
//   node tools/check_cracks.mjs desktop
// Annotated frames with holes go to docs/proto/shots/integrate/cracks-*.png (holes in green).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, openPage } from './lib/cdp.mjs';
import { decodePNG, encodePNG } from './lib/png.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs/proto/shots/integrate');
const BASE = process.env.BASE || 'http://localhost:8077';
const DAY = 'time=2026-10-13T17:30:00Z';
const POSES = [
  ['descend', 22], ['descend', 25], ['descend', 28],
  ['wide', 0], ['wide', 45], ['wide', 90], ['wide', 135], ['wide', 180],
  ['approach', 30], ['approach', 60], ['approach', 90], ['approach', 120], ['approach', 150], ['approach', 178],
  ['daylapse', 5], ['daylapse', 90], ['daylapse', 175],
  ['ascend', 2.5],
];
const SIZES = { desktop: { w: 1280, h: 720, q: '' }, mobile: { w: 390, h: 844, q: 'lowres=1&' } };
const argv = process.argv.slice(2);
const optv = (k) => { const i = argv.indexOf(k); if (i < 0) return null; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const EXTRA = optv('--q');                 // extra query, e.g. --q lod=0
const ONLY = optv('--only');               // e.g. --only descend-25,daylapse-90
const TAG = optv('--tag') || '';           // file name tag for annotated frames
const want = argv.filter((a) => SIZES[a]);
const sizes = want.length ? want : Object.keys(SIZES);

function holes(img) {
  const { width: W, height: H, channels: ch, data } = img;
  const mag = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const r = data[i * ch], g = data[i * ch + 1], b = data[i * ch + 2];
    mag[i] = r > 150 && b > 150 && g < 110 && Math.abs(r - b) < 90 ? 1 : 0;
  }
  // flood fill the sky from the top row
  const seen = new Uint8Array(W * H);
  const stack = [];
  for (let x = 0; x < W; x++) if (mag[x]) { seen[x] = 1; stack.push(x); }
  while (stack.length) {
    const i = stack.pop();
    const x = i % W, y = (i - x) / W;
    const nb = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1];
    for (const j of nb) if (j >= 0 && mag[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
  }
  let skyRows = 0;
  for (let y = 0; y < H; y++) { let any = false; for (let x = 0; x < W; x++) if (seen[y * W + x]) { any = true; break; } if (any) skyRows = y + 1; }
  // remaining magenta = holes; group into clusters
  const comp = new Int32Array(W * H).fill(-1);
  const clusters = [];
  for (let i = 0; i < W * H; i++) {
    if (!mag[i] || seen[i] || comp[i] >= 0) continue;
    const id = clusters.length;
    const c = { n: 0, x0: W, y0: H, x1: 0, y1: 0 };
    comp[i] = id; stack.push(i);
    while (stack.length) {
      const k = stack.pop();
      const x = k % W, y = (k - x) / W;
      c.n++; c.x0 = Math.min(c.x0, x); c.x1 = Math.max(c.x1, x); c.y0 = Math.min(c.y0, y); c.y1 = Math.max(c.y1, y);
      for (const j of [x > 0 ? k - 1 : -1, x < W - 1 ? k + 1 : -1, y > 0 ? k - W : -1, y < H - 1 ? k + W : -1]) {
        if (j >= 0 && mag[j] && !seen[j] && comp[j] < 0) { comp[j] = id; stack.push(j); }
      }
    }
    clusters.push(c);
  }
  clusters.sort((a, b) => b.n - a.n);
  const total = clusters.reduce((s, c) => s + c.n, 0);
  return { total, clusters, comp, skyRows };
}

function annotate(img, comp, file) {
  const { width: W, height: H, channels: ch, data } = img;
  const out = new Uint8Array(W * H * 3);
  for (let i = 0; i < W * H; i++) {
    if (comp[i] >= 0) { out[i * 3] = 0; out[i * 3 + 1] = 255; out[i * 3 + 2] = 0; }
    else { out[i * 3] = data[i * ch] * 0.45; out[i * 3 + 1] = data[i * ch + 1] * 0.45; out[i * 3 + 2] = data[i * ch + 2] * 0.45; }
  }
  fs.writeFileSync(file, encodePNG(W, H, out, 3));
}

const client = await launch();
let bad = 0;
const rows = [];
try {
  for (const size of sizes) {
    const S = SIZES[size];
    for (const [scene, t] of POSES) {
      if (ONLY && !ONLY.split(',').includes(`${scene}-${t}`)) continue;
      const url = `${BASE}/?${S.q}scene=${scene}&t=${t}&still=1&nogui=1&debug=crack&${DAY}${EXTRA ? '&' + EXTRA : ''}`;
      const r = await openPage(client, url, { width: S.w, height: S.h, mobile: size === 'mobile' });
      const shot = await client.send('Page.captureScreenshot', { format: 'png' });
      const img = decodePNG(Buffer.from(shot.data, 'base64'));
      const h = holes(img);
      const cam = await client.eval('JSON.stringify(__armchair.camera)').then(JSON.parse).catch(() => ({}));
      const name = `${size}-${scene}-${String(t).replace('.', '_')}${TAG ? '-' + TAG : ''}`;
      rows.push({ name, holes: h.total, clusters: h.clusters.length, top: h.clusters.slice(0, 3), errors: r.errors.length });
      if (h.total > 0) {
        bad++;
        annotate(img, h.comp, path.join(OUT, `cracks-${name}.png`));
      }
      console.log(`${h.total ? 'HOLES' : 'ok   '} ${name.padEnd(24)} hole px ${String(h.total).padStart(5)} in ${h.clusters.length} clusters${h.clusters.length ? ' (largest ' + h.clusters.slice(0, 3).map((c) => `${c.n}px @${c.x0},${c.y0}-${c.x1},${c.y1}`).join('; ') + ')' : ''}  cam ${cam.x},${cam.y},${cam.z} h${cam.heading} p${cam.pitch}${r.errors.length ? '  errors: ' + r.errors.join(' | ').slice(0, 200) : ''}`);
    }
  }
} finally {
  await client.close();
}
console.log(bad ? `\n${bad} frame(s) with holes` : '\nno holes in any frame');
process.exit(bad ? 1 : 0);
