#!/usr/bin/env node
// Screenshots through the Chrome DevTools protocol (APP agent). Waits for the page's own
// readiness signal (window.__armchair.readyForShot) instead of a fixed virtual-time budget.
//   node tools/shots.mjs [names...]     see tools/shots.sh for the list
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, openPage, screenshot } from './lib/cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs/proto/shots');
const BASE = process.env.BASE || 'http://localhost:8077';
const DAY = 'time=2026-10-13T17:30:00Z';     // 10:30 at the canyon (MST)
const NIGHT = 'time=2026-10-13T09:11:00Z';   // 02:11 at the canyon
const D = [1280, 720], PH = [390, 844];
export const SHOTS = [
  ['home', D, DAY], ['home-night', D, NIGHT],
  ['descend-08', D, `scene=descend&t=8&still=1&${DAY}`],
  ['descend-17', D, `scene=descend&t=17&still=1&${DAY}`],
  ['descend-21', D, `scene=descend&t=21&still=1&${DAY}`],
  ['descend-27', D, `scene=descend&t=27&still=1&${DAY}`],
  ['wide-000', D, `scene=wide&t=0&still=1&${DAY}`],
  ['wide-060', D, `scene=wide&t=60&still=1&${DAY}`],
  ['wide-150', D, `scene=wide&t=150&still=1&${DAY}`],
  ['approach-060', D, `scene=approach&t=60&still=1&${DAY}`],
  ['approach-120', D, `scene=approach&t=120&still=1&${DAY}`],
  ['approach-178', D, `scene=approach&t=178&still=1&${DAY}`],
  ['stand-030', D, `scene=stand&t=30&still=1&${DAY}`],
  ['daylapse-010', D, `scene=daylapse&t=10&still=1&${DAY}`],
  ['daylapse-040', D, `scene=daylapse&t=40&still=1&${DAY}`],
  ['daylapse-090', D, `scene=daylapse&t=90&still=1&${DAY}`],
  ['daylapse-150', D, `scene=daylapse&t=150&still=1&${DAY}`],
  ['daylapse-172', D, `scene=daylapse&t=172&still=1&${DAY}`],
  ['ascend-007', D, `scene=ascend&t=7&still=1&${DAY}`],
  ['nogui-wide-090', D, `scene=wide&t=90&still=1&nogui=1&${DAY}`],
  ['night-wide-060', D, `scene=wide&t=60&still=1&${NIGHT}`],
  ['cards-open', D, `scene=wide&t=40&still=1&open=cards&${DAY}`],
  ['deep-open', D, `scene=wide&t=40&still=1&open=deep&${DAY}`],
  ['credits-open', D, `open=credits&${DAY}`],
  ['phone-home', PH, `lowres=1&${DAY}`],
  ['phone-cards', PH, `scene=approach&t=150&still=1&lowres=1&open=cards&${DAY}`],
  ['phone-wide-060', PH, `scene=wide&t=60&still=1&lowres=1&${DAY}`],
  ['phone-stand-030', PH, `scene=stand&t=30&still=1&lowres=1&${DAY}`],
];

const want = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
const client = await launch({ width: 1280, height: 720 });
let bad = 0;
try {
  for (const [name, [w, h], q] of SHOTS) {
    if (want.length && !want.includes(name)) continue;
    const url = `${BASE}/?${q}`;
    const r = await openPage(client, url, { width: w, height: h, mobile: w < 600 });
    const file = path.join(OUT, `${name}.png`);
    await screenshot(client, file);
    const st = r.state || {};
    const ok = st.ready && !r.errors.length;
    if (!ok) bad++;
    console.log(`${ok ? 'shot' : 'WARN'} ${name.padEnd(16)} ${(r.ms / 1000).toFixed(1)}s ready=${st.ready} ${st.state || ''} ${st.scene || ''} terrain=${st.terrain || ''} pano=${st.pano || ''} globe=${st.globe || ''}${r.errors.length ? '\n     errors: ' + r.errors.join(' | ').slice(0, 600) : ''}`);
  }
} finally {
  await client.close();
}
process.exit(bad ? 1 : 0);
