#!/usr/bin/env node
// Load timing of the prototype (INTEGRATE): time to the first globe frame, the real globe
// texture, terrain ready (DEM decoded, meshes built) and all terrain imagery uploaded.
// Reads the page's own performance marks (armchair:first-frame, globe-data, terrain-ready,
// terrain-textures) plus navigation/resource timing. Headless Chrome + SwiftShader.
// Needs the local server (tools/serve.sh).
//
//   node tools/measure_timing.mjs                  local server, cold and warm cache, desktop + phone
//   node tools/measure_timing.mjs --throttle 20    also emulate a 20 Mbit/s, 40 ms RTT link
//   --runs 3   repeat each case and report the median
import { launch } from './lib/cdp.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const BASE = opt('--base', 'http://localhost:8077');
const RUNS = Number(opt('--runs', 3));
const THROTTLE = opt('--throttle', null);
const DAY = 'time=2026-10-13T17:30:00Z';
const MARKS = ['first-frame', 'globe-data', 'terrain-ready', 'terrain-textures'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const client = await launch({ width: 1280, height: 720 });
await client.send('Page.enable');
await client.send('Runtime.enable');
await client.send('Network.enable');
const errors = [];
client.on('Runtime.exceptionThrown', (p) => errors.push(p.exceptionDetails.text));

async function measure({ mobile, cold, mbit }) {
  await client.send('Network.setCacheDisabled', { cacheDisabled: !!cold });
  await client.send('Network.emulateNetworkConditions', mbit
    ? { offline: false, latency: 40, downloadThroughput: (mbit * 1e6) / 8, uploadThroughput: (5 * 1e6) / 8 }
    : { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await client.send('Emulation.setDeviceMetricsOverride', mobile ? { width: 390, height: 844, deviceScaleFactor: 1, mobile: true } : { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await client.send('Page.navigate', { url: 'about:blank' });
  await sleep(200);
  await client.send('Page.navigate', { url: `${BASE}/?${mobile ? 'lowres=1&' : ''}${DAY}` });
  const t0 = Date.now();
  let r = null;
  while (Date.now() - t0 < 180000) {
    await sleep(150);
    try {
      r = JSON.parse(await client.eval(`JSON.stringify((() => {
        const m = {};
        for (const k of ${JSON.stringify(MARKS)}) { const e = performance.getEntriesByName('armchair:' + k)[0]; if (e) m[k] = Math.round(e.startTime); }
        const nav = performance.getEntriesByType('navigation')[0] || {};
        const res = performance.getEntriesByType('resource');
        const three = res.find((e) => /three\\.module\\.js/.test(e.name));
        const dem = res.find((e) => /core_dem\\.png/.test(e.name));
        const bytes = res.reduce((s, e) => s + (e.transferSize || 0), 0);
        return { m, ttfb: Math.round(nav.responseStart || 0), dcl: Math.round(nav.domContentLoadedEventEnd || 0), three: three ? Math.round(three.responseEnd) : null, dem: dem ? Math.round(dem.responseEnd) : null, bytes, n: res.length };
      })())`));
    } catch { r = null; }
    if (r && MARKS.every((k) => r.m[k] !== undefined)) break;
  }
  return r;
}

const median = (a) => { const s = a.filter((x) => x != null).sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
const cases = [];
for (const mobile of [false, true]) for (const cold of [true, false]) cases.push({ mobile, cold, mbit: null });
if (THROTTLE) for (const mobile of [false, true]) cases.push({ mobile, cold: true, mbit: Number(THROTTLE) });

const rows = [];
try {
  for (const c of cases) {
    const runs = [];
    for (let i = 0; i < RUNS; i++) runs.push(await measure(c));
    const pick = (f) => median(runs.map((r) => (r ? f(r) : null)));
    rows.push({
      case: `${c.mobile ? 'phone 390x844 lowres' : 'desktop 1280x720'}, ${c.cold ? 'cold cache' : 'warm cache'}${c.mbit ? `, ${c.mbit} Mbit/s 40 ms` : ', local'}`,
      ttfb: pick((r) => r.ttfb), three: pick((r) => r.three), dcl: pick((r) => r.dcl),
      first: pick((r) => r.m['first-frame']), globe: pick((r) => r.m['globe-data']),
      dem: pick((r) => r.dem), terrain: pick((r) => r.m['terrain-ready']), tex: pick((r) => r.m['terrain-textures']),
      mb: pick((r) => r.bytes / 1048576), n: pick((r) => r.n), runs: runs.length,
    });
    const x = rows[rows.length - 1];
    console.log(`${x.case.padEnd(46)} three.js ${x.three} ms · first globe frame ${x.first} ms · globe photo ${x.globe} ms · DEM file ${x.dem} ms · terrain ready ${x.terrain} ms · imagery ${x.tex} ms · ${x.mb != null ? x.mb.toFixed(1) : '?'} MB / ${x.n} files (median of ${x.runs})`);
  }
} finally {
  await client.close();
}
if (errors.length) console.log('page exceptions:', errors.slice(0, 5).join(' | '));
console.log(JSON.stringify(rows));
