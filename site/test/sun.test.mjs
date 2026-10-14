// node site/test/sun.test.mjs  — checks sun.js against the spec's self-test and known values.
import assert from 'node:assert/strict';
import { selfTest, sunPosition, sunTimesForDate, fmtLocalTime, describeSun, subsolarPoint, tzOffsetMin } from '../js/sun.js';

let failed = 0;
function check(name, fn) {
  try { fn(); console.log('ok  ', name); } catch (e) { failed++; console.log('FAIL', name, '-', e.message); }
}

check("Grand Canyon 2026-10-13 sunrise/sunset within 3 min of NOAA/astral (06:34, 17:55)", () => {
  const r = selfTest();
  console.log('      sunrise', r.sunrise, 'sunset', r.sunset, 'civil dusk', r.civilDusk, `(d ${r.dRise}, ${r.dSet} min)`);
  assert.ok(r.ok, JSON.stringify(r));
});

check('sun near zenith-ish at local solar noon, below horizon at local midnight', () => {
  const st = sunTimesForDate({ y: 2026, m: 10, d: 13 }, 36.0617, -112.1081);
  const noon = sunPosition(st.noon, 36.0617, -112.1081);
  // declination ~ -7.6 deg on Oct 13 -> noon elevation ~ 90 - 36.06 - 7.6 = 46.3
  assert.ok(Math.abs(noon.elevation - 46.3) < 1.0, `noon elev ${noon.elevation}`);
  assert.ok(Math.abs(noon.azimuth - 180) < 2, `noon az ${noon.azimuth}`);
  const mid = sunPosition(st.noon + 12 * 3600e3, 36.0617, -112.1081);
  assert.ok(mid.elevation < -40, `midnight elev ${mid.elevation}`);
});

check('azimuth is east in the morning, west in the evening', () => {
  const st = sunTimesForDate({ y: 2026, m: 10, d: 13 }, 36.0617, -112.1081);
  const m = sunPosition(st.sunrise + 3600e3, 36.0617, -112.1081);
  const e = sunPosition(st.sunset - 3600e3, 36.0617, -112.1081);
  assert.ok(m.azimuth > 90 && m.azimuth < 130, `morning az ${m.azimuth}`);
  assert.ok(e.azimuth > 230 && e.azimuth < 270, `evening az ${e.azimuth}`);
});

check('Seoul 2026-06-21 sunrise ~05:11, sunset ~19:57 KST (KASI table +-3 min)', () => {
  const st = sunTimesForDate({ y: 2026, m: 6, d: 21 }, 37.5665, 126.978);
  const r = fmtLocalTime(st.sunrise, 'Asia/Seoul'), s = fmtLocalTime(st.sunset, 'Asia/Seoul');
  console.log('      Seoul', r, s);
  const toMin = (x) => Number(x.slice(0, 2)) * 60 + Number(x.slice(3, 5));
  assert.ok(Math.abs(toMin(r) - (5 * 60 + 11)) <= 3, r);
  assert.ok(Math.abs(toMin(s) - (19 * 60 + 57)) <= 3, s);
});

check('subsolar point near (decl, -lon of UTC noon)', () => {
  const p = subsolarPoint(Date.UTC(2026, 2, 20, 12, 0, 0));
  assert.ok(Math.abs(p.lat) < 1, `lat ${p.lat}`);
  assert.ok(Math.abs(p.lon - 2) < 3, `lon ${p.lon}`);
});

check('describeSun gives Korean labels and a sort key', () => {
  const ms = Date.parse('2026-10-13T09:11:00Z'); // 02:11 MST
  const d = describeSun(ms, 36.0617, -112.1081, 'America/Phoenix');
  console.log('      ', d.time, d.label);
  assert.equal(d.time, '02:11');
  assert.equal(d.phase, 'night');
  assert.match(d.label, /^밤 · 해 뜨기까지/);
  const d2 = describeSun(Date.parse('2026-10-13T13:35:00Z'), 36.0617, -112.1081, 'America/Phoenix');
  console.log('      ', d2.time, d2.label);
  assert.equal(d2.phase, 'sunrise');
});

check('tz offsets: Phoenix -420, Seoul +540', () => {
  assert.equal(tzOffsetMin(Date.parse('2026-10-13T12:00:00Z'), 'America/Phoenix'), -420);
  assert.equal(tzOffsetMin(Date.parse('2026-10-13T12:00:00Z'), 'Asia/Seoul'), 540);
});

if (failed) { console.log(`${failed} failed`); process.exit(1); }
console.log('all sun tests passed');
