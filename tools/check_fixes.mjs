#!/usr/bin/env node
// Regression checks for the code and screen review findings fixed on 2026-10-13 (FIX).
// Each check drives headless Chrome (SwiftShader) with trusted input over the DevTools protocol.
// Needs the local server (tools/serve.sh).
//
//   node tools/check_fixes.mjs                 all checks
//   node tools/check_fixes.mjs look audio      only checks whose name contains these words
import { launch, openPage } from './lib/cdp.mjs';

const args = process.argv.slice(2);
const bi = args.indexOf('--base');
const BASE = bi >= 0 ? args.splice(bi, 2)[1] : 'http://localhost:8077';
const only = args;
const DAY = 'time=2026-10-13T17:30:00Z';    // 10:30 MST
const NIGHT = 'time=2026-10-14T05:00:00Z';  // 22:00 MST
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0, passes = 0;
const ok = (cond, what, detail = '') => { if (cond) passes++; else fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}${detail ? '  ' + detail : ''}`); };
const J = async (c, expr) => JSON.parse(await c.eval(`JSON.stringify(${expr})`));

async function waitFor(c, expr, ms = 30000, step = 200) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { if (await c.eval(`!!(${expr})`)) return true; } catch { /* page not ready */ }
    await sleep(step);
  }
  return false;
}
async function center(c, sel) {
  return c.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width, h: b.height }; })()`);
}
async function click(c, sel) {
  const r = await center(c, sel);
  if (!r) throw new Error('no element ' + sel);
  // a moving pointer first: after 3 s without input the controls hide (and ignore clicks) until poked
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
  await sleep(120);
  for (const type of ['mousePressed', 'mouseReleased']) await c.send('Input.dispatchMouseEvent', { type, x: r.x, y: r.y, button: 'left', clickCount: 1 });
}
async function key(c, k, code, keyCode, modifiers = 0) {
  for (const type of ['keyDown', 'keyUp']) await c.send('Input.dispatchKeyEvent', { type, key: k, code, windowsVirtualKeyCode: keyCode, modifiers });
}
async function drag(c, x0, y0, dx, steps = 12, release = true) {
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x0, y: y0, button: 'left', clickCount: 1 });
  for (let k = 1; k <= steps; k++) { await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0 + (dx * k) / steps, y: y0, button: 'left', buttons: 1 }); await sleep(16); }
  if (release) await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x0 + dx, y: y0, button: 'left', clickCount: 1 });
}
async function withPage(fn, { w = 1280, h = 720, mobile = false } = {}) {
  const c = await launch({ width: w, height: h });
  c.size = { width: w, height: h, mobile };
  try { await fn(c); } catch (e) { fails++; console.log('FAIL', e.message); } finally { await c.close(); }
}
const open = (c, q, extra = {}) => openPage(c, `${BASE}/?${q}`, { ...c.size, ...extra });
// frames: the page's own frame counter, so waits scale with the (slow) software renderer
const frames = (c) => c.eval('__armchair.frames');

const CHECKS = {
  // 1. look-return-speed: the return stays under the comfort limits; a big offset dips to dark
  async 'look return speed'() {
    await withPage(async (c) => {
      await open(c, `scene=wide&t=20&${DAY}`);
      // the app's own trace, one entry per frame: the offset moves in frame steps, so the rate is
      // each step over that frame's real duration
      const samples = async (ms) => {
        await c.eval('__armchair.traceLook(true)');
        const t0 = Date.now();
        let snap = false, returnT = 0;
        while (Date.now() - t0 < ms) {
          const l = await J(c, '__armchair.look()');
          snap = snap || l.snap; returnT = Math.max(returnT, l.returnT);
          await sleep(100);
        }
        const tr = await J(c, '__armchair.lookTrace()');
        await c.eval('__armchair.traceLook(false)');
        return tr.map(([t, yaw, pitch, fov, fade], i) => ({ t, yaw, pitch, fov, fade, snap: i === tr.length - 1 ? snap : snap, returnT }));
      };
      const rate = (s) => {
        let m = 0;
        for (let i = 1; i < s.length; i++) {
          if (s[i].fade > 0.85 || s[i - 1].fade > 0.85) continue; // the snap happens at full dark
          const dt = Math.max(1 / 120, (s[i].t - s[i - 1].t) / 1000);
          m = Math.max(m, Math.abs(s[i].yaw - s[i - 1].yaw) / dt, Math.abs(s[i].pitch - s[i - 1].pitch) / dt, Math.abs(s[i].fov - s[i - 1].fov) / dt);
        }
        return m;
      };
      await drag(c, 640, 360, -260);
      const a = await samples(9500);
      const y0 = a[0].yaw;
      ok(Math.abs(y0) > 15 && Math.abs(a[a.length - 1].yaw) < 0.05 && rate(a) < 9.6, '18 deg drag eases back under 9 deg/s', `yaw ${y0.toFixed(1)} -> ${a[a.length - 1].yaw.toFixed(1)}, return ${Math.max(...a.map((s) => s.returnT))} s, peak ${rate(a).toFixed(1)} deg/s (limit 10)`);
      await drag(c, 1100, 360, -900);
      const b = await samples(6500);
      const snapped = b.some((s) => s.snap) && b.some((s) => s.fade > 0.5);
      ok(Math.abs(b[0].yaw) > 50 && snapped && Math.abs(b[b.length - 1].yaw) < 0.05 && rate(b) < 9.6, '62 deg drag comes back through a short dark dip, no fast swing', `yaw ${b[0].yaw.toFixed(1)} -> ${b[b.length - 1].yaw.toFixed(1)}, max fade ${Math.max(...b.map((s) => s.fade))}, peak outside the dip ${rate(b).toFixed(1)} deg/s`);
    });
  },

  // 2. audio-double-decode + sound on every start click (R03)
  async 'audio decode once, sound on start'() {
    await withPage(async (c) => {
      await open(c, DAY);
      await click(c, '#btn-play');
      await waitFor(c, '__armchair.audio().seconds > 0', 15000);
      await sleep(600);
      const a = await J(c, '__armchair.audio()');
      const toast = await c.eval(`document.getElementById('toast-text').textContent`);
      ok(a.decodes === 1 && a.sameBuffer && a.enabled && a.state === 'running', '그냥 틀어 두기: sound on, one decode, the playing source holds that buffer', JSON.stringify(a));
      ok(/소리가 작게/.test(toast), 'a toast says the sound is on and how to turn it off', toast);
      ok(a.mb < 80, 'desktop buffer size', `${a.mb} MB, ${a.channels} ch, ${a.rate} Hz`);
    });
    await withPage(async (c) => {
      await c.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
      await open(c, `lowres=1&${DAY}`);
      await click(c, '#btn-play');
      await waitFor(c, '__armchair.audio().seconds > 0', 15000);
      const a = await J(c, '__armchair.audio()');
      ok(a.decodes === 1 && a.channels === 1 && a.rate === 22050 && a.mb < 20, 'phone: one decode to 22.05 kHz mono', `${a.mb} MB, ${a.channels} ch, ${a.rate} Hz, decodes ${a.decodes}`);
    }, { w: 390, h: 844, mobile: true });
  },

  // 3. cards-cover-controls (+ R14 caption/dots step aside)
  async 'controls stay reachable with the story open'() {
    await withPage(async (c) => {
      await open(c, `scene=wide&t=60&still=1&paused=1&${DAY}`);
      await sleep(400);
      const hits = await c.eval(`['btn-pause','btn-sound','btn-story','btn-next','sheet-play'].map((id) => { const b = document.getElementById(id).getBoundingClientRect(); const e = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return id + ':' + !!(e && e.closest('#' + id)); }).join(' ')`);
      ok(!/false/.test(hits), 'desktop: pause, sound, story, next and the sheet play button are all on top', hits);
      const vis = await c.eval(`[getComputedStyle(document.getElementById('caption')).visibility, getComputedStyle(document.getElementById('dots')).visibility].join(',')`);
      ok(vis === 'hidden,hidden', 'desktop: the caption and the scene dots step aside while the sheet is open', vis);
      await click(c, '#sheet-play');
      await sleep(300);
      ok(!(await c.eval('__armchair.paused()')), 'the sheet play button resumes');
    });
    await withPage(async (c) => {
      await c.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
      await open(c, `lowres=1&scene=wide&t=60&still=1&paused=1&${DAY}`);
      await sleep(400);
      const hits = await c.eval(`['sheet-play','cards-close'].map((id) => { const b = document.getElementById(id).getBoundingClientRect(); const e = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return id + ':' + !!(e && e.closest('#' + id)); }).join(' ')`);
      ok(!/false/.test(hits), 'phone: the bottom sheet has its own play and close buttons', hits);
    }, { w: 390, h: 844, mobile: true });
  },

  // 4. late-terrain-paths: a DEM that arrives after the descend still reaches the paths (at the next cut)
  async 'late terrain reaches the paths'() {
    await withPage(async (c) => {
      const held = [];
      c.on('Fetch.requestPaused', (p) => held.push(p.requestId));
      await c.send('Fetch.enable', { patterns: [{ urlPattern: '*core_dem.png*', requestStage: 'Request' }] });
      await c.send('Page.enable'); await c.send('Runtime.enable');
      await c.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
      await c.send('Page.navigate', { url: `${BASE}/?autoplay=1&speed=4&${DAY}` });
      ok(await waitFor(c, `window.__armchair && __armchair.state === 'tour' && __armchair.scene === 'descend'`, 60000), 'tour started with the DEM held back');
      await key(c, 'ArrowRight', 'ArrowRight', 39);
      ok(await waitFor(c, `__armchair.scene === 'wide'`, 20000), '→ jumped to the wide orbit before the DEM arrived');
      for (const id of held) await c.send('Fetch.continueRequest', { requestId: id });
      ok(await waitFor(c, `__armchair.ready.terrain`, 30000), 'DEM arrived during the wide orbit');
      await sleep(500);
      const p1 = await J(c, '__armchair.paths()');
      ok(!p1.hasTerrain && p1.pending, 'paths are not swapped under the running orbit (waiting for a cut)', JSON.stringify({ hasTerrain: p1.hasTerrain, pending: p1.pending }));
      await key(c, 'ArrowRight', 'ArrowRight', 39);
      ok(await waitFor(c, `__armchair.scene === 'approach'`, 20000), '→ to the approach (a cut through dark)');
      await sleep(400);
      const p2 = await J(c, '__armchair.paths()');
      ok(p2.hasTerrain && !p2.pending && Math.abs(p2.approachEnd.y - 1786) < 60, 'at the cut the paths use the real terrain', `hasTerrain ${p2.hasTerrain}, approach ends at ${Math.round(p2.approachEnd.y)} m (river + 1,050 m = 1,786 m)`);
    });
  },

  // 5. scene-boundary-snap: a drag held across a continuous boundary does not jump
  async 'drag across a scene boundary'() {
    await withPage(async (c) => {
      await open(c, `scene=wide&t=173&${DAY}`);
      await drag(c, 640, 360, -300, 12, false); // hold
      const hs = [];
      const t0 = Date.now();
      while (Date.now() - t0 < 16000) {
        const s = await J(c, `({ sc: __armchair.scene, h: __armchair.camera.heading, look: __armchair.look(), fade: Number(document.getElementById('fade').style.opacity || 0) })`);
        hs.push(s);
        if (s.sc === 'approach' && hs.filter((x) => x.sc === 'approach').length > 6) break;
        await sleep(60);
      }
      let jump = 0;
      for (let i = 1; i < hs.length; i++) jump = Math.max(jump, Math.abs(((hs[i].h - hs[i - 1].h + 540) % 360) - 180));
      const after = hs[hs.length - 1];
      ok(hs.some((x) => x.sc === 'wide') && after.sc === 'approach', 'crossed wide -> approach while holding', hs.map((x) => x.sc[0]).join(''));
      ok(jump < 6, 'no heading jump at the boundary', `largest step between samples ${jump.toFixed(1)} deg`);
      ok(after.look.pointers === 1 && Math.abs(after.look.yaw) > 10, 'the finger is still tracked and the offset kept', JSON.stringify(after.look));
      for (let k = 1; k <= 8; k++) await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 340 - k * 20, y: 360, button: 'left', buttons: 1 });
      await sleep(300);
      const l2 = await J(c, '__armchair.look()');
      ok(l2.yaw > after.look.yaw + 5, 'dragging further keeps turning', `yaw ${after.look.yaw} -> ${l2.yaw}`);
      await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 180, y: 360, button: 'left', clickCount: 1 });
    });
  },

  // 6. narration-pause (+ R15: no flash-by when the voice ends at once) and 8. caption-override
  async 'narration pause and captions'() {
    await withPage(async (c) => {
      await open(c, `scene=wide&t=172&${DAY}`);
      await click(c, '#btn-story');
      await sleep(300);
      await click(c, '#btn-listen');
      await sleep(3000);
      const n1 = await J(c, '__armchair.narration()');
      const sub1 = await c.eval(`document.getElementById('caption-sub').textContent`);
      ok(n1.playing && n1.caption.length > 5, '90초 듣기 runs', `${n1.withVoice ? 'voice ' + n1.voice : 'text captions'}: ${sub1}`);
      const idx = (s) => Number((s.match(/(\d+)\/\d+/) || [0, 0])[1]);
      ok(idx(sub1) <= 2, 'sentences do not flash by (at most 2 after 3 s)', sub1);
      // scene change during the narration: the narration keeps the caption
      await key(c, 'Escape', 'Escape', 27);
      ok(await waitFor(c, `__armchair.scene === 'approach'`, 20000), 'scene changed to the approach during the narration');
      await sleep(600);
      const capA = await c.eval(`document.getElementById('caption-text').textContent`);
      const subA = await c.eval(`document.getElementById('caption-sub').textContent`);
      ok(/\d+\/\d+/.test(subA) && !/비슈누 편암은 약 17억/.test(capA), 'the narration sentence stays; the scene caption waits', `${capA.slice(0, 30)}… / ${subA}`);
      // pause (Space on the page, not on a focused button): the captions stop too
      await c.eval('document.activeElement && document.activeElement.blur && document.activeElement.blur(), true');
      await key(c, ' ', 'Space', 32);
      await sleep(300);
      const s0 = await c.eval(`document.getElementById('caption-sub').textContent`);
      await sleep(8000);
      const s1 = await c.eval(`document.getElementById('caption-sub').textContent`);
      ok((await c.eval('__armchair.paused()')) && s0 === s1, 'paused: the narration captions hold', `${s0} -> ${s1} after 8 s`);
      // tab hidden and back while paused: the narration stays paused
      await c.eval(`(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); delete document.visibilityState; return true; })()`);
      const n2 = await J(c, '__armchair.narration()');
      ok(n2.paused && (await c.eval('__armchair.paused()')), 'back from a hidden tab while paused: still paused', JSON.stringify({ narrPaused: n2.paused }));
      await c.eval('document.activeElement && document.activeElement.blur && document.activeElement.blur(), true');
      await key(c, ' ', 'Space', 32);
      await sleep(9000);
      const s2 = await c.eval(`document.getElementById('caption-sub').textContent`);
      ok(s2 !== s1, 'resumed: the captions move on', `${s1} -> ${s2}`);
      // stop: the scene caption comes back
      if (await c.eval(`document.getElementById('cards').hidden`)) await click(c, '#btn-story');
      await sleep(300);
      await click(c, '#btn-listen');
      await key(c, 'Escape', 'Escape', 27);
      await sleep(500);
      const capB = await c.eval(`document.getElementById('caption-text').textContent`);
      ok(/비슈누 편암/.test(capB), 'after the narration the current scene caption is back', capB.slice(0, 40));
    });
  },

  // 6b. narration-pause without any Korean voice: the timed text captions pause too
  async 'narration text mode pauses'() {
    await withPage(async (c) => {
      await c.send('Page.enable');
      await c.send('Page.addScriptToEvaluateOnNewDocument', { source: `try { Object.defineProperty(speechSynthesis, 'getVoices', { value: () => [] }); } catch (e) {}` });
      await open(c, `scene=wide&t=40&${DAY}`);
      await click(c, '#btn-story');
      await sleep(300);
      await click(c, '#btn-listen');
      await sleep(3500);
      const n = await J(c, '__armchair.narration()');
      const toast = await c.eval(`document.getElementById('toast').hidden ? '' : document.getElementById('toast-text').textContent`);
      ok(n.playing && !n.withVoice && /글로 보여/.test(toast), 'no Korean voice: text captions and a notice', `${toast}`);
      await c.eval('document.activeElement && document.activeElement.blur && document.activeElement.blur(), true');
      await key(c, ' ', 'Space', 32);
      await sleep(200);
      const s0 = await c.eval(`document.getElementById('caption-sub').textContent`);
      await sleep(9000);
      const s1 = await c.eval(`document.getElementById('caption-sub').textContent`);
      ok((await c.eval('__armchair.paused()')) && s0 === s1, 'paused: the text captions hold', `${s0} -> ${s1} after 9 s`);
      await c.eval('document.activeElement && document.activeElement.blur && document.activeElement.blur(), true');
      await key(c, ' ', 'Space', 32);
      await sleep(9000);
      const s2 = await c.eval(`document.getElementById('caption-sub').textContent`);
      ok(s2 !== s1, 'resumed: they move on', `${s1} -> ${s2}`);
    });
  },

  // 7. sound-cannot-resume: a suspended context wakes with one click on the sound button
  async 'sound wakes after a suspension'() {
    await withPage(async (c) => {
      await open(c, DAY);
      await click(c, '#btn-enter');
      ok(await waitFor(c, `__armchair.state === 'tour' && __armchair.audio().state === 'running'`, 30000), 'tour with sound');
      await c.eval('__armchair.suspendAudio()');
      await sleep(500);
      const lab = await c.eval(`document.getElementById('btn-sound').getAttribute('aria-pressed') + ' ' + document.getElementById('btn-sound').getAttribute('aria-label')`);
      ok(/^false .*다시 켜기/.test(lab), 'the sound button shows the suspension', lab);
      await click(c, '#btn-sound');
      await sleep(600);
      const a = await J(c, '__armchair.audio()');
      ok(a.state === 'running' && a.enabled, 'one click resumes the context', JSON.stringify({ state: a.state, enabled: a.enabled }));
    });
  },

  // 9. terrain-dispose: freed at home, rebuilt on the next start, globe patch on the new texture
  async 'terrain freed and rebuilt'() {
    await withPage(async (c) => {
      await open(c, `disposems=2500&${DAY}`);
      await click(c, '#btn-enter');
      ok(await waitFor(c, `__armchair.state === 'tour' && __armchair.terrainState().ready && __armchair.terrainState().textures >= __armchair.terrainState().wanted`, 60000), 'terrain ready in the tour');
      await click(c, '#btn-story');
      await sleep(200);
      await click(c, '#btn-home');
      ok(await waitFor(c, `__armchair.state === 'home'`, 20000), 'back home');
      await sleep(4500);
      const t1 = await J(c, '__armchair.terrainState()');
      ok(!t1.ready && !t1.hasCore && !t1.outerTexture && !t1.patch && t1.textures === 0, 'freed: no DEM, no textures, no globe patch', JSON.stringify(t1));
      await sleep(1500);
      const t1b = await J(c, '__armchair.terrainState()');
      ok(!t1b.patch, 'the globe patch is not rebuilt from the freed texture', JSON.stringify({ patch: t1b.patch }));
      await click(c, '#btn-enter');
      ok(await waitFor(c, `__armchair.terrainState().ready && __armchair.terrainState().textures >= __armchair.terrainState().wanted && __armchair.terrainState().patch`, 60000), 'rebuilt on the next start');
      const t2 = await J(c, '__armchair.terrainState()');
      ok(t2.patchTexOk, 'the globe patch uses the new outer texture', JSON.stringify(t2));
    });
  },

  // 10. procedural-reload-freeze: the fallback terrain does not freeze the second descend
  async 'procedural fallback restarts without a freeze'() {
    await withPage(async (c) => {
      c.on('Fetch.requestPaused', (p) => c.send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 404, responseHeaders: [{ name: 'Content-Type', value: 'text/plain' }], body: '' }).catch(() => {}));
      await c.send('Fetch.enable', { patterns: [{ urlPattern: '*terrain/meta.json*', requestStage: 'Request' }] });
      await open(c, `disposems=2500&speed=4&${DAY}`);
      await click(c, '#btn-enter');
      ok(await waitFor(c, `__armchair.scene === 'wide'`, 60000), 'first tour reaches the orbit on the procedural canyon');
      await click(c, '#btn-story'); await sleep(200); await click(c, '#btn-home');
      await waitFor(c, `__armchair.state === 'home'`, 20000);
      await sleep(4500);
      await click(c, '#btn-enter');
      ok(await waitFor(c, `__armchair.scene === 'descend'`, 30000), 'second tour starts');
      const t0 = Date.now();
      const reached = await waitFor(c, `__armchair.scene === 'wide'`, 40000);
      const s = (Date.now() - t0) / 1000;
      ok(reached && s < 20, 'the second descend does not wait 14 s for terrain', `descend took ${s.toFixed(1)} s wall (7.5 s scene time at 4x)`);
    });
  },

  // 12. modal-focus-escape: the page behind a dialog is inert
  async 'dialogs keep the focus'() {
    await withPage(async (c) => {
      await open(c, `scene=wide&t=60&still=1&open=deep&${DAY}`);
      await sleep(300);
      ok(await c.eval(`document.getElementById('hud').inert && document.getElementById('cards').inert && document.getElementById('notices').inert`), 'behind 깊이 읽기: HUD, cards and notices are inert');
      let outside = 0;
      for (let k = 0; k < 8; k++) {
        await key(c, 'Tab', 'Tab', 9, 8 /* shift */);
        if (!(await c.eval(`!!document.activeElement.closest('#deep')`))) outside++;
      }
      ok(outside === 0, 'Shift+Tab never leaves the dialog', `${outside} of 8 steps outside`);
      await key(c, 'Escape', 'Escape', 27);
      await sleep(200);
      ok(await c.eval(`!document.getElementById('hud').inert`), 'closing the dialog frees the page');
    });
  },

  // 13. sunlist-focus-loss: the minute changes under a focused row
  async 'home list keeps the focus'() {
    await withPage(async (c) => {
      await open(c, `time=2026-10-13T17:31:05Z`); // the display rounds to the minute: it flips at :30
      await waitFor(c, `document.querySelector('.ready-go')`, 10000);
      await c.eval(`document.querySelector('.ready-go').focus()`);
      const t0 = await c.eval(`document.querySelector('.ready-go .sun-time').textContent`);
      await waitFor(c, `document.querySelector('.ready-go .sun-time').textContent !== ${JSON.stringify(t0)}`, 40000, 300);
      const t1 = await c.eval(`document.querySelector('.ready-go .sun-time').textContent`);
      const f = await c.eval(`document.activeElement && document.activeElement.className`);
      ok(t0 !== t1 && /ready-go/.test(f), 'after the minute changed the focus is still on the place', `${t0} -> ${t1}, focus: ${f}`);
    });
  },

  // 14. reduced-motion-slide: no slide from the home position
  async 'reduced motion: no slide'() {
    await withPage(async (c) => {
      await open(c, `reduced=1&${DAY}`);
      await click(c, '#btn-play');
      await waitFor(c, `__armchair.state === 'tour'`, 20000);
      const xs = [];
      for (let k = 0; k < 14; k++) { xs.push(await c.eval('__armchair.viewOffsetX()')); await sleep(200); }
      ok(new Set(xs).size === 1, 'the globe does not move sideways in the first seconds', xs.join(','));
    });
  },

  // 15. timemode-choice-lost: 지금 그대로 보기 is kept for the next loops
  async 'night choice is kept'() {
    await withPage(async (c) => {
      await open(c, `autoplay=1&speed=20&${NIGHT}`);
      ok(await waitFor(c, `!document.getElementById('toast-action').hidden`, 40000), 'night toast with 지금 그대로 보기');
      await click(c, '#toast-action');
      await sleep(300);
      ok((await c.eval('__armchair.timeMode()')) === 'real', 'real night chosen');
      ok(await waitFor(c, `__armchair.state !== 'tour'`, 200000, 400), 'first loop ended');
      ok(await waitFor(c, `__armchair.state === 'tour' && __armchair.scene === 'descend'`, 60000, 300), 'second loop started');
      await sleep(800);
      const toast = await c.eval(`document.getElementById('toast').hidden ? '' : document.getElementById('toast-text').textContent`);
      ok((await c.eval('__armchair.timeMode()')) === 'real' && !/해 뜰 무렵/.test(toast), 'second loop: still the real night, no question again', `toast: "${toast}"`);
    });
  },

  // 16. cdn-failure-silent: three.js blocked -> a message and a retry button
  async 'three.js blocked: message'() {
    await withPage(async (c) => {
      c.on('Fetch.requestPaused', (p) => c.send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'BlockedByClient' }).catch(() => {}));
      await c.send('Fetch.enable', { patterns: [{ urlPattern: '*cdn.jsdelivr.net*', requestStage: 'Request' }] });
      await c.send('Page.enable'); await c.send('Runtime.enable');
      await c.send('Page.navigate', { url: `${BASE}/` });
      ok(await waitFor(c, `document.querySelector('#boot .boot-msg') && document.querySelector('#boot button')`, 15000), 'boot screen explains and offers 다시 시도');
      const msg = await c.eval(`document.querySelector('#boot .boot-msg').textContent + ' | role=' + document.getElementById('boot').getAttribute('role') + ' aria-hidden=' + document.getElementById('boot').getAttribute('aria-hidden')`);
      ok(/role=alert aria-hidden=null/.test(msg), 'the message is announced', msg);
    });
  },

  // 17. overlapping-notices: toast, narration label and look hint never overlap (and not the sheet)
  async 'notices do not overlap'() {
    await withPage(async (c) => {
      await open(c, `scene=wide&t=60&${NIGHT}`);
      await waitFor(c, `!document.getElementById('toast').hidden`, 10000);
      await click(c, '#btn-story');
      await sleep(200);
      await click(c, '#btn-listen');
      await sleep(400);
      await drag(c, 300, 400, -80, 6, false);
      await sleep(300);
      const boxes = await J(c, `['toast','narr-label','look-hint','cards'].map((id) => { const e = document.getElementById(id); const b = e.getBoundingClientRect(); return { id, hidden: e.hidden, l: b.left, r: b.right, t: b.top, b: b.bottom }; })`);
      const vis = boxes.filter((b) => !b.hidden);
      let over = [];
      for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) {
        const a = vis[i], b = vis[j];
        if (a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b) over.push(`${a.id}/${b.id}`);
      }
      ok(vis.length === 4 && !over.length, 'toast, narration label, look hint and the open sheet do not overlap', over.join(' ') || vis.map((v) => v.id).join(','));
      await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 220, y: 400, button: 'left', clickCount: 1 });
    });
  },

  // R06: the time chip says when the time shown is not "now"
  async 'time chip is honest'() {
    await withPage(async (c) => {
      await open(c, `scene=stand&t=30&still=1&${DAY}`);
      await sleep(500);
      const t1 = await c.eval(`document.getElementById('time-text').textContent + ' | ' + document.getElementById('chip-time').title`);
      ok(/2018년 8월 오후 3시 사진/.test(t1) && /지금 그곳은/.test(t1), '360 photo: the photo time, the real time in the tooltip', t1);
      await open(c, `scene=wide&t=10&still=1&${NIGHT}`);
      await sleep(500);
      const t2 = await c.eval(`document.getElementById('time-text').textContent + ' | ' + document.getElementById('chip-time').title`);
      ok(/미리 보기/.test(t2) && /지금 그곳은 밤 22:00/.test(t2), 'night shown at sunrise: marked 미리 보기, real time in the tooltip', t2);
    });
  },

  // R04: the 360 photo's automatic turn stays on the canyon
  async 'stand sweep stays on the canyon'() {
    await withPage(async (c) => {
      await open(c, `scene=stand&t=0&${DAY}&speed=20`);
      const arc = (await J(c, '__armchair.paths()')).standArc;
      const hs = [];
      const t0 = Date.now();
      while (Date.now() - t0 < 30000) {
        const s = await J(c, `({ sc: __armchair.scene, h: __armchair.camera.heading })`);
        if (s.sc !== 'stand') break;
        hs.push(s.h);
        await sleep(100);
      }
      const lo = Math.min(...hs), hi = Math.max(...hs);
      ok(arc && lo >= Math.min(arc[0], 0) - 1 && hi <= Math.max(arc[1], 0) + 1, 'view centre stays inside the canyon arc', `heading ${lo.toFixed(0)}..${hi.toFixed(0)} deg, arc ${arc && arc.map((x) => x.toFixed(0)).join('..')}`);
    });
  },
};

for (const [name, fn] of Object.entries(CHECKS)) {
  if (only.length && !only.some((w) => name.includes(w))) continue;
  console.log(`\n== ${name}`);
  await fn();
}
console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
