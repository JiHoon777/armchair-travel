// node site/test/paths.test.mjs — continuity and sanity of the scripted camera paths.
// (Comfort limits are checked by tools/check_paths.mjs.)
import assert from 'node:assert/strict';
import { makePathContext, pose, globeTurnPlan, makeDaylapseClock } from '../js/paths.js';
import { proceduralHeight } from '../js/procedural.js';
import { sunTimesForDate, sunPosition } from '../js/sun.js';
import { easedTime } from '../js/util.js';

let failed = 0;
function check(name, fn) {
  try { fn(); console.log('ok  ', name); } catch (e) { failed++; console.log('FAIL', name, '-', e.message); }
}
const ctx = makePathContext({ heightAt: proceduralHeight });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

check('eased time: starts and ends at rest, span = T - E', () => {
  const T = 180, E = 1.5;
  assert.equal(easedTime(0, T, E), 0);
  assert.ok(Math.abs(easedTime(T, T, E) - (T - E)) < 1e-9);
  const v0 = (easedTime(0.01, T, E) - easedTime(0, T, E)) / 0.01;
  const vm = (easedTime(90.01, T, E) - easedTime(90, T, E)) / 0.01;
  assert.ok(v0 < 0.01 && Math.abs(vm - 1) < 1e-6, `${v0} ${vm}`);
});

check('descend ends where the wide orbit starts', () => {
  const a = pose('descend', ctx.dur.descend, ctx, {}), b = pose('wide', 0, ctx, {});
  assert.equal(a.space, 'terrain');
  assert.ok(dist(a, b) < 1, `gap ${dist(a, b)}`);
  assert.ok(Math.abs(a.pitch - b.pitch) < 0.2 && Math.abs(a.heading - b.heading) < 0.2);
});

check('wide orbit ends where the approach starts', () => {
  const a = pose('wide', ctx.dur.wide, ctx, {}), b = pose('approach', 0, ctx, {});
  assert.ok(dist(a, b) < 1, `gap ${dist(a, b)}`);
  assert.ok(Math.abs(a.heading - b.heading) < 0.5, `${a.heading} ${b.heading}`);
});

check('descend is on the globe before the swap and on terrain after', () => {
  assert.equal(pose('descend', 5, ctx, {}).space, 'globe');
  assert.equal(pose('descend', 25, ctx, {}).space, 'terrain');
  const g = pose('descend', 21.4, ctx, {});
  assert.ok(g.cloud > 0.99, `cloud ${g.cloud}`);
  assert.ok(Math.abs(g.altM - 25000) < 1500, `alt at swap ${g.altM}`);
});

check('approach ends 900-1200 m above the river', () => {
  const p = pose('approach', ctx.dur.approach, ctx, {});
  const above = p.y - ctx.approach.riverY;
  assert.ok(above >= 880 && above <= 1260, `above river ${above}`);
});

check('roll is always zero', () => {
  for (const id of ['descend', 'wide', 'approach', 'stand', 'daylapse', 'ascend']) {
    for (let t = 0; t <= ctx.dur[id]; t += 7) assert.equal(pose(id, t, ctx, {}).roll, 0, `${id} ${t}`);
  }
});

check('stand pano turns slowly and fades at both ends', () => {
  const a = pose('stand', 0, ctx, {}), b = pose('stand', 100, ctx, {});
  assert.equal(a.fade, 1);
  assert.ok(b.yaw > 100 && b.yaw < 160, `yaw ${b.yaw}`);
});

check('globe pre-turn stays under the turn ceiling', () => {
  const p = globeTurnPlan(-20, 70, -112.1);
  assert.ok((1.5 * p.deg) / p.dur <= 20.0001, `${p.deg} deg in ${p.dur} s`);
});

check('daylapse clock runs sunrise-30 min to civil dusk, slower near the horizon', () => {
  const st = sunTimesForDate({ y: 2026, m: 10, d: 13 }, 36.0617, -112.1081);
  const clock = makeDaylapseClock(st.sunrise, st.civilDusk, 36.0617, -112.1081, 180);
  assert.ok(Math.abs(clock(0) - (st.sunrise - 30 * 60000)) < 1000);
  assert.ok(Math.abs(clock(180) - st.civilDusk) < 1000);
  // minutes of real time per screen second near sunrise vs midday
  const rate = (t) => (clock(t + 1) - clock(t)) / 60000;
  const tNoon = [...Array(170).keys()].find((t) => sunPosition(clock(t + 5), 36.0617, -112.1081).elevation > 40) + 5;
  assert.ok(rate(12) < rate(tNoon), `near sunrise ${rate(12).toFixed(1)} min/s, midday ${rate(tNoon).toFixed(1)} min/s`);
});

if (failed) { console.log(`${failed} failed`); process.exit(1); }
console.log('all path tests passed');
