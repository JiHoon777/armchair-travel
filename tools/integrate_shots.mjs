#!/usr/bin/env node
// Integration screenshots (INTEGRATE): the fixed list from the integration brief, desktop 1280x720
// and phone 390x844 (?lowres=1, device-metrics emulation), headless Chrome + SwiftShader WebGL.
// Needs the local server (tools/serve.sh). Output: docs/proto/shots/integrate/{desktop,mobile}-*.png
// and docs/proto/shots/integrate/shots.json (state, errors, warnings, time to ready per shot).
//
//   node tools/integrate_shots.mjs                 every shot, both sizes
//   node tools/integrate_shots.mjs desktop         one size
//   node tools/integrate_shots.mjs wide-010 deep   only these names (both sizes unless one is given)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, openPage, screenshot } from './lib/cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.OUT ? path.resolve(process.env.OUT) : path.join(ROOT, 'docs/proto/shots/integrate');
const BASE = process.env.BASE || 'http://localhost:8077';
const DAY = 'time=2026-10-13T17:30:00Z';    // 10:30 MST at the canyon
const NIGHT = 'time=2026-10-14T05:00:00Z';  // 22:00 MST
export const SHOTS = [
  ['home', DAY],
  ['descend-05', `scene=descend&t=5&still=1&${DAY}`],
  ['descend-25', `scene=descend&t=25&still=1&${DAY}`],
  ['wide-010', `scene=wide&t=10&still=1&${DAY}`],
  ['wide-120', `scene=wide&t=120&still=1&${DAY}`],
  ['approach-060', `scene=approach&t=60&still=1&${DAY}`],
  ['approach-170', `scene=approach&t=170&still=1&${DAY}`],
  ['stand-030', `scene=stand&t=30&still=1&${DAY}`],
  ['daylapse-020', `scene=daylapse&t=20&still=1&${DAY}`],
  ['daylapse-090', `scene=daylapse&t=90&still=1&${DAY}`],
  ['daylapse-160', `scene=daylapse&t=160&still=1&${DAY}`],
  ['cards', `scene=wide&t=60&still=1&open=cards&${DAY}`],
  ['deep', `scene=wide&t=60&still=1&open=deep&${DAY}`],
  ['credits', `open=credits&${DAY}`],
  ['night-home', NIGHT],
  ['night-toast', `scene=wide&t=10&still=1&${NIGHT}`],
  // added by FIX (2026-10-13): the views the review fixes changed
  ['descend-12', `scene=descend&t=12&still=1&${DAY}`],       // 500 m regional globe patch
  ['paused', `scene=wide&t=60&still=1&paused=1&${DAY}`],     // paused: sheet open, controls reachable
  ['stand-100', `scene=stand&t=100&still=1&${DAY}`],         // the 360 sweep stays on the canyon
];
const SIZES = {
  desktop: { w: 1280, h: 720, q: '' },
  mobile: { w: 390, h: 844, q: 'lowres=1&' },
  // phone held sideways (review R10): only a few views
  landscape: { w: 844, h: 390, q: 'lowres=1&', only: ['home', 'wide-010', 'paused', 'stand-100'] },
};

const args = process.argv.slice(2);
const sizes = Object.keys(SIZES).filter((s) => args.includes(s));
const names = args.filter((a) => !SIZES[a]);
const useSizes = sizes.length ? sizes : Object.keys(SIZES);
fs.mkdirSync(OUT, { recursive: true });
const logFile = path.join(OUT, 'shots.json');
let log = {};
try { log = JSON.parse(fs.readFileSync(logFile, 'utf8')); } catch { log = {}; }

const client = await launch({ width: 1280, height: 720 });
let bad = 0;
try {
  for (const size of useSizes) {
    const S = SIZES[size];
    for (const [name, q] of SHOTS) {
      if (names.length && !names.includes(name)) continue;
      if (S.only && !S.only.includes(name)) continue;
      const url = `${BASE}/?${S.q}${q}`;
      const r = await openPage(client, url, { width: S.w, height: S.h, mobile: size !== 'desktop' });
      // the toast and caption fade in with CSS transitions; give them a moment
      await new Promise((res) => setTimeout(res, 700));
      const file = path.join(OUT, `${size}-${name}.png`);
      await screenshot(client, file);
      const st = r.state || {};
      const extra = await client.eval(`JSON.stringify({ fps: __armchair.fps, cam: __armchair.camera, sun: __armchair.sun.elevation, toast: !document.getElementById('toast').hidden && document.getElementById('toast-text').textContent, caption: document.getElementById('caption-text').textContent, overflowX: document.documentElement.scrollWidth > innerWidth, warnings: __armchair.terrain.warnings })`).then(JSON.parse).catch(() => ({}));
      const ok = st.ready && !r.errors.length;
      if (!ok) bad++;
      log[`${size}-${name}`] = { url, ready: !!st.ready, ms: r.ms, state: st.state, scene: st.scene, t: st.t, terrain: st.terrain, pano: st.pano, globe: st.globe, errors: r.errors, warnings: r.warnings, ...extra };
      console.log(`${ok ? 'shot' : 'WARN'} ${size.padEnd(9)} ${name.padEnd(13)} ${(r.ms / 1000).toFixed(1)}s ready=${st.ready} ${st.state || ''}/${st.scene || '-'} terrain=${st.terrain || ''} pano=${st.pano || ''} fps=${extra.fps}${extra.toast ? ' toast="' + extra.toast.slice(0, 40) + '…"' : ''}${extra.overflowX ? ' OVERFLOW-X' : ''}${r.errors.length ? '\n     errors: ' + r.errors.join(' | ').slice(0, 600) : ''}`);
    }
  }
} finally {
  await client.close();
  fs.writeFileSync(logFile, JSON.stringify(log, null, 1));
}
process.exit(bad ? 1 : 0);
