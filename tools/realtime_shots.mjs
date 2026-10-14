#!/usr/bin/env node
// Real-time frames of the start of a tour (FIX): 「그냥 틀어 두기」 clicked on the home screen, then a
// screenshot each time the tour clock passes one of the marks below (seconds from the descend's
// start; 30 s and later are in the wide orbit). Headless SwiftShader runs at 4-20 fps, so a frame
// lands within about 0.3 s of its mark. Needs the local server (tools/serve.sh).
// Output: docs/proto/shots/realtime/rt-NN.png
//   node tools/realtime_shots.mjs [--w 1280 --h 720]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, openPage, screenshot } from './lib/cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.OUT ? path.resolve(process.env.OUT) : path.join(ROOT, 'docs/proto/shots/realtime');
const BASE = process.env.BASE || 'http://localhost:8077';
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? Number(args[i + 1]) : d; };
const W = opt('--w', 1280), H = opt('--h', 720);
const MARKS = [2, 6, 12, 18, 21, 24, 28, 34, 40];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

fs.mkdirSync(OUT, { recursive: true });
const client = await launch({ width: W, height: H });
try {
  const r = await openPage(client, `${BASE}/?time=2026-10-13T17:30:00Z`, { width: W, height: H });
  const b = await client.eval(`(() => { const r = document.getElementById('btn-play').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: b.x, y: b.y });
  for (const type of ['mousePressed', 'mouseReleased']) await client.send('Input.dispatchMouseEvent', { type, x: b.x, y: b.y, button: 'left', clickCount: 1 });
  const left = [...MARKS];
  const t0 = Date.now();
  while (left.length && Date.now() - t0 < 180000) {
    const s = JSON.parse(await client.eval(`JSON.stringify({ st: __armchair.state, sc: __armchair.scene, t: __armchair.t })`));
    const tour = s.st !== 'tour' ? -1 : s.sc === 'descend' ? s.t : s.sc === 'wide' ? 30 + s.t : 999;
    if (tour >= left[0]) {
      const m = left.shift();
      const file = path.join(OUT, `rt-${String(m).padStart(2, '0')}.png`);
      await screenshot(client, file);
      console.log(`rt-${String(m).padStart(2, '0')}  tour clock ${tour.toFixed(2)} s (${s.sc})`);
      while (left.length && tour >= left[0]) left.shift(); // missed marks on a slow frame
    }
    await sleep(40);
  }
  if (r.errors.length) console.log('errors:', r.errors.join(' | '));
} finally {
  await client.close();
}
