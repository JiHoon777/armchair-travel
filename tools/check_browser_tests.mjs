#!/usr/bin/env node
// Run site/test/index.html in headless Chrome and print its results (APP agent).
//   node tools/check_browser_tests.mjs [--base http://localhost:8077]
import { launch } from './lib/cdp.mjs';
const i = process.argv.indexOf('--base');
const BASE = i >= 0 ? process.argv[i + 1] : 'http://localhost:8077';
const client = await launch();
let code = 1;
try {
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Page.navigate', { url: BASE + '/test/index.html' });
  const t0 = Date.now();
  let result = '';
  while (Date.now() - t0 < 60000) {
    await new Promise((r) => setTimeout(r, 300));
    result = await client.eval('document.documentElement.dataset.result || ""').catch(() => '');
    if (result) break;
  }
  const lines = await client.eval(`[...document.querySelectorAll('#out li')].map((li) => li.textContent.trim()).join('\\n')`);
  console.log(lines);
  console.log('result:', result || 'timeout');
  code = result === 'pass' ? 0 : 1;
} finally {
  await client.close();
}
process.exit(code);
