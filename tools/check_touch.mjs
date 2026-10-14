#!/usr/bin/env node
// Touch checks on the phone layout (INTEGRATE): one-finger drag looks around, the hint shows,
// the offset holds for 4 s after release and eases back to the scripted path; a tap brings the
// caption back; a two-finger pinch changes the field of view; the same on the 360 photo, where
// the turn is kept (no swing back). Trusted touch input over the DevTools protocol.
// Needs the local server (tools/serve.sh).
//   node tools/check_touch.mjs [--base http://localhost:8077]
import { launch, openPage } from './lib/cdp.mjs';

const i = process.argv.indexOf('--base');
const BASE = i >= 0 ? process.argv[i + 1] : 'http://localhost:8077';
const DAY = 'time=2026-10-13T17:30:00Z';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const ok = (cond, what, detail = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}${detail ? '  ' + detail : ''}`); };

const client = await launch({ width: 390, height: 844 });
const touch = (type, pts) => client.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id, radiusX: 4, radiusY: 4, force: 1 })) });
async function drag(x0, y0, dx, dy, steps = 12) {
  await touch('touchStart', [[x0, y0]]);
  for (let k = 1; k <= steps; k++) { await touch('touchMove', [[x0 + (dx * k) / steps, y0 + (dy * k) / steps]]); await sleep(16); }
  await touch('touchEnd', []);
}
const look = async () => JSON.parse(await client.eval('JSON.stringify(__armchair.look())'));
try {
  // --- terrain scene, real time (no still) so the return can be watched
  let r = await openPage(client, `${BASE}/?lowres=1&scene=wide&t=30&${DAY}`, { width: 390, height: 844, mobile: true });
  ok(r.state && r.state.ready && !r.errors.length, 'phone wide scene ready, no errors', r.errors.join(' | '));
  const h0 = await client.eval('__armchair.camera.heading');
  await drag(195, 420, -160, 40);
  await sleep(250);
  const l1 = await look();
  const h1 = await client.eval('__armchair.camera.heading');
  const hint = await client.eval('!document.getElementById("look-hint").hidden');
  ok(Math.abs(l1.yaw) > 5 && hint, 'one-finger drag turns the view and shows the hint', `look yaw ${l1.yaw}, pitch ${l1.pitch}, heading ${h0} -> ${h1}`);
  // the hint must not cover the stacked chips (place + time) on a narrow phone
  const overlap = await client.eval(`(() => { const a = document.getElementById('look-hint').getBoundingClientRect(); return [...document.querySelectorAll('.hud-top .chip')].some((c) => { const b = c.getBoundingClientRect(); return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom); }); })()`);
  ok(!overlap, 'the look hint does not overlap the chips');
  await sleep(2800);
  const l2 = await look();
  ok(Math.abs(l2.yaw - l1.yaw) < 0.5, 'offset holds while the 4 s wait runs', `yaw ${l1.yaw} -> ${l2.yaw} after 3 s`);
  await sleep(4200);
  const l3 = await look();
  ok(l3.yaw === 0 && l3.pitch === 0, 'then eases back to the scripted path', `yaw ${l3.yaw}, pitch ${l3.pitch} after 7 s`);
  // --- 360 photo: the turn is kept after release (no swing back)
  r = await openPage(client, `${BASE}/?lowres=1&scene=stand&t=30&${DAY}`, { width: 390, height: 844, mobile: true });
  ok(r.state && r.state.ready && r.state.pano === 'ready', '360 photo ready on the phone', JSON.stringify(r.state && r.state.pano));
  const p0 = await client.eval('__armchair.camera.heading');
  await drag(80, 420, 300, 0); // finger moves right -> the view turns left
  await sleep(250);
  const p1 = await client.eval('__armchair.camera.heading');
  const lp = await look();
  await sleep(7500);
  const p2 = await client.eval('__armchair.camera.heading');
  const l5 = await look();
  const d1 = ((p1 - p0 + 540) % 360) - 180, d2 = ((p2 - p0 + 540) % 360) - 180;
  // the photo turns right on its own at 1.5 deg/s (paused while held and for 4 s after), so a kept
  // turn stays clearly left of the start; a swing back would end right of it
  ok(d1 < -10 && d2 < -5 && l5.yaw === 0, 'on the 360 photo the dragged turn is kept after release', `heading ${p0} -> ${p1} (look yaw ${lp.yaw}) -> ${p2}; change ${d1.toFixed(1)} after the drag, ${d2.toFixed(1)} 7.5 s later, look offset ${l5.yaw}`);
  ok(!r.errors.length, 'no errors on the 360 photo', r.errors.join(' | '));

  // --- pinch and tap last: after a two-finger gesture, emulated single touches on the next page
  // are not delivered by headless Chrome (a harness quirk, not the page)
  r = await openPage(client, `${BASE}/?lowres=1&scene=wide&t=30&${DAY}`, { width: 390, height: 844, mobile: true });
  // pinch: two fingers apart -> narrower field of view (zoom in)
  await touch('touchStart', [[150, 420], [240, 420]]);
  for (let k = 1; k <= 10; k++) { await touch('touchMove', [[150 - k * 8, 420], [240 + k * 8, 420]]); await sleep(16); }
  await touch('touchEnd', []);
  await sleep(200);
  const l4 = await look();
  ok(l4.fov < -3, 'two-finger pinch out zooms in (fov offset)', `fov offset ${l4.fov}`);
  // tap: caption comes back after it hid
  await client.eval(`document.getElementById('caption').classList.add('is-hidden')`);
  await touch('touchStart', [[195, 300]]); await sleep(60); await touch('touchEnd', []);
  await sleep(300);
  const capShown = await client.eval(`!document.getElementById('caption').classList.contains('is-hidden')`);
  ok(capShown, 'a tap brings the caption back');

} catch (e) {
  fails++;
  console.log('FAIL', e.message);
} finally {
  await client.close();
}
process.exit(fails ? 1 : 0);
