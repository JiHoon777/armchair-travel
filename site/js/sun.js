// Solar position and rise/set times (NOAA Solar Calculator equations, no dependency).
// Pure module: works in the browser and in Node (tools, tests).
//
// Conventions: elevation in degrees above the horizon (with the NOAA refraction correction),
// azimuth in degrees clockwise from north. Times are JS Date / epoch milliseconds (UTC).

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
const MS_DAY = 86400000;

export const ZENITH = {
  SUNRISE: 90.833,  // upper limb + standard refraction
  CIVIL: 96,
  NAUTICAL: 102,
};

export function julianDay(ms) {
  return ms / MS_DAY + 2440587.5;
}

// Declination (deg), equation of time (min), subsolar point.
export function solarParams(ms) {
  const T = (julianDay(ms) - 2451545) / 36525;
  const L0 = ((280.46646 + T * (36000.76983 + T * 0.0003032)) % 360 + 360) % 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const Mr = M * D2R;
  const C = Math.sin(Mr) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
    Math.sin(2 * Mr) * (0.019993 - 0.000101 * T) + Math.sin(3 * Mr) * 0.000289;
  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136 * T;
  const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(omega * D2R);
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * D2R);
  const decl = Math.asin(Math.sin(eps * D2R) * Math.sin(lambda * D2R)) * R2D;
  const y = Math.tan((eps / 2) * D2R) ** 2;
  const L0r = L0 * D2R;
  const eqTime = 4 * R2D * (y * Math.sin(2 * L0r) - 2 * e * Math.sin(Mr) +
    4 * e * y * Math.sin(Mr) * Math.cos(2 * L0r) - 0.5 * y * y * Math.sin(4 * L0r) -
    1.25 * e * e * Math.sin(2 * Mr));
  return { decl, eqTime };
}

// Point on Earth where the sun is overhead (deg).
export function subsolarPoint(ms) {
  const { decl, eqTime } = solarParams(ms);
  const d = new Date(ms);
  const utcMin = d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60 + d.getUTCMilliseconds() / 60000;
  let lon = (720 - utcMin - eqTime) / 4;
  lon = ((lon + 540) % 360) - 180;
  return { lat: decl, lon };
}

function refraction(elev) {
  // NOAA approximation (degrees)
  if (elev > 85) return 0;
  const te = Math.tan(elev * D2R);
  let r;
  if (elev > 5) r = 58.1 / te - 0.07 / te ** 3 + 0.000086 / te ** 5;
  else if (elev > -0.575) r = 1735 + elev * (-518.2 + elev * (103.4 + elev * (-12.79 + elev * 0.711)));
  else r = -20.772 / te;
  return r / 3600;
}

export function sunPosition(ms, lat, lon, out = {}) {
  const t = typeof ms === 'number' ? ms : ms.getTime();
  const { decl, eqTime } = solarParams(t);
  const d = new Date(t);
  const utcMin = d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60 + d.getUTCMilliseconds() / 60000;
  let tst = (utcMin + eqTime + 4 * lon) % 1440;
  if (tst < 0) tst += 1440;
  let ha = tst / 4 - 180;
  if (ha < -180) ha += 360;
  const latR = lat * D2R, decR = decl * D2R, haR = ha * D2R;
  let cosZ = Math.sin(latR) * Math.sin(decR) + Math.cos(latR) * Math.cos(decR) * Math.cos(haR);
  cosZ = Math.max(-1, Math.min(1, cosZ));
  const zen = Math.acos(cosZ) * R2D;
  const elevGeo = 90 - zen;
  let az;
  const sinZ = Math.sin(zen * D2R);
  if (Math.abs(sinZ) < 1e-9 || Math.abs(Math.cos(latR)) < 1e-9) {
    az = lat > 0 ? 180 : 0;
  } else {
    let ca = (Math.sin(latR) * cosZ - Math.sin(decR)) / (Math.cos(latR) * sinZ);
    ca = Math.max(-1, Math.min(1, ca));
    const a = Math.acos(ca) * R2D;
    az = ha > 0 ? (a + 180) % 360 : (540 - a) % 360;
  }
  out.elevation = elevGeo + refraction(elevGeo);
  out.elevationGeo = elevGeo;
  out.azimuth = az;
  return out;
}

function hourAngleDeg(lat, decl, zenith) {
  const latR = lat * D2R, decR = decl * D2R;
  const c = Math.cos(zenith * D2R) / (Math.cos(latR) * Math.cos(decR)) - Math.tan(latR) * Math.tan(decR);
  if (c > 1) return -1;   // sun never reaches this zenith (stays below): polar night for sunrise
  if (c < -1) return 999; // sun never goes below: polar day
  return Math.acos(c) * R2D;
}

// baseMs = 00:00 UTC of the calendar date that contains the place's local solar noon.
function eventUTC(baseMs, lat, lon, zenith, kind) {
  let mins = 720 - 4 * lon;
  for (let k = 0; k < 3; k++) {
    const { decl, eqTime } = solarParams(baseMs + mins * 60000);
    const noon = 720 - 4 * lon - eqTime;
    if (kind === 'noon') { mins = noon; continue; }
    const ha = hourAngleDeg(lat, decl, zenith);
    if (ha < 0) return { ms: NaN, polar: 'night' };
    if (ha > 360) return { ms: NaN, polar: 'day' };
    mins = kind === 'rise' ? noon - 4 * ha : noon + 4 * ha;
  }
  return { ms: baseMs + mins * 60000, polar: null };
}

// Calendar date (y, m 1-12, d) in an IANA time zone.
const dtfCache = new Map();
function dtf(tz, kind) {
  const key = tz + '|' + kind;
  let f = dtfCache.get(key);
  if (!f) {
    f = kind === 'date'
      ? new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
      : new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    dtfCache.set(key, f);
  }
  return f;
}
export function localDate(ms, tz) {
  const parts = dtf(tz, 'date').formatToParts(new Date(ms));
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  return { y: get('year'), m: get('month'), d: get('day') };
}
export function fmtLocalTime(ms, tz) {
  if (!Number.isFinite(ms)) return '--:--';
  const s = dtf(tz, 'time').format(new Date(ms + 30000)); // round to the nearest minute
  return s.replace(/^24:/, '00:');
}
// Minutes east of UTC for tz at ms (handles DST).
export function tzOffsetMin(ms, tz) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000);
}

// Sun events for a calendar date {y, m, d} at (lat, lon). All values epoch ms (NaN if none).
export function sunTimesForDate(ymd, lat, lon) {
  const base = Date.UTC(ymd.y, ymd.m - 1, ymd.d);
  const rise = eventUTC(base, lat, lon, ZENITH.SUNRISE, 'rise');
  const set = eventUTC(base, lat, lon, ZENITH.SUNRISE, 'set');
  const dawn = eventUTC(base, lat, lon, ZENITH.CIVIL, 'rise');
  const dusk = eventUTC(base, lat, lon, ZENITH.CIVIL, 'set');
  const noon = eventUTC(base, lat, lon, 0, 'noon');
  return {
    sunrise: rise.ms, sunset: set.ms, civilDawn: dawn.ms, civilDusk: dusk.ms, noon: noon.ms,
    polar: rise.polar || set.polar || null,
  };
}

export function sunTimesLocal(ms, lat, lon, tz) {
  return sunTimesForDate(localDate(ms, tz), lat, lon);
}

function addDays(ymd, n) {
  const t = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d) + n * MS_DAY);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

// Next sunrise strictly after ms (searches up to 3 days; NaN in polar night).
export function nextSunrise(ms, lat, lon, tz) {
  const today = localDate(ms, tz);
  for (let k = -1; k < 3; k++) {
    const st = sunTimesForDate(addDays(today, k), lat, lon);
    if (Number.isFinite(st.sunrise) && st.sunrise > ms) return st.sunrise;
  }
  return NaN;
}
// Sunrise nearest to ms (past or future).
export function nearestSunrise(ms, lat, lon, tz) {
  const today = localDate(ms, tz);
  let best = NaN, bestD = Infinity;
  for (let k = -1; k <= 1; k++) {
    const sr = sunTimesForDate(addDays(today, k), lat, lon).sunrise;
    if (Number.isFinite(sr) && Math.abs(sr - ms) < bestD) { best = sr; bestD = Math.abs(sr - ms); }
  }
  return best;
}

function humanSpan(min) {
  if (min < 1) return '곧';
  if (min < 60) return `${Math.round(min)}분`;
  const h = min / 60;
  return h < 10 ? `${Math.round(h * 2) / 2}시간`.replace('.5시간', '시간 반') : `${Math.round(h)}시간`;
}

// Human description of the sun at a place now (Korean). Used by the home list and the top chip.
export function describeSun(ms, lat, lon, tz) {
  const pos = sunPosition(ms, lat, lon);
  const st = sunTimesLocal(ms, lat, lon, tz);
  const time = fmtLocalTime(ms, tz);
  const elev = pos.elevation;
  const nsr = nextSunrise(ms, lat, lon, tz);
  const near = nearestSunrise(ms, lat, lon, tz);
  const toRise = (nsr - ms) / 60000;
  const MIN = 60000;
  let phase, label, short;
  if (st.polar === 'night' && elev < -0.833) {
    phase = 'night'; label = '밤 · 해가 뜨지 않는 철'; short = '밤';
  } else if (st.polar === 'day' && elev > -0.833) {
    phase = 'day'; label = '낮 · 해가 지지 않는 철'; short = '낮';
  } else if (Number.isFinite(st.sunrise) && ms >= st.sunrise - 45 * MIN && ms <= st.sunrise + 45 * MIN) {
    phase = 'sunrise';
    const tsr = fmtLocalTime(st.sunrise, tz);
    label = ms < st.sunrise ? `${tsr} 해 뜸 · ${humanSpan((st.sunrise - ms) / MIN)} 뒤` : `${tsr} 해 뜸`;
    short = ms < st.sunrise ? '해 뜨기 직전' : '해 뜬 직후';
  } else if (Number.isFinite(st.sunset) && ms >= st.sunset - 45 * MIN && ms <= st.sunset + 30 * MIN) {
    phase = 'sunset';
    const tss = fmtLocalTime(st.sunset, tz);
    label = ms < st.sunset ? `${tss} 해 짐 · ${humanSpan((st.sunset - ms) / MIN)} 뒤` : `${tss} 해 짐`;
    short = ms < st.sunset ? '해 질 녘' : '해 진 직후';
  } else if (elev > 0) {
    // 아침 until 10:00, 낮 until noon, 오후 after (the sunrise/sunset bands are handled above)
    const hm = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
    phase = 'day';
    label = short = hm < 600 ? '아침' : hm < 720 ? '낮' : '오후';
  } else if (elev > -6) {
    const morning = Number.isFinite(st.noon) ? ms < st.noon : toRise < 6 * 60;
    if (morning) { phase = 'dawn'; label = `새벽 · 해 뜨기까지 ${humanSpan(toRise)}`; short = '새벽'; }
    else { phase = 'dusk'; label = '저녁 · 해 진 뒤'; short = '저녁'; }
  } else {
    phase = 'night';
    label = Number.isFinite(toRise) ? `밤 · 해 뜨기까지 ${humanSpan(toRise)}` : '밤';
    short = '밤';
  }
  return {
    time, elev, azimuth: pos.azimuth, phase, label, short,
    minutesToSunrise: toRise,
    sortKey: Number.isFinite(near) ? Math.abs(near - ms) / MIN : 1e9,
    nextSunrise: nsr, nearSunrise: near,
    times: st,
  };
}

// "05:31 해 뜸 · 2시간 뒤" / "06:12 해 뜸 · 20분 전" for the sunrise nearest to ms (or the next one).
export function sunriseLabel(ms, sunriseMs, tz) {
  if (!Number.isFinite(sunriseMs)) return '해가 뜨지 않는 철';
  const d = (sunriseMs - ms) / 60000;
  const t = fmtLocalTime(sunriseMs, tz);
  if (Math.abs(d) < 1) return `${t} 해 뜸 · 지금`;
  return d > 0 ? `${t} 해 뜸 · ${humanSpan(d)} 뒤` : `${t} 해 뜸 · ${humanSpan(-d)} 전`;
}

// Self-test: Grand Canyon (Mather Point) on 2026-10-13 in MST (UTC-7, no DST).
// The task brief said sunrise ~06:39 / sunset ~18:06, but that does not match the NOAA
// equations or an independent library (astral 3: sunrise 06:33:53, noon 12:14:46,
// sunset 17:54:44, civil dusk 18:21:00). The test checks the verified values (+-3 min).
export const SELF_TEST_EXPECT = { sunrise: '06:34', sunset: '17:55', briefSaid: ['06:39', '18:06'] };
export function selfTest() {
  const lat = 36.0617, lon = -112.1081, tz = 'America/Phoenix';
  const st = sunTimesForDate({ y: 2026, m: 10, d: 13 }, lat, lon);
  const rise = fmtLocalTime(st.sunrise, tz), set = fmtLocalTime(st.sunset, tz);
  const toMin = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  const dRise = toMin(rise) - toMin(SELF_TEST_EXPECT.sunrise), dSet = toMin(set) - toMin(SELF_TEST_EXPECT.sunset);
  const ok = Math.abs(dRise) <= 3 && Math.abs(dSet) <= 3;
  return { ok, sunrise: rise, sunset: set, civilDusk: fmtLocalTime(st.civilDusk, tz), dRise, dSet };
}
