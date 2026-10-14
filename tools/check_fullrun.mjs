#!/usr/bin/env node
// Full run through every scene with the console watched (INTEGRATE).
// Opens /?autoplay=1&speed=N (scene time runs N times faster), follows the tour from the home
// globe through descend, wide, approach, stand, daylapse, ascend and back home, and waits for the
// second loop to start. Fails on any uncaught exception, unhandled promise rejection, console
// error, failed request (HTTP >= 400 or network error) or a scene that never showed up.
// Needs the local server (tools/serve.sh).
//
//   node tools/check_fullrun.mjs                    desktop day, desktop night, phone (lowres)
//   node tools/check_fullrun.mjs --speed 20 --only desktop-day
//   node tools/check_fullrun.mjs --speed 1 --max 900 --only desktop-day   (real time, ~13 min)
import { launch } from './lib/cdp.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const BASE = opt('--base', 'http://localhost:8077');
const SPEED = Number(opt('--speed', 20));
const ONLY = opt('--only', null);
const MAX_S = Number(opt('--max', 240));   // wall-clock limit per run (s); a 1x run needs ~800
const RUNS = [
  { name: 'desktop-day', w: 1280, h: 720, mobile: false, q: 'time=2026-10-13T17:30:00Z' },
  { name: 'desktop-night', w: 1280, h: 720, mobile: false, q: 'time=2026-10-14T05:00:00Z' },
  { name: 'phone-day', w: 390, h: 844, mobile: true, q: 'lowres=1&time=2026-10-13T20:00:00Z' },
];
const WANT = ['descend', 'wide', 'approach', 'stand', 'daylapse', 'ascend'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failed = 0;
for (const run of RUNS) {
  if (ONLY && !ONLY.split(',').includes(run.name)) continue;
  const client = await launch({ width: run.w, height: run.h });
  const problems = [];
  const warnings = [];
  const requests = new Map();
  let nReq = 0;
  client.on('Runtime.exceptionThrown', (p) => problems.push('exception: ' + ((p.exceptionDetails.exception && p.exceptionDetails.exception.description) || p.exceptionDetails.text)));
  client.on('Runtime.consoleAPICalled', (p) => {
    const text = p.args.map((a) => a.value ?? a.description ?? '').join(' ');
    if (p.type === 'error' || p.type === 'assert') problems.push(`console.${p.type}: ${text}`);
    else if (p.type === 'warning') warnings.push(text);
  });
  client.on('Log.entryAdded', (p) => { if (p.entry.level === 'error' && !/favicon/.test(p.entry.url || '')) problems.push('log: ' + p.entry.text + (p.entry.url ? ' ' + p.entry.url : '')); });
  client.on('Network.requestWillBeSent', (p) => { requests.set(p.requestId, p.request.url); nReq++; });
  client.on('Network.responseReceived', (p) => { if (p.response.status >= 400 && !/favicon/.test(p.response.url)) problems.push(`HTTP ${p.response.status} ${p.response.url}`); });
  client.on('Network.loadingFailed', (p) => { const u = requests.get(p.requestId) || '?'; if (!p.canceled && !/favicon/.test(u)) problems.push(`request failed (${p.errorText}) ${u}`); });
  await client.send('Page.enable'); await client.send('Runtime.enable'); await client.send('Log.enable'); await client.send('Network.enable');
  await client.send('Emulation.setDeviceMetricsOverride', { width: run.w, height: run.h, deviceScaleFactor: 1, mobile: run.mobile });
  if (run.mobile) await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  const url = `${BASE}/?autoplay=1&speed=${SPEED}&${run.q}`;
  await client.send('Page.navigate', { url });
  const t0 = Date.now();
  const seen = [];        // scene sequence
  const states = [];
  let last = '';
  let loops = 0;
  let toast = '';
  let minFps = Infinity, fpsSum = 0, fpsN = 0;
  while (Date.now() - t0 < MAX_S * 1000) {
    await sleep(200);
    let st;
    try { st = JSON.parse(await client.eval('JSON.stringify({ s: __armchair.state, sc: __armchair.scene, t: __armchair.t, fps: __armchair.fps, toast: !document.getElementById("toast").hidden ? document.getElementById("toast-text").textContent : "", errlog: (document.getElementById("errlog") || {}).textContent || "", cap: document.getElementById("caption-text").textContent })')); } catch { continue; }
    if (st.toast && !toast) toast = st.toast;
    if (st.s === 'tour' && st.fps) { minFps = Math.min(minFps, st.fps); fpsSum += st.fps; fpsN++; }
    const key = st.s === 'tour' ? st.sc : st.s;
    if (key && key !== last) {
      states.push(`${key}@${((Date.now() - t0) / 1000).toFixed(1)}s`);
      if (st.s === 'tour') seen.push(st.sc);
      if (last === 'ascend' || (last && st.s !== 'tour' && seen.length)) { /* back home */ }
      if (st.s === 'tour' && st.sc === 'descend' && seen.filter((x) => x === 'descend').length === 2) { loops = 1; last = key; break; }
      last = key;
    }
    if (st.errlog) { problems.push('errlog: ' + st.errlog.slice(0, 300)); break; }
  }
  await sleep(1500);
  const missing = WANT.filter((s) => !seen.includes(s));
  const order = seen.slice(0, 6).join('>');
  const ok = !problems.length && !missing.length && loops === 1;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${run.name}  ${((Date.now() - t0) / 1000).toFixed(0)} s wall, speed ${SPEED}x, ${nReq} requests`);
  console.log(`     sequence: ${states.join(' → ')}`);
  console.log(`     first loop order: ${order}${missing.length ? '  MISSING ' + missing.join(',') : ''}${loops ? '  (second loop started)' : '  (no second loop)'}`);
  if (toast) console.log(`     toast: ${toast}`);
  console.log(`     fps while touring (SwiftShader): min ${Number.isFinite(minFps) ? minFps : '-'}, mean ${fpsN ? (fpsSum / fpsN).toFixed(0) : '-'}`);
  if (warnings.length) console.log(`     console warnings (${warnings.length}): ${[...new Set(warnings)].slice(0, 4).join(' | ').slice(0, 400)}`);
  for (const p of problems.slice(0, 10)) console.log('     ' + p.slice(0, 400));
  await client.close();
}
console.log(failed ? `\n${failed} run(s) with problems` : '\nall runs clean: no exceptions, no rejections, no console errors, no failed requests');
process.exit(failed ? 1 : 0);
