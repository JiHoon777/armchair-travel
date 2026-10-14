#!/usr/bin/env node
// Validate every data file under site/data against the prototype's data contract (INTEGRATE).
// Node 24, nothing to install. Exit code 1 when any check fails (warnings do not fail).
//
//   node tools/validate_data.mjs            human-readable report
//   node tools/validate_data.mjs --json     machine-readable
//   node tools/validate_data.mjs --site /path/to/copy/of/site   (e.g. a deliberately broken copy)
//
// What it checks:
//   - JSON shapes of meta.json, pano.json, media.json, audio.json, globe.json, credits/*.json,
//     places.json and place.json (the keys the contract names; extra keys are allowed)
//   - every referenced file exists, is referenced by a plain relative name, and has the size
//     the contract says (JPEG SOF / PNG IHDR parsed directly)
//   - the DEMs: PNG chunk list, 8-bit RGB, decode (Terrarium), min/max vs meta, the check
//     points (Mather Point ~2,170 m, Phantom Ranch / river ~750 m), core edge vs outer
//   - sizes: total site/data <= 40 MB, every file < 16 MB (Artifact per-file limit)
//   - credits: every shipped medium has a credit line; licences are commercial-use OK
//     (public domain, CC0, CC BY, CC BY-SA; no NC/ND); no Google/Esri/Mapbox sources
//   - place.json lengths (captions 40-60, cards 3 x 250-350, narration ~640 / ~90 s,
//     deep read 1,500-2,500), scene order and durations, fact/source references,
//     camera hints inside the 20 km core
//   - site code rules for the Artifact: only jsDelivr three@0.170.0 and Google Fonts as
//     external hosts, no alert/confirm/prompt, no iframes, no absolute data URLs
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { decodePNG, terrariumToFloat } from './lib/png.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const siteArg = process.argv.indexOf('--site');   // --site <dir>: validate another copy (negative tests)
const SITE = siteArg >= 0 ? path.resolve(process.argv[siteArg + 1]) : path.join(ROOT, 'site');
const DATA = path.join(SITE, 'data');
const GC = path.join(DATA, 'grand-canyon');
const asJson = process.argv.includes('--json');

const results = [];
let section = '';
const sec = (name) => { section = name; };
const pass = (what, detail = '') => results.push({ section, ok: true, level: 'ok', what, detail });
const fail = (what, detail = '') => results.push({ section, ok: false, level: 'fail', what, detail });
const warn = (what, detail = '') => results.push({ section, ok: true, level: 'warn', what, detail });
const check = (cond, what, detail = '') => (cond ? pass(what, detail) : fail(what, detail));

const rel = (p) => path.relative(ROOT, p);
function readJSON(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { fail(`${rel(p)} parses`, e.message); return null; }
}
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
// a plain relative file name inside the same folder (Artifact: relative URLs only)
const plainName = (f) => isStr(f) && !/^[a-z]+:|^\/|\.\.|\\/i.test(f);

// ------------------------------------------------------------------ image headers
function imageSize(file) {
  const b = fs.readFileSync(file);
  if (b[0] === 0x89 && b.toString('ascii', 1, 4) === 'PNG') {
    return { type: 'png', w: b.readUInt32BE(16), h: b.readUInt32BE(20), bytes: b.length };
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let off = 2, progressive = false, icc = false, exif = false;
    while (off < b.length) {
      if (b[off] !== 0xff) { off++; continue; }
      const m = b[off + 1];
      if (m === 0xd9 || m === 0xda) break;
      const len = b.readUInt16BE(off + 2);
      if (m === 0xe2 && b.toString('ascii', off + 4, off + 15) === 'ICC_PROFILE') icc = true;
      if (m === 0xe1 && b.toString('ascii', off + 4, off + 8) === 'Exif') exif = true;
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        progressive = m === 0xc2;
        return { type: 'jpeg', h: b.readUInt16BE(off + 5), w: b.readUInt16BE(off + 7), comps: b[off + 9], progressive, icc, exif, bytes: b.length };
      }
      off += 2 + len;
    }
    return { type: 'jpeg', w: 0, h: 0, bytes: b.length };
  }
  return { type: 'unknown', w: 0, h: 0, bytes: b.length };
}
function checkImage(dir, file, w, h, label) {
  if (!plainName(file)) { fail(`${label}: relative file name`, String(file)); return null; }
  const p = path.join(dir, file);
  if (!fs.existsSync(p)) { fail(`${label}: ${file} exists`); return null; }
  const s = imageSize(p);
  const okSize = (w == null || s.w === w) && (h == null || s.h === h);
  check(okSize, `${label}: ${file} is ${w ?? '*'}x${h ?? '*'}`, `${s.type} ${s.w}x${s.h}, ${(s.bytes / 1024).toFixed(0)} KB${s.comps ? `, ${s.comps} comp` : ''}${s.icc ? ', ICC' : ''}${s.exif ? ', EXIF' : ''}`);
  if (s.type === 'jpeg' && s.comps && s.comps !== 3 && s.comps !== 1) fail(`${label}: ${file} is RGB or grey JPEG`, `${s.comps} components`);
  return s;
}

// ------------------------------------------------------------------ licences
const LIC_BAD = /non[- ]?commercial|\bNC\b|-NC|\bND\b|-ND|no ?deriv|all rights reserved|editorial/i;
const LIC_OK = /public domain|PD-|CC0|CC BY(?!-NC|-ND)|CC-BY(?!-NC|-ND)|U\.S\. Government|MIT|OFL/i;
const HOST_BAD = /google\.|googleapis|gstatic|esri\.com|arcgisonline|arcgis\.com|mapbox/i;
function checkCredit(c, label) {
  if (!c || typeof c !== 'object') { fail(`${label}: credit present`); return; }
  const miss = ['title', 'author', 'license', 'url'].filter((k) => !isStr(c[k]));
  check(!miss.length, `${label}: credit has title/author/license/url`, miss.length ? `missing ${miss.join(', ')}` : `${c.license}`);
  if (isStr(c.license)) check(LIC_OK.test(c.license) && !LIC_BAD.test(c.license), `${label}: licence is commercial-use OK`, c.license);
  for (const k of ['url', 'source_url']) if (isStr(c[k]) && HOST_BAD.test(c[k])) fail(`${label}: no Google/Esri/Mapbox source`, c[k]);
}

// ------------------------------------------------------------------ 1. sizes
sec('files and sizes');
const allFiles = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p); else allFiles.push({ p, bytes: fs.statSync(p).size });
  }
})(DATA);
const total = allFiles.reduce((s, f) => s + f.bytes, 0);
check(total <= 40 * 1024 * 1024, 'site/data total <= 40 MB', `${(total / 1048576).toFixed(1)} MB in ${allFiles.length} files`);
const big = allFiles.filter((f) => f.bytes >= 16 * 1024 * 1024);
check(!big.length, 'every data file < 16 MB (Artifact per-file limit)', big.map((f) => rel(f.p)).join(', ') || `largest ${rel(allFiles.sort((a, b) => b.bytes - a.bytes)[0].p)} ${(allFiles[0].bytes / 1048576).toFixed(1)} MB`);
const junk = allFiles.filter((f) => /\.DS_Store$|~$|\.tmp$|\.npy$|\.py$/i.test(f.p));
check(!junk.length, 'no stray files in site/data', junk.map((f) => rel(f.p)).join(', '));
// desktop / mobile download sets for the place
const sum = (re) => allFiles.filter((f) => re.test(f.p)).reduce((s, f) => s + f.bytes, 0);
pass('download sets (info)', `terrain desktop ${(sum(/terrain\/(core_dem|outer_dem|core_tex_|outer_tex\.)/) / 1048576).toFixed(1)} MB, mobile ${(sum(/terrain\/(core_dem|outer_dem|core_texm_|outer_texm)/) / 1048576).toFixed(1)} MB; audio ${(sum(/audio\/.*mp3$/) / 1048576).toFixed(1)} MB`);

// ------------------------------------------------------------------ 2. terrain
sec('terrain (TERRAIN)');
const TD = path.join(GC, 'terrain');
const meta = readJSON(path.join(TD, 'meta.json'));
let core = null, outer = null;
if (meta) {
  check(meta.origin && meta.origin.lat === 36.115 && meta.origin.lon === -112.105, 'meta.origin = 36.1150, -112.1050', JSON.stringify(meta.origin));
  check(meta.core && meta.core.size_m === 20000, 'core.size_m = 20000');
  check(meta.outer && meta.outer.size_m === 100000, 'outer.size_m = 100000');
  check(Array.isArray(meta.attribution) && meta.attribution.length > 0 && meta.attribution.every(isStr), 'meta.attribution lines', `${(meta.attribution || []).length} lines`);
  for (const part of ['core', 'outer']) {
    const m = meta[part];
    if (!m || !m.dem) { fail(`${part}.dem present`); continue; }
    const wantN = part === 'core' ? 1537 : 513;
    check(m.dem.n === wantN && m.dem.encoding === 'terrarium', `${part}.dem n=${wantN}, terrarium`, `n=${m.dem.n} ${m.dem.encoding}`);
    check(isNum(m.dem.min_m) && isNum(m.dem.max_m), `${part}.dem min_m/max_m numbers`);
    const f = path.join(TD, m.dem.file);
    if (!plainName(m.dem.file) || !fs.existsSync(f)) { fail(`${part} DEM file exists`, m.dem.file); continue; }
    let img;
    try { img = decodePNG(fs.readFileSync(f)); } catch (e) { fail(`${part} DEM decodes`, e.message); continue; }
    const chunksOk = img.chunks.every((c) => ['IHDR', 'IDAT', 'IEND'].includes(c));
    check(chunksOk && img.channels === 3, `${part} DEM: 8-bit RGB, only IHDR/IDAT/IEND (no gamma/ICC)`, `${img.channels} ch, chunks ${[...new Set(img.chunks)].join('/')}`);
    check(img.width === m.dem.n && img.height === m.dem.n, `${part} DEM is ${m.dem.n}x${m.dem.n}`, `${img.width}x${img.height}`);
    const grid = terrariumToFloat(img);
    let mn = Infinity, mx = -Infinity;
    for (const v of grid) { if (v < mn) mn = v; if (v > mx) mx = v; }
    check(Math.abs(mn - m.dem.min_m) < 0.05 && Math.abs(mx - m.dem.max_m) < 0.05, `${part} DEM min/max match meta`, `decoded ${mn.toFixed(2)}..${mx.toFixed(2)} m, meta ${m.dem.min_m}..${m.dem.max_m}`);
    check(mn > 300 && mx < 3200, `${part} DEM in a plausible range (no nodata)`, `${mn.toFixed(0)}..${mx.toFixed(0)} m`);
    const obj = { grid, n: img.width, size: m.size_m };
    if (part === 'core') core = obj; else outer = obj;
    // textures
    const tx = m.tex || {};
    if (part === 'core') {
      check(tx.grid === 3 && tx.px === 2048 && tx.mobile_px === 1024, 'core.tex grid 3, 2048 / 1024 px', JSON.stringify({ grid: tx.grid, px: tx.px, mobile_px: tx.mobile_px }));
      for (let r = 0; r < (tx.grid || 3); r++) for (let c = 0; c < (tx.grid || 3); c++) {
        checkImage(TD, String(tx.file).replace('{row}', r).replace('{col}', c), tx.px, tx.px, `core tile ${r},${c}`);
        checkImage(TD, String(tx.mobile_file).replace('{row}', r).replace('{col}', c), tx.mobile_px, tx.mobile_px, `core mobile tile ${r},${c}`);
      }
    } else {
      check(tx.px === 2048 && tx.mobile_px === 1024, 'outer.tex 2048 / 1024 px');
      checkImage(TD, tx.file, tx.px, tx.px, 'outer texture');
      checkImage(TD, tx.mobile_file, tx.mobile_px, tx.mobile_px, 'outer mobile texture');
    }
  }
}
const sample = (d, x, z) => {
  const half = d.size / 2, n = d.n;
  const fx = ((x + half) / d.size) * (n - 1), fz = ((z + half) / d.size) * (n - 1);
  if (!(fx >= 0 && fz >= 0 && fx <= n - 1 && fz <= n - 1)) return NaN;
  const c0 = Math.min(Math.floor(fx), n - 2), r0 = Math.min(Math.floor(fz), n - 2), tx = fx - c0, tz = fz - r0, i = r0 * n + c0;
  return (d.grid[i] * (1 - tx) + d.grid[i + 1] * tx) * (1 - tz) + (d.grid[i + n] * (1 - tx) + d.grid[i + n + 1] * tx) * tz;
};
const COSL = Math.cos(36.115 * Math.PI / 180);
const toLocal = (lat, lon) => ({ x: (lon + 112.105) * 111320 * COSL, z: -(lat - 36.115) * 110574 });
if (meta && core) {
  const checks = Array.isArray(meta.checks) ? meta.checks : [];
  check(checks.length >= 5 && checks.every((c) => isStr(c.name) && isNum(c.lat) && isNum(c.lon) && isNum(c.elev_m)), 'meta.checks: name/lat/lon/elev_m', `${checks.length} points`);
  for (const c of checks) {
    const { x, z } = toLocal(c.lat, c.lon);
    const got = sample(core, x, z);
    check(Math.abs(got - c.elev_m) < 0.5, `DEM decode at ${c.name} = meta value`, `${got.toFixed(1)} m (meta ${c.elev_m})`);
  }
  const mather = checks.find((c) => /mather/i.test(c.name));
  if (mather) {
    const { x, z } = toLocal(mather.lat, mather.lon);
    const v = sample(core, x, z);
    check(Math.abs(v - 2170) <= 10, 'Mather Point ≈ 2,170 m', `${v.toFixed(1)} m`);
  } else fail('Mather Point in checks');
  const pr = checks.find((c) => /phantom/i.test(c.name));
  if (pr) {
    const { x, z } = toLocal(pr.lat, pr.lon);
    const v = sample(core, x, z);
    let riverMin = Infinity;
    for (let dz = -800; dz <= 800; dz += 13) for (let dx = -800; dx <= 800; dx += 13) {
      if (dx * dx + dz * dz > 800 * 800) continue;
      const h = sample(core, x + dx, z + dz);
      if (h < riverMin) riverMin = h;
    }
    check(v > 700 && v < 800 && riverMin > 700 && riverMin < 770, 'Phantom Ranch ≈ 750 m (point and river within 800 m)', `point ${v.toFixed(1)} m, river ${riverMin.toFixed(1)} m`);
  } else fail('Phantom Ranch in checks');
  if (outer) {
    // the outer grid under the core border should agree on average (the app drops it 30 m)
    let s = 0, s2 = 0, k = 0, worst = 0;
    for (let i = 0; i <= 200; i++) {
      const u = -10000 + (i / 200) * 20000;
      for (const [x, z] of [[u, -9990], [u, 9990], [-9990, u], [9990, u]]) {
        const d = sample(outer, x, z) - sample(core, x, z);
        s += d; s2 += d * d; k++; worst = Math.max(worst, Math.abs(d));
      }
    }
    const mean = s / k, rms = Math.sqrt(s2 / k);
    check(Math.abs(mean) < 10, 'outer vs core along the core edge: mean difference < 10 m', `mean ${mean.toFixed(1)} m, RMS ${rms.toFixed(0)} m, max ${worst.toFixed(0)} m`);
  }
}

// ------------------------------------------------------------------ 3. pano / media / audio / globe
sec('360 photo (MEDIA)');
const PD = path.join(GC, 'pano');
const pano = readJSON(path.join(PD, 'pano.json'));
if (pano) {
  check(pano.width === 4096 && pano.height === 2048, 'pano.json width/height 4096x2048');
  checkImage(PD, pano.file, 4096, 2048, 'pano');
  checkImage(PD, pano.file_mobile, 2048, 1024, 'pano mobile');
  check(isNum(pano.initial_yaw_deg) && pano.initial_yaw_deg >= 0 && pano.initial_yaw_deg < 360, 'initial_yaw_deg in 0..360', String(pano.initial_yaw_deg));
  check(pano.north_yaw_deg === null || (isNum(pano.north_yaw_deg) && pano.north_yaw_deg >= 0 && pano.north_yaw_deg < 360), 'north_yaw_deg number or null', String(pano.north_yaw_deg));
  const loc = pano.location || {};
  check(isStr(loc.name_ko) && isNum(loc.lat) && isNum(loc.lon), 'location name_ko/lat/lon', `${loc.name_ko} ${loc.lat}, ${loc.lon}`);
  check(isStr(pano.taken), 'taken date', pano.taken);
  // the automatic turn's canyon arc (review R04): [from, to] photo yaws, to may pass 360
  const arc = pano.auto_arc_deg;
  if (arc !== undefined) {
    const okArc = Array.isArray(arc) && arc.length === 2 && arc.every(isNum) && arc[1] > arc[0] && arc[1] - arc[0] < 360;
    const iy = pano.initial_yaw_deg;
    const inArc = okArc && [iy, iy + 360].some((y) => y >= arc[0] && y <= arc[1]);
    check(okArc && inArc, 'auto_arc_deg: [from, to] around the initial view', JSON.stringify(arc));
  } else warn('pano.json has no auto_arc_deg (the photo turns all the way round)');
  checkCredit(pano.credit, 'pano');
}
sec('then / now photos (MEDIA)');
const MD = path.join(GC, 'media');
const media = readJSON(path.join(MD, 'media.json'));
if (media) {
  for (const k of ['then', 'now']) {
    const m = media[k];
    if (!m) { fail(`media.${k} present`); continue; }
    check(Number.isInteger(m.year) && isStr(m.caption_ko), `media.${k}: year (int) and caption_ko`, `${m.year}: ${String(m.caption_ko).slice(0, 30)}…`);
    checkImage(MD, m.file, m.width || null, m.height || null, `media.${k}`);
    checkCredit(m.credit, `media.${k}`);
  }
}
sec('ambient sound (MEDIA)');
const AD = path.join(GC, 'audio');
const audio = readJSON(path.join(AD, 'audio.json'));
if (audio) {
  const a = audio.ambient || {};
  check(plainName(a.file) && fs.existsSync(path.join(AD, a.file)), 'ambient.file exists', a.file);
  check(isNum(a.duration_s) && a.duration_s >= 60 && a.loop === true && isNum(a.lufs), 'duration_s, loop true, lufs', `${a.duration_s} s, ${a.lufs} LUFS`);
  if (plainName(a.file) && fs.existsSync(path.join(AD, a.file))) {
    const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,sample_rate,channels:format=duration', '-of', 'json', path.join(AD, a.file)], { encoding: 'utf8' });
    if (r.status === 0) {
      const j = JSON.parse(r.stdout);
      const st = (j.streams || [])[0] || {};
      const dur = Number(j.format && j.format.duration);
      check(st.codec_name === 'mp3' && Math.abs(dur - a.duration_s) < 0.2, 'ambient decodes as MP3 of that length (ffprobe)', `${st.codec_name} ${st.sample_rate} Hz ${st.channels} ch, ${dur.toFixed(3)} s`);
    } else warn('ffprobe not available; MP3 not probed');
  }
  checkCredit(a.credit, 'ambient');
}
sec('globe (MEDIA)');
const GD = path.join(DATA, 'globe');
const globe = readJSON(path.join(GD, 'globe.json'));
if (globe) {
  checkImage(GD, globe.day && globe.day.file, 4096, 2048, 'globe day');
  checkImage(GD, globe.day && globe.day.mobile, 2048, 1024, 'globe day mobile');
  checkImage(GD, globe.night && globe.night.file, 4096, 2048, 'globe night');
  checkImage(GD, globe.night && globe.night.mobile, 2048, 1024, 'globe night mobile');
  const cr = Array.isArray(globe.credit) ? globe.credit : [];
  check(cr.length >= 2, 'globe.credit lines for day and night', `${cr.length}`);
  cr.forEach((c, i) => checkCredit(c, `globe credit ${i + 1}`));
  // the regional 500 m patch for the descend (review R07, tools/make_globe_region.py)
  const R = globe.region;
  if (R) {
    const box = [R.lat_top_deg, R.lat_bottom_deg, R.lon_left_deg, R.lon_right_deg];
    check(box.every(isNum) && R.lat_top_deg > R.lat_bottom_deg && R.lon_right_deg > R.lon_left_deg && R.lat_bottom_deg < 36.06 && R.lat_top_deg > 36.06 && R.lon_left_deg < -112.1 && R.lon_right_deg > -112.1, 'globe.region: lat/lon box around the place', box.join(', '));
    const s1 = checkImage(GD, R.file, R.width || null, R.height || null, 'globe region');
    const s2 = checkImage(GD, R.mobile, null, null, 'globe region mobile');
    if (s1 && s2) check(s1.bytes < 3 * 1048576 && Math.abs(s1.w / s1.h - s2.w / s2.h) < 0.01, 'globe region: < 3 MB, same aspect for both sizes', `${(s1.bytes / 1024).toFixed(0)} KB, ${s1.w}x${s1.h} / ${s2.w}x${s2.h}`);
  }
}

// ------------------------------------------------------------------ 4. credits files
sec('credits');
const creditRows = [];
for (const f of ['terrain.json', 'media.json']) {
  const arr = readJSON(path.join(DATA, 'credits', f));
  if (!Array.isArray(arr)) { fail(`credits/${f} is an array`); continue; }
  const keys = ['what_ko', 'title', 'author', 'license', 'url', 'attribution'];
  arr.forEach((c, i) => {
    const miss = keys.filter((k) => !isStr(c[k]));
    check(!miss.length, `credits/${f}[${i}] has ${keys.join('/')}`, miss.length ? `missing ${miss.join(', ')}` : c.what_ko);
    checkCredit(c, `credits/${f}[${i}]`);
    creditRows.push(c);
  });
}
// every shipped medium is covered by a credits row (matched by title or url)
const covered = (c) => c && creditRows.some((r) => (c.url && r.url === c.url) || (c.title && r.title === c.title));
if (pano) check(covered(pano.credit), 'credits list the 360 photo');
if (media) { check(covered(media.then && media.then.credit), 'credits list the then photo'); check(covered(media.now && media.now.credit), 'credits list the now photo'); }
if (audio && audio.ambient && audio.ambient.credit) {
  const srcs = audio.ambient.credit.sources || [];
  check(srcs.length ? srcs.every(covered) : covered(audio.ambient.credit), 'credits list every sound source', `${srcs.length} sources`);
}
if (globe) check((globe.credit || []).every(covered), 'credits list the globe textures');
if (globe && globe.region) check(creditRows.some((r) => r.url === globe.region.source_url), 'credits list the regional globe patch');
check(creditRows.some((r) => /elevation|높이|DEM/i.test(r.what_ko + r.title)) && creditRows.some((r) => /imagery|사진|NAIP/i.test(r.what_ko + r.title)), 'credits list terrain height and imagery');

// ------------------------------------------------------------------ 5. places.json
sec('places.json (CONTENT)');
const places = readJSON(path.join(DATA, 'places.json'));
if (places) {
  const arr = Array.isArray(places.places) ? places.places : [];
  check(arr.length === 12, '12 launch places', `${arr.length}`);
  const ready = arr.filter((p) => p.status === 'ready');
  check(ready.length === 1 && ready[0].id === 'grand-canyon', 'only grand-canyon is ready', ready.map((p) => p.id).join(','));
  check(arr.every((p) => ['ready', 'soon'].includes(p.status)), 'status is ready|soon');
  const badLL = arr.filter((p) => !(isNum(p.lat) && isNum(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180));
  check(!badLL.length, 'lat/lon valid', badLL.map((p) => p.id).join(','));
  const badTz = arr.filter((p) => { try { new Intl.DateTimeFormat('en', { timeZone: p.tz }); return false; } catch { return true; } });
  check(!badTz.length, 'IANA time zones resolve', badTz.map((p) => `${p.id}:${p.tz}`).join(','));
  check(arr.every((p) => isStr(p.id) && isStr(p.name_ko)), 'id and name_ko');
  const ids = new Set(arr.map((p) => p.id));
  check(ids.size === arr.length, 'ids unique');
}

// ------------------------------------------------------------------ 6. place.json
sec('place.json (CONTENT)');
const place = readJSON(path.join(GC, 'place.json'));
const len = (s) => [...String(s || '')].length;
if (place) {
  for (const k of ['id', 'name_ko', 'name_en', 'region_ko', 'tz']) check(isStr(place[k]), `place.${k}`, place[k]);
  check(place.id === 'grand-canyon' && isNum(place.lat) && isNum(place.lon), 'id grand-canyon, lat/lon');
  check(Array.isArray(place.names) && place.names.every((n) => isStr(n.lang) && isStr(n.text)), 'names [{lang,text,note_ko}]', `${(place.names || []).length}`);
  // camera
  const cam = place.camera || {};
  for (const k of ['wide_focus', 'approach_target', 'stand', 'daylapse_from']) {
    const p = cam[k];
    if (!p || !isNum(p.lat) || !isNum(p.lon)) { fail(`camera.${k} lat/lon`); continue; }
    const { x, z } = toLocal(p.lat, p.lon);
    check(Math.abs(x) < 9800 && Math.abs(z) < 9800, `camera.${k} inside the 20 km core`, `x ${x.toFixed(0)} m, z ${z.toFixed(0)} m${core ? `, ground ${sample(core, x, z).toFixed(0)} m` : ''}`);
  }
  check(cam.daylapse_from && cam.daylapse_from.look_at && isNum(cam.daylapse_from.look_at.lat), 'camera.daylapse_from.look_at');
  check(isStr(cam.approach_target && cam.approach_target.label_ko) && isStr(cam.stand && cam.stand.name_ko) && isStr(cam.daylapse_from && cam.daylapse_from.label_ko), 'camera labels (approach label_ko, stand name_ko, daylapse label_ko)');
  // scenes
  const want = [['descend', 30], ['wide', 180], ['approach', 180], ['stand', 180], ['daylapse', 180]];
  const sc = Array.isArray(place.scenes) ? place.scenes : [];
  check(sc.length === 5 && want.every(([id, d], i) => sc[i] && sc[i].id === id && sc[i].dur_s === d), 'scenes: descend 30, wide/approach/stand/daylapse 180 in order', sc.map((s) => `${s.id}:${s.dur_s}`).join(' '));
  for (const s of sc) {
    const n = len(s.caption_ko);
    check(isStr(s.title_ko) && n >= 40 && n <= 60, `caption ${s.id}: 40-60 characters`, `${n}`);
  }
  // cards
  const cards = Array.isArray(place.cards) ? place.cards : [];
  check(cards.length === 3, 'exactly 3 cards', `${cards.length}`);
  cards.forEach((c, i) => {
    const n = len(c.body_ko);
    check(isStr(c.title_ko) && n >= 250 && n <= 350, `card ${i + 1}: 250-350 characters`, `${n} — ${c.title_ko}`);
  });
  // narration ~640 characters, ~90 s
  const narr = Array.isArray(place.narration_ko) ? place.narration_ko : [];
  const nChars = narr.reduce((s, x) => s + len(x), 0) + Math.max(0, narr.length - 1);
  check(narr.length >= 5 && nChars >= 540 && nChars <= 740, 'narration ~640 characters (540-740)', `${nChars} characters in ${narr.length} sentences, ~${Math.round(nChars / 7)} s at 7 char/s`);
  // each sentence is shown alone as a caption: one idea, short (review R12)
  const longS = narr.filter((x) => len(x) > 45);
  check(!longS.length, 'narration sentences are short (<= 45 characters each)', longS.length ? longS.map((x) => `${len(x)}: ${x.slice(0, 20)}…`).join(' | ') : `longest ${Math.max(...narr.map(len))}`);
  // deep read
  const deep = Array.isArray(place.deep_ko) ? place.deep_ko : [];
  const dChars = deep.reduce((s, d) => s + len(d.h) + (Array.isArray(d.p) ? d.p.reduce((a, p) => a + len(p), 0) : 0), 0);
  check(deep.length >= 2 && deep.every((d) => isStr(d.h) && Array.isArray(d.p) && d.p.every(isStr)) && dChars >= 1500 && dChars <= 2500, 'deep read 1,500-2,500 characters in [{h,p[]}]', `${dChars} characters in ${deep.length} sections`);
  check(isStr(place.scale_ko), 'scale_ko', place.scale_ko && place.scale_ko.slice(0, 40) + '…');
  // facts and sources
  const facts = Array.isArray(place.facts) ? place.facts : [];
  const sources = Array.isArray(place.sources) ? place.sources : [];
  const sid = new Set(sources.map((s) => s.id));
  const fid = new Set(facts.map((f) => f.id));
  check(facts.length > 0 && facts.every((f) => isStr(f.id) && isStr(f.ko) && sid.has(f.source) && isStr(f.quote)), 'facts: id/ko/source/quote, every source exists', `${facts.length} facts`);
  check(sources.length > 0 && sources.every((s) => isStr(s.id) && isStr(s.title) && isStr(s.publisher) && /^https?:\/\//.test(s.url) && isStr(s.accessed)), 'sources: id/title/publisher/url/accessed', `${sources.length} sources`);
  const refs = [...cards.flatMap((c) => c.fact_ids || []), ...(place.narration_fact_ids || []), ...(place.scale_fact_ids || []), ...deep.flatMap((d) => d.fact_ids || [])];
  const missing = refs.filter((r) => !fid.has(r));
  check(!missing.length, 'every referenced fact id exists', missing.join(',') || `${new Set(refs).size} ids referenced`);
  check(cards.every((c) => Array.isArray(c.fact_ids) && c.fact_ids.length > 0), 'every card cites facts');
  const badSrc = sources.filter((s) => HOST_BAD.test(s.url));
  if (badSrc.length) warn('sources on Google/Esri/Mapbox hosts (text citations only)', badSrc.map((s) => s.url).join(' '));
  // the deep read shows fact quotes; a Korean quote must not be marked lang=en (app checks the script)
  const koQuotes = facts.filter((f) => /[가-힣]/.test(f.quote || '')).map((f) => f.id);
  if (koQuotes.length) pass('Korean-language quotes (shown with lang=ko)', koQuotes.join(','));
  // pano location vs camera.stand
  if (pano && pano.location && cam.stand) {
    const a = toLocal(pano.location.lat, pano.location.lon), b = toLocal(cam.stand.lat, cam.stand.lon);
    const d = Math.hypot(a.x - b.x, a.z - b.z);
    check(d < 200, 'pano location = camera.stand (within 200 m)', `${d.toFixed(0)} m apart`);
  }
}

// ------------------------------------------------------------------ 7. site code rules (Artifact)
sec('site code (Artifact rules)');
const codeFiles = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (e.name !== 'data') walk(p); } else if (/\.(html|js|mjs|css)$/.test(e.name)) codeFiles.push(p);
  }
})(SITE);
const runtime = codeFiles.filter((p) => !/\/test\//.test(p));
const hostHits = [];
const dialogHits = [];
const iframeHits = [];
const absData = [];
for (const p of runtime) {
  const src = fs.readFileSync(p, 'utf8');
  // strip comments in JS/CSS so prose does not count
  const code = /\.(js|mjs|css)$/.test(p) ? src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1') : src.replace(/<!--[\s\S]*?-->/g, '');
  for (const m of code.matchAll(/https?:\/\/[^\s'"`)<>]+/g)) {
    const u = m[0];
    const allowed = /^https:\/\/cdn\.jsdelivr\.net\/npm\/three@0\.170\.0\//.test(u) || /^https:\/\/fonts\.(googleapis|gstatic)\.com(\/|$)/.test(u);
    // links the viewer may click (credits/licences) are text, not runtime loads: only flag loads
    const isLoad = /(src|href)=["']?$/.test(code.slice(Math.max(0, m.index - 6), m.index)) || /import|fetch\(|url\(|"imports"|modulepreload/.test(code.slice(Math.max(0, m.index - 60), m.index));
    if (!allowed && isLoad) hostHits.push(`${path.relative(SITE, p)}: ${u}`);
  }
  if (/\b(alert|confirm|prompt)\s*\(/.test(code.replace(/\.prompt|promptly/g, ''))) dialogHits.push(path.relative(SITE, p));
  if (/<iframe|createElement\(['"]iframe/i.test(code)) iframeHits.push(path.relative(SITE, p));
  if (/fetch\(\s*['"`]\/(?!\/)/.test(code) || /['"`]\/data\//.test(code)) absData.push(path.relative(SITE, p));
}
check(!hostHits.length, 'runtime loads only from jsDelivr three@0.170.0 and Google Fonts', hostHits.join(' | ') || `${runtime.length} files`);
check(!dialogHits.length, 'no alert/confirm/prompt', dialogHits.join(', '));
check(!iframeHits.length, 'no iframes', iframeHits.join(', '));
check(!absData.length, 'data loaded with relative URLs', absData.join(', '));
const idx = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
check(/"three":\s*"https:\/\/cdn\.jsdelivr\.net\/npm\/three@0\.170\.0\/build\/three\.module\.js"/.test(idx), 'import map points three at jsDelivr three@0.170.0');

// ------------------------------------------------------------------ report
const fails = results.filter((r) => r.level === 'fail');
if (asJson) {
  console.log(JSON.stringify({ ok: !fails.length, fails: fails.length, results }, null, 1));
} else {
  let cur = '';
  for (const r of results) {
    if (r.section !== cur) { cur = r.section; console.log(`\n== ${cur}`); }
    const tag = r.level === 'fail' ? 'FAIL' : r.level === 'warn' ? 'warn' : 'ok  ';
    console.log(`${tag} ${r.what}${r.detail ? '  — ' + r.detail : ''}`);
  }
  console.log(`\n${results.length} checks, ${fails.length} failed, ${results.filter((r) => r.level === 'warn').length} warnings`);
}
process.exit(fails.length ? 1 : 0);
