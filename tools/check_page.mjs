#!/usr/bin/env node
// Load the site in headless Chrome and report errors (APP agent).
// Default: drives Chrome over the DevTools protocol, waits until the page says it is ready
// (window.__armchair.readyForShot), then reports uncaught exceptions, console errors, failed
// loads and the page's own error log (#errlog).
// --dump-dom: the plain way instead (chrome --headless --dump-dom), reading <pre id="errlog">
// and the <html data-*> state mirror; note that its virtual clock can outrun real loading.
//
//   node tools/check_page.mjs                       default URL set against http://localhost:8077
//   node tools/check_page.mjs "/?scene=wide&t=30&still=1" "/?lowres=1"
//   node tools/check_page.mjs --dump-dom --budget 20000 "/"
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch, openPage, CHROME } from './lib/cdp.mjs';

const args = process.argv.slice(2);
const flag = (k) => { const i = args.indexOf(k); if (i >= 0) { args.splice(i, 1); return true; } return false; };
const opt = (k, d) => { const i = args.indexOf(k); if (i >= 0) { const v = args[i + 1]; args.splice(i, 2); return v; } return d; };
const BASE = opt('--base', 'http://localhost:8077');
const BUDGET = Number(opt('--budget', '20000'));
const DUMP = flag('--dump-dom');
const urls = args.length ? args : [
  '/',
  '/?time=2026-10-13T09:11:00Z',
  '/?scene=descend&t=12&still=1&time=2026-10-13T17:00:00Z',
  '/?scene=descend&t=26&still=1&time=2026-10-13T17:00:00Z',
  '/?scene=wide&t=60&still=1&time=2026-10-13T17:30:00Z',
  '/?scene=approach&t=150&still=1&time=2026-10-13T18:00:00Z',
  '/?scene=stand&t=30&still=1',
  '/?scene=daylapse&t=100&still=1',
  '/?scene=ascend&t=7&still=1',
  '/?lowres=1',
  '/?autoplay=1&time=2026-10-13T09:11:00Z',
];

let bad = 0;
if (DUMP) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'armchair-chrome-'));
  for (const u of urls) {
    const url = u.startsWith('http') ? u : BASE + u;
    const r = spawnSync(CHROME, [
      '--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars',
      '--no-first-run', `--user-data-dir=${profile}`, '--window-size=1280,720',
      `--virtual-time-budget=${BUDGET}`, '--enable-logging=stderr', '--v=0', '--dump-dom', url,
    ], { encoding: 'utf8', timeout: 180000, maxBuffer: 64 << 20 });
    const dom = r.stdout || '';
    const html = (dom.match(/<html[^>]*>/) || [''])[0];
    const attr = (k) => { const m = html.match(new RegExp(`data-${k}="([^"]*)"`)); return m ? m[1] : ''; };
    const em = dom.match(/<pre id="errlog"[^>]*data-count="(\d+)"[^>]*>([\s\S]*?)<\/pre>/);
    const n = em ? Number(em[1]) : -1;
    const cons = (r.stderr || '').split('\n').filter((l) => /Uncaught|CONSOLE.*error/i.test(l));
    const ok = n === 0 && !cons.length && !!attr('state');
    if (!ok) bad++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${url}\n     state=${attr('state')} scene=${attr('scene')} terrain=${attr('terrain')} globe=${attr('globe')}`);
    if (n !== 0) console.log('     errlog: ' + (em ? em[2].slice(0, 800) : 'missing'));
    cons.slice(0, 5).forEach((l) => console.log('     console: ' + l.slice(0, 300)));
  }
  fs.rmSync(profile, { recursive: true, force: true });
} else {
  const client = await launch();
  try {
    for (const u of urls) {
      const url = u.startsWith('http') ? u : BASE + u;
      const mobile = /lowres=1/.test(url);
      const r = await openPage(client, url, { width: mobile ? 390 : 1280, height: mobile ? 844 : 720, mobile, timeoutMs: 90000 });
      const errlog = await client.eval(`(document.getElementById('errlog')||{}).textContent || ''`).catch(() => '');
      const st = r.state || {};
      const errs = [...r.errors, ...(errlog ? ['errlog: ' + errlog] : [])];
      const ok = !!st.ready && !errs.length;
      if (!ok) bad++;
      console.log(`${ok ? 'ok  ' : 'FAIL'} ${url}  (${(r.ms / 1000).toFixed(1)} s)`);
      console.log(`     ready=${st.ready} state=${st.state} scene=${st.scene || '-'} frames=${st.frames} terrain=${st.terrain} pano=${st.pano} globe=${st.globe}`);
      for (const e of errs.slice(0, 8)) console.log('     ' + e.slice(0, 500));
      if (r.warnings.length) console.log('     warnings: ' + r.warnings.slice(0, 4).join(' | ').slice(0, 400));
    }
  } finally {
    await client.close();
  }
}
console.log(bad ? `\n${bad} page(s) with problems` : '\nno errors');
process.exit(bad ? 1 : 0);
