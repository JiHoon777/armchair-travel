#!/usr/bin/env node
// Click through the prototype like a viewer (trusted input events over the DevTools protocol):
// 들어가기 · 전체 화면 -> sound decodes -> Space pauses (cards open, focus stays) -> Space resumes ->
// 90초 듣기 -> keys -> drag to look (the return takes longer for bigger offsets, look.js returnTime).
//   node tools/check_interact.mjs [--base http://localhost:8077]
import { launch } from './lib/cdp.mjs';
const i = process.argv.indexOf('--base');
const BASE = i >= 0 ? process.argv[i + 1] : 'http://localhost:8077';
const client = await launch();
const errors = [];
let fails = 0;
const ok = (cond, what, detail = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}${detail ? '  ' + detail : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function click(sel) {
  const r = await client.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
  if (!r) throw new Error('no element ' + sel);
  for (const type of ['mousePressed', 'mouseReleased']) await client.send('Input.dispatchMouseEvent', { type, x: r.x, y: r.y, button: 'left', clickCount: 1 });
}
async function key(k, code, keyCode) {
  for (const type of ['keyDown', 'keyUp']) await client.send('Input.dispatchKeyEvent', { type, key: k, code, windowsVirtualKeyCode: keyCode });
}
try {
  client.on('Runtime.exceptionThrown', (p) => errors.push(p.exceptionDetails.exception ? p.exceptionDetails.exception.description : p.exceptionDetails.text));
  client.on('Runtime.consoleAPICalled', (p) => { if (p.type === 'error') errors.push(p.args.map((a) => a.value ?? a.description).join(' ')); });
  await client.send('Page.enable'); await client.send('Runtime.enable');
  await client.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await client.send('Page.navigate', { url: BASE + '/?time=2026-10-13T17:30:00Z' });
  for (let k = 0; k < 60; k++) { await sleep(250); if (await client.eval('!!(window.__armchair && window.__armchair.frames > 2)')) break; }
  await click('#btn-enter');
  await sleep(4000);
  const st = await client.eval('JSON.stringify({ s: __armchair.state, sc: __armchair.scene, a: __armchair.audio() })');
  const s1 = JSON.parse(st);
  ok(s1.s === 'tour' && s1.sc === 'descend', '들어가기 starts the descend', `${s1.s}/${s1.sc}`);
  ok(s1.a.enabled && s1.a.state === 'running', 'sound is on after the click', JSON.stringify(s1.a));
  ok(s1.a.seconds > 5 && !s1.a.fallback, 'ambient recording decoded (not the wind fallback)', `${s1.a.seconds} s, level ${s1.a.level}`);
  await key(' ', 'Space', 32);
  await sleep(400);
  const paused = await client.eval('__armchair.paused()');
  const cardsOpen = await client.eval('!document.getElementById("cards").hidden');
  ok(paused && cardsOpen, 'Space pauses and the story cards open');
  const inSheet = await client.eval(`!!(document.activeElement && document.activeElement.closest('#cards'))`);
  ok(!inSheet, 'the focus stays outside the sheet (the next Space is for the tour)');
  await key(' ', 'Space', 32);
  await sleep(300);
  ok(!(await client.eval('__armchair.paused()')) && (await client.eval('!document.getElementById("cards").hidden')), 'a second Space resumes (the sheet stays open)');
  await key(' ', 'Space', 32);
  await sleep(300);
  ok(await client.eval('__armchair.paused()'), 'a third Space pauses again');
  await click('#card-next');
  const kicker = await client.eval('document.getElementById("card-kicker").textContent');
  ok(/2\/3/.test(kicker), 'next card', kicker);
  await click('#btn-listen');
  await sleep(4500);
  const n1 = JSON.parse(await client.eval('JSON.stringify(__armchair.narration())'));
  ok(n1.playing && n1.caption.length > 5, '90초 듣기 shows the narration as captions', `${n1.voice || 'no Korean voice -> text'}: ${n1.caption.slice(0, 40)}...`);
  await click('#btn-listen');
  await click('#btn-deep');
  await sleep(300);
  ok(await client.eval('!document.getElementById("deep").hidden'), '깊이 읽기 opens');
  await key('Escape', 'Escape', 27);
  await sleep(200);
  ok(await client.eval('document.getElementById("deep").hidden'), 'Esc closes 깊이 읽기');
  await key('Escape', 'Escape', 27);
  await sleep(200);
  ok(await client.eval('document.getElementById("cards").hidden'), 'Esc closes the cards');
  await key(' ', 'Space', 32);
  await sleep(300);
  ok(!(await client.eval('__armchair.paused()')), 'Space resumes');
  await key('ArrowRight', 'ArrowRight', 39);
  await sleep(2500);
  ok((await client.eval('__armchair.scene')) === 'wide', '→ jumps to the next scene', await client.eval('__armchair.scene'));
  await key('m', 'KeyM', 77);
  await sleep(300);
  ok(!(await client.eval('__armchair.audio().enabled')), 'M mutes');
  // drag to look around, then release: offsets return after 4 s + 2 s
  const h0 = await client.eval('__armchair.camera.heading');
  await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 640, y: 360, button: 'left', clickCount: 1 });
  for (let k = 1; k <= 10; k++) await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 640 - k * 30, y: 360, button: 'left', buttons: 1 });
  await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 340, y: 360, button: 'left', clickCount: 1 });
  await sleep(300);
  const h1 = await client.eval('__armchair.camera.heading');
  const hint = await client.eval('!document.getElementById("look-hint").hidden');
  ok(Math.abs(((h1 - h0 + 540) % 360) - 180) > 10 && hint, 'drag turns the view and shows the hint', `heading ${h0} -> ${h1}`);
  const l1 = JSON.parse(await client.eval('JSON.stringify(__armchair.look())'));
  await sleep(3000);
  const l2 = JSON.parse(await client.eval('JSON.stringify(__armchair.look())'));
  // software rendering runs at ~4 fps and the return advances by the (capped) frame time: wait
  // until it is back, at most 7 s after the 4 s hold
  for (let k = 0; k < 35; k++) { await sleep(200); if ((await client.eval('__armchair.look().yaw')) === 0) break; }
  const l3 = JSON.parse(await client.eval('JSON.stringify(__armchair.look())'));
  ok(Math.abs(l1.yaw) > 5 && Math.abs(l2.yaw - l1.yaw) < 0.5 && l3.yaw === 0, 'offset holds for 4 s, then eases back to the path', `yaw ${l1.yaw} -> ${l2.yaw} (3 s) -> ${l3.yaw} (within 10 s; a ${Math.abs(l1.yaw).toFixed(0)} deg return takes ${Math.max(2, Math.abs(l1.yaw) * Math.PI / 18).toFixed(1)} s)`);
  ok(errors.length === 0, 'no errors on the page', errors.join(' | ').slice(0, 500));
} catch (e) {
  fails++;
  console.log('FAIL', e.message);
} finally {
  await client.close();
}
process.exit(fails ? 1 : 0);
