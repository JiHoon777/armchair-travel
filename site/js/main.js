// 지금 거기 — prototype (Grand Canyon). Boot, clocks, data, rendering and the main loop.
import * as THREE from 'three';
import {
  GLOBE, DESCEND, ASCEND, SCENE_DUR, TOUR_SCENES, DPR_CAP, MOBILE_MAX_W, LOOK_RESUME_S,
  REDUCED_DISSOLVE_S, CAMERA, WIDE, STAND,
} from './config.js';
import { clamp, smoothstep, lerp, DEG, RAD } from './util.js';
import { sunPosition, describeSun, fmtLocalTime, nextSunrise, sunTimesLocal, sunriseLabel } from './sun.js';
import { pose as pathPose, makePathContext, withGlobeStart, globeTurnPlan, globeTurnAt, makeDaylapseClock, stillTime, standArc } from './paths.js';
import { Terrain } from './terrain.js';
import { SkySystem } from './sky.js';
import { Globe } from './globe.js';
import { Pano } from './pano.js';
import { Look } from './look.js';
import { Sequencer } from './sequencer.js';
import { UI } from './ui.js';
import { AudioEngine } from './audio.js';
import { Narrator } from './narration.js';
import { CloudOverlay } from './clouds.js';
import { DATA, fetchJSON, normalizePlace, normalizePlaces, loadCredits } from './data.js';

// ------------------------------------------------------------------ environment and URL params
const qs = new URLSearchParams(location.search);
const P = {
  scene: qs.get('scene'),
  t: Number(qs.get('t')) || 0,
  time: qs.get('time'),
  still: qs.get('still') === '1',
  lowres: qs.get('lowres') === '1',
  nogui: qs.get('nogui') === '1',
  autoplay: qs.get('autoplay') === '1',
  reduced: qs.get('reduced') === '1',
  open: qs.get('open'),   // debug: cards | deep | credits
  speed: clamp(Number(qs.get('speed')) || 1, 0.1, 60), // debug: scene time runs this many times faster
  debug: qs.get('debug'), // debug: 'crack' = magenta background, no sky (tools/check_cracks.mjs)
  lite: qs.get('lite') === '1', // debug: behave as with data saver on
  paused: qs.get('paused') === '1', // debug: start the debug jump paused (cards open)
  disposeMs: clamp(Number(qs.get('disposems')) || 60000, 500, 600000), // debug: free the terrain sooner at home
};
// Load-time marks for tools/measure_timing.mjs (performance.getEntriesByName).
const marked = new Set();
function mark(name) {
  if (marked.has(name)) return;
  marked.add(name);
  try { performance.mark('armchair:' + name); } catch { /* old browsers */ }
}
const MOBILE = P.lowres || matchMedia('(pointer: coarse)').matches || innerWidth < MOBILE_MAX_W;
const REDUCED = P.reduced || matchMedia('(prefers-reduced-motion: reduce)').matches;
// Data saver or a slow connection: the small texture set everywhere (comfort rule 10)
const CONN = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
const SAVE_DATA = P.lite || !!(CONN && (CONN.saveData || /2g|3g/.test(CONN.effectiveType || '')));
const TEX_SMALL = MOBILE || SAVE_DATA;
// 360 photo: phones with sharp screens get the 4k file (the 2k one looks soft at 2-3x)
const PANO_SMALL = SAVE_DATA || P.lowres || (MOBILE && (devicePixelRatio || 1) < 2);
const PLACE_ID = 'grand-canyon';

const clock = {
  base: P.time && Number.isFinite(Date.parse(P.time)) ? Date.parse(P.time) : Date.now(),
  perf0: performance.now(),
};
const nowMs = () => (P.still ? clock.base : clock.base + (performance.now() - clock.perf0));

// ------------------------------------------------------------------ renderer
const canvas = document.getElementById('gl');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: !(MOBILE && devicePixelRatio > 1.5), powerPreference: 'high-performance', alpha: false });
} catch (e) {
  window.__armchairBooted = true; // the message below replaces the boot screen's own
  document.getElementById('boot').innerHTML = '<p style="max-width:28em;padding:16px;text-align:center">이 브라우저에서는 3D 화면을 열 수 없습니다. WebGL 2를 지원하는 최신 브라우저에서 열어 주세요.</p>';
  throw e;
}
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, P.lowres ? 1 : MOBILE ? DPR_CAP.mobile : DPR_CAP.desktop));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.45;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const globe = new Globe(renderer);
const world = new THREE.Scene();
world.background = new THREE.Color(0x0b1026);
const terrain = new Terrain(renderer, { mobile: MOBILE, smallTextures: TEX_SMALL });
world.add(terrain.group);
const sky = new SkySystem(world, renderer, terrain.uniforms);
const worldCam = new THREE.PerspectiveCamera(CAMERA.FOV, 1, 10, CAMERA.FAR);
worldCam.rotation.order = 'YXZ';
const pano = new Pano();
const clouds = new CloudOverlay();

// ------------------------------------------------------------------ app state
let W = Math.max(1, innerWidth), H = Math.max(1, innerHeight), aspect = W / H;
// landscape screens orbit flatter so the sky shows above the far rim (config WIDE)
const widePitchFor = (a) => (a >= 1.15 ? WIDE.PITCH_LANDSCAPE_DEG : WIDE.PITCH_DEG);
let place = normalizePlace(null);
let places = normalizePlaces(null);
let pathCtx = makePathContext({ place, widePitch: widePitchFor(aspect) });
let mediaMeta = null, audioMeta = null;
const home = { lat: GLOBE.HOME_LAT, lon: place.lon + GLOBE.HOME_LON_OFFSET - 4, dist: GLOBE.HOME_DIST, fitDist: GLOBE.HOME_DIST };
let turning = null;            // globe turning toward the place before the descend
let startMode = 'once';
// timeMode 'sunrise': night at the place, shown at the next sunrise; choseReal: the viewer asked for
// the real night once, so later loops keep it without asking again
const tour = { timeMode: 'real', clockBase: 0, realBase: 0, choseReal: false };
let dlClock = null, dlEnd = 0;
let panoAuto = 0, lastPanoPathYaw = 0;
let holdSince = 0;
let homeDwell = -1;
// After the ascend the globe is centred at GLOBE.HOME_DIST; the home view sits off-centre (next to
// the panel) at the layout's own distance. Settle into it over a few seconds instead of jumping.
let homeSettle = null;
const HOME_SETTLE_S = 4;
let firstFrame = false;
let terrainReadyHandled = false;
let disposeTerrainAt = 0;
let userMuted = false;         // the viewer turned the sound off: later start clicks keep it off
const poseOut = {}, daylapseEnd = {};
const poseOpts = { from: daylapseEnd, arc: null, standPitch: undefined };
const uiTour = { inTour: true, paused: false }, uiHome = { inTour: false, paused: false };
const turnLL = {};
const viewOff = { fullW: 1, fullH: 1, x: 0, y: 0, w: 1, h: 1 };

const audio = new AudioEngine({ light: MOBILE });
const narrator = new Narrator({
  onStart: (withVoice) => {
    ui.setNarrating(true, withVoice);
    audio.duck(true);
    if (!withVoice) ui.toast('이 기기에는 한국어 음성이 없어 글로 보여 드립니다.', { seconds: 6 });
  },
  onMode: (withVoice) => {
    ui.setNarrating(true, withVoice);
    if (!withVoice) ui.toast('이 기기에서는 음성이 나오지 않아 글로 보여 드립니다.', { seconds: 6 });
  },
  onSentence: (text, i, n, withVoice) => ui.setCaption(text, `${withVoice ? '기기 음성 · 시험용' : '글로 보기'} · ${i + 1}/${n}`, { hold: true }),
  onEnd: () => { ui.setNarrating(false); audio.duck(false); ui.releaseCaption(); },
});

const seq = new Sequencer({
  durations: { ...SCENE_DUR, ...pathCtx.dur, ...(REDUCED ? { descend: 6, ascend: 6 } : {}) },
  onScene: onSceneEnter,
  onHome: onTourEnd,
});

const ui = new UI({
  onStart: (kind) => requestStart(kind),
  onTogglePause: () => togglePause(),
  onToggleSound: () => toggleSound(),
  onNext: () => { seq.next(); },
  onPrev: () => { seq.prev(); },
  onJump: (id) => { if (seq.scene !== id) seq.jumpTo(id, 0); },
  onListen: () => toggleNarration(),
  onHome: () => exitToHome(),
  onFullscreen: () => toggleFullscreen(),
  inTour: () => seq.state === 'tour',
});
ui.setNoGui(P.nogui);
ui.setPlace(place);
ui.buildDots(TOUR_SCENES);
ui.setSound(false);
audio.onState = () => syncSound();

const look = new Look(canvas, {
  onInteract: () => ui.poke(),
  onTap: () => { ui.poke(); if (seq.state === 'tour') ui.showCaption(); },
});

// ------------------------------------------------------------------ data
const loadFlags = { globe: false, terrainTextures: false };
const terrainPromise = terrain.load(DATA.terrain(PLACE_ID)).catch((e) => { console.warn('[terrain]', e); return false; });
terrainPromise.then(() => (terrain.texturesDone || Promise.resolve()).then(() => { loadFlags.terrainTextures = true; }));
const placePromise = fetchJSON(DATA.place(PLACE_ID)).then((p) => {
  if (p) {
    place = normalizePlace(p);
    ui.setPlace(place);
    seq.setDurations(REDUCED ? { ...pathCtx.dur, descend: 6, ascend: 6 } : {});
    rebuildPaths();
    if (seq.state === 'home' && !turning) home.lon = place.lon + GLOBE.HOME_LON_OFFSET - 4;
  }
  return place;
});
fetchJSON(DATA.places).then((list) => {
  places = normalizePlaces(list);
  ui.buildPins(places, (p) => requestStart('pin', p));
  refreshSunList(true);
});
ui.buildPins(places, (p) => requestStart('pin', p));
globe.load(DATA.globe, TEX_SMALL).finally(() => { loadFlags.globe = true; refreshCredits(); });
const panoMetaPromise = pano.loadMeta(DATA.pano(PLACE_ID));
fetchJSON(DATA.media(PLACE_ID) + 'media.json', { quiet: true }).then((m) => {
  mediaMeta = m;
  if (m) ui.setMedia(m, DATA.media(PLACE_ID));
  refreshCredits();
});
fetchJSON(DATA.audio(PLACE_ID) + 'audio.json', { quiet: true }).then((a) => { audioMeta = a && a.ambient; refreshCredits(); });
Promise.all([placePromise, panoMetaPromise]).then(refreshCredits);

async function refreshCredits() {
  try {
    ui.setCredits(await loadCredits({ place, pano: pano.meta, media: mediaMeta, audio: audioMeta, globe: globe.credit }));
  } catch (e) { console.warn('[credits]', e); }
}

// Paths are rebuilt when the place file or the real terrain arrives, and when the screen turns
// between landscape and portrait. Never under a running scene: during the descend (its terrain
// part does not use the terrain data, and the orbit starts where it ends either way) or at a cut
// (a scene that starts from dark, a jump); otherwise it waits for the next cut or the next start.
let pendingRebuild = false;
function rebuildPaths(force = false) {
  if (!force && seq.state === 'tour' && seq.scene !== 'descend') { pendingRebuild = true; return; }
  pendingRebuild = false;
  const gs = { lat: home.lat, lon: home.lon, dist: home.dist };
  // the descend's terrain part shows the orbit's pitch: keep it once that part is on screen
  const keepPitch = !force && seq.state === 'tour' && seq.scene === 'descend' && seq.t >= DESCEND.GLOBE_END_S;
  const widePitch = keepPitch ? pathCtx.widePitch : widePitchFor(aspect);
  pathCtx = makePathContext({ place, heightAt: terrain.ready ? terrain.heightAt : null, globeStart: gs, widePitch });
  seq.setDurations(REDUCED ? { ...pathCtx.dur, descend: 6, ascend: 6 } : pathCtx.dur);
}

// ------------------------------------------------------------------ time at the place
function tourClock() {
  return tour.timeMode === 'sunrise' ? tour.clockBase + (nowMs() - tour.realBase) : nowMs();
}
function sceneClock() {
  if (seq.state !== 'tour') return nowMs();
  if (seq.scene === 'daylapse' && dlClock) return dlClock(seq.t);
  if (seq.scene === 'ascend' && dlClock) return dlEnd;
  return tourClock();
}
function josa(word, withFinal, without) {
  const ch = word.charCodeAt(word.length - 1);
  if (ch < 0xac00 || ch > 0xd7a3) return withFinal;
  return (ch - 0xac00) % 28 ? withFinal : without;
}
function decideTimeMode() {
  const now = nowMs();
  const sp = sunPosition(now, place.lat, place.lon);
  if (sp.elevation < -4 && !tour.choseReal) {
    const sr = nextSunrise(now, place.lat, place.lon, place.tz);
    if (Number.isFinite(sr)) {
      tour.timeMode = 'sunrise';
      tour.clockBase = sr + 20 * 60000;
      tour.realBase = now;
      const nm = place.name_ko;
      ui.toast(`지금 ${nm}${josa(nm, '은', '는')} 밤 ${fmtLocalTime(now, place.tz)}입니다. 해 뜰 무렵으로 보여 드립니다.`, {
        action: '지금 그대로 보기', seconds: 14,
        onAction: () => { tour.timeMode = 'real'; tour.choseReal = true; },
      });
      return;
    }
  }
  tour.timeMode = 'real';
}
// "2018년 8월 오후 3시 사진" from pano.json taken / taken_local_time
function photoTimeLabel(meta) {
  const m = String(meta.taken || '').match(/^(\d{4})-(\d{2})/);
  const h = String(meta.taken_local_time || '').match(/^(\d{1,2}):/);
  if (!m) return '사진';
  let when = '';
  if (h) {
    const hr = Number(h[1]);
    when = hr === 12 ? ' 낮 12시' : hr < 12 ? ` 오전 ${hr}시` : ` 오후 ${hr - 12}시`;
  }
  return `${m[1]}년 ${Number(m[2])}월${when} 사진`;
}

// ------------------------------------------------------------------ starting / stopping
function requestStart(kind) {
  if (seq.state === 'tour' || turning) return;
  if (kind !== 'auto') {
    // every start click turns the ambient sound on, quietly (the survey: sound is what made the
    // difference); a viewer who muted it keeps it muted
    audio.unlock();
    if (kind === 'enter') userMuted = false; // 들어가기 always brings the sound (plan rule 6)
    if (!userMuted) {
      const was = audio.enabled;
      setSound(true);
      if (!was) ui.toast('소리가 작게 납니다. 소리 버튼이나 M으로 끌 수 있습니다.', { seconds: 4 });
    }
  }
  audio.load(DATA.audio(PLACE_ID));
  if (kind === 'enter') toggleFullscreen(true);
  startMode = kind === 'loop' || kind === 'auto' ? 'loop' : 'once';
  disposeTerrainAt = 0;
  ensureTerrain();
  const plan = globeTurnPlan(home.lat, home.lon, place.lon);
  turning = { plan, t: 0, dur: REDUCED ? 0 : plan.dur };
  ui.setMode('turning');
  document.body.classList.remove('is-home');
}

function beginDescend(sceneId = 'descend', t = 0) {
  turning = null;
  homeSettle = null;
  if (pendingRebuild) rebuildPaths();
  pathCtx = withGlobeStart(pathCtx, { lat: home.lat, lon: home.lon, dist: home.dist });
  audio.setPaused(false);
  decideTimeMode();
  look.reset();
  seq.start(startMode, sceneId, t);
  ui.setMode('tour');
  updateWakeLock();
}

function onTourEnd() {
  narrator.stop();
  dlClock = null;
  look.reset();
  look.enabled = false;
  pano.dispose();
  home.lat = GLOBE.HOME_LAT;
  home.lon = place.lon + GLOBE.HOME_LON_OFFSET;
  home.dist = GLOBE.HOME_DIST; // where the ascend ends
  homeSettle = REDUCED ? null : { t: 0, from: Math.log(GLOBE.HOME_DIST) };
  if (startMode === 'loop') {
    homeDwell = REDUCED ? 8 : 6;
    ui.setMode('turning');
  } else {
    ui.setMode('home');
    audio.setPaused(true);
    disposeTerrainAt = performance.now() + P.disposeMs;
  }
  updateWakeLock();
}

function exitToHome() {
  if (seq.state !== 'tour') return;
  startMode = 'once';
  seq.stop();
}

// The terrain is freed 60 s after a single tour ends; a new start loads it again. A terrain that
// was the procedural fallback tries the real data again (a 404 falls back at once; a slow network
// gets the same 14 s grace as the first time).
function ensureTerrain() {
  if (!terrain.ready && !terrain._reloading && terrain.disposedOnce) {
    if (terrain.source === 'procedural') terrain.source = 'none';
    terrain._reloading = true;
    terrain.load(DATA.terrain(PLACE_ID)).finally(() => { terrain._reloading = false; });
  }
}

// The 360 photo's automatic turn stays inside its canyon arc for this screen's field of view.
function updateStandOpts() {
  const meta = pano.meta;
  const vf = fovFor(STAND.FOV);
  const hf = 2 * Math.atan(Math.tan((vf / 2) * DEG) * aspect) * RAD;
  poseOpts.arc = meta ? standArc(meta.auto_arc_deg, meta.initial_yaw_deg, hf) : null;
  poseOpts.standPitch = aspect < 1 ? STAND.PITCH_PORTRAIT_DEG : undefined;
}

function onSceneEnter(id, prev) {
  // a cut: the scene starts from dark (the photo, the day-lapse) or a jump faded out
  const cut = id === 'stand' || id === 'daylapse' || !!(seq.jump && seq.jump.phase === 'out');
  if (cut) {
    if (pendingRebuild) rebuildPaths(true);
    look.reset(); // continuous boundaries keep the look offset and its return
  }
  ui.setScene(id);
  const sc = place.scenes.find((s) => s.id === id);
  let sub = '';
  if (id === 'approach') sub = (place.camera && place.camera.approach_target && place.camera.approach_target.label_ko) || '';
  if (id === 'stand') {
    const st = (pano.meta && pano.meta.location && pano.meta.location.name_ko) || (place.camera && place.camera.stand && place.camera.stand.name_ko) || '';
    const cr = pano.meta && pano.meta.credit;
    const lic = cr && cr.license ? String(cr.license).split(/[;(]/)[0].trim() : '';
    sub = [st, cr ? `사진 ${[cr.author, lic].filter(Boolean).join(' · ')}` : ''].filter(Boolean).join(' · ');
    updateStandOpts();
  }
  if (id === 'daylapse') {
    const from = (place.camera && place.camera.daylapse_from && place.camera.daylapse_from.label_ko) || '';
    sub = [from ? `${from}에서` : '', '해 뜨기 전부터 해 진 뒤까지'].filter(Boolean).join(' · ');
    const st = sunTimesLocal(tourClock(), place.lat, place.lon, place.tz);
    if (Number.isFinite(st.sunrise) && Number.isFinite(st.civilDusk)) {
      dlClock = makeDaylapseClock(st.sunrise, st.civilDusk, place.lat, place.lon, seq.dur_('daylapse'));
      dlEnd = dlClock(seq.dur_('daylapse'));
    } else dlClock = null;
  }
  if (id === 'ascend') {
    pathPose('daylapse', seq.dur_('daylapse'), pathCtx, daylapseEnd);
    ui.hideCaption();
  } else if (sc && sc.caption_ko) ui.setCaption(sc.caption_ko, sub);
  // the 360 photo: load before it is needed, free it after
  if (id === 'approach' || id === 'stand') pano.load(DATA.pano(PLACE_ID), PANO_SMALL);
  if (prev === 'stand' && id !== 'stand') pano.dispose();
  if (id === 'stand') { panoAuto = 0; lastPanoPathYaw = 0; }
  holdSince = 0;
  updateWakeLock();
}

seq.hold = (scene, nt) => {
  const swapT = REDUCED ? 3 : DESCEND.GLOBE_END_S;
  let waiting = false;
  if (scene === 'descend' && nt >= swapT && !terrain.ready) waiting = 'terrain';
  if (scene === 'stand' && !pano.ready && !pano.failed && nt > 0.05) waiting = 'pano';
  if (!waiting) { if (holdSince) { holdSince = 0; ui.setLoading(false); } return false; }
  if (!holdSince) holdSince = performance.now();
  const waited = (performance.now() - holdSince) / 1000;
  ui.setLoading(waited > 0.8, waiting === 'terrain' ? '지형을 불러오는 중…' : '360 사진을 불러오는 중…');
  if (waiting === 'terrain' && waited > 14) { terrain.useProcedural(); return false; }
  if (waiting === 'pano' && waited > 10) { pano.failed = true; return false; }
  return true;
};

// ------------------------------------------------------------------ controls
function togglePause() {
  if (seq.state !== 'tour') return;
  const p = seq.toggle();
  ui.setPaused(p);
  audio.setPaused(p);
  // the story opens beside the paused view; the focus stays put so the next Space resumes
  if (p) { ui.openCards({ focus: false }); if (narrator.playing) narrator.pause(); }
  else if (narrator.playing) narrator.resume();
  updateWakeLock();
}
// on: the viewer wants sound. unlock() runs every time: it is the one place (inside a click) that
// can wake a context the browser suspended.
function setSound(on, { user = false } = {}) {
  if (on) { audio.unlock(); audio.load(DATA.audio(PLACE_ID)); }
  audio.setEnabled(on);
  if (user) userMuted = !on;
  syncSound();
}
function syncSound() {
  const blocked = audio.enabled && !!audio.ctx && audio.ctx.state !== 'running' && document.visibilityState === 'visible';
  ui.setSound(audio.enabled, blocked);
}
function toggleSound() { setSound(!(audio.enabled && audio.running), { user: true }); }
function toggleNarration() {
  if (narrator.playing) { narrator.stop(); return; }
  const lines = place.narration_ko && place.narration_ko.length ? place.narration_ko : ['이곳의 해설 글이 아직 들어오지 않았습니다.'];
  narrator.play(lines);
}
function toggleFullscreen(onlyEnter = false) {
  const d = document;
  if (d.fullscreenElement || d.webkitFullscreenElement) {
    if (onlyEnter) return;
    const ex = d.exitFullscreen || d.webkitExitFullscreen;
    try { const r = ex && ex.call(d); if (r && r.catch) r.catch(() => {}); } catch { /* ignore */ }
    return;
  }
  const el = d.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!req) return;
  try { const r = req.call(el); if (r && r.catch) r.catch(() => {}); } catch { /* not allowed here */ }
}

let wakeLock = null, wakeBusy = false;
async function updateWakeLock() {
  const want = seq.state === 'tour' && !seq.paused && document.visibilityState === 'visible';
  if (wakeBusy) return;
  wakeBusy = true;
  try {
    if (want && !wakeLock && navigator.wakeLock && navigator.wakeLock.request) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!want && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch { wakeLock = null; } finally { wakeBusy = false; }
}
// Tab hidden: hold the tour, the narration and the sound; back: restore exactly what was running.
let pausedByHide = false, narrPausedByHide = false;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    if (seq.state === 'tour' && !seq.paused) { seq.pause(); pausedByHide = true; }
    if (narrator.playing && !narrator.paused) { narrator.pause(); narrPausedByHide = true; }
    audio.suspend();
  } else {
    if (pausedByHide) { seq.resume(); pausedByHide = false; }
    if (narrPausedByHide) { narrator.resume(); narrPausedByHide = false; }
    // a refused resume (iOS) leaves the context suspended: the sound button then shows it
    audio.resume().then(syncSound);
    setTimeout(syncSound, 800);
    updateWakeLock();
  }
});

// ------------------------------------------------------------------ layout
function onResize() {
  const wasPitch = widePitchFor(aspect);
  W = Math.max(1, innerWidth); H = Math.max(1, innerHeight);
  aspect = W / H;
  renderer.setSize(W, H, false);
  layoutHome();
  if (widePitchFor(aspect) !== wasPitch) rebuildPaths(); // waits for a cut while touring
}
// Free area for the home globe (left of the panel on wide screens, above it on phones).
const homeArea = { cx: 0.5, cy: 0.5, size: 1 };
function layoutHome() {
  const panel = document.querySelector('.panel');
  const brand = document.querySelector('.brand');
  let x0 = 0, x1 = W, y0 = 0, y1 = H;
  if (panel && !P.nogui) {
    const r = panel.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return; // home UI hidden: keep the last layout
    const wide = r.width < W * 0.6;
    if (wide) x1 = Math.max(W * 0.45, r.left - 16);
    else y1 = Math.max(H * 0.4, r.top - 8);
    if (brand && !wide) y0 = Math.min(H * 0.3, brand.getBoundingClientRect().bottom);
  }
  const fw = x1 - x0, fh = y1 - y0;
  homeArea.cx = (x0 + x1) / 2; homeArea.cy = (y0 + y1) / 2;
  homeArea.size = Math.min(fw, fh) * 0.86;
  // camera distance so the globe's diameter fits the free area
  const q = (homeArea.size / 2) / (H / 2) * Math.tan((GLOBE.FOV / 2) * DEG);
  home.fitDist = clamp(Math.sqrt(1 + 1 / (q * q)), 2.2, 9);
}
addEventListener('resize', onResize);
onResize();
// the panel grows when the place list arrives: keep the globe in the free area
if (typeof ResizeObserver !== 'undefined') {
  const ro = new ResizeObserver(() => layoutHome());
  const pnl = document.querySelector('.panel');
  if (pnl) ro.observe(pnl);
}

function fovFor(vfov) {
  if (aspect >= 1.15) return vfov;
  const hf = 2 * Math.atan(Math.tan((vfov / 2) * DEG) * 1.15);
  return Math.min(80, 2 * Math.atan(Math.tan(hf / 2) / aspect) * RAD);
}

// ------------------------------------------------------------------ home panel
// The place that can be watched now comes first; below it at most three of the coming places whose
// sunrise is now (within an hour) or next, each labelled by its sunrise time.
let sunListAt = 0;
function refreshSunList(force) {
  const t = performance.now();
  if (!force && t - sunListAt < 10000) return;
  sunListAt = t;
  const now = nowMs();
  const all = places.map((p) => ({ place: p, desc: describeSun(now, p.lat, p.lon, p.tz) }));
  const ready = all.filter((r) => r.place.status === 'ready');
  const soon = all.filter((r) => r.place.status !== 'ready');
  const HOUR = 3600000;
  const nowRows = soon.filter((r) => Number.isFinite(r.desc.nearSunrise) && Math.abs(r.desc.nearSunrise - now) <= HOUR)
    .sort((a, b) => Math.abs(a.desc.nearSunrise - now) - Math.abs(b.desc.nearSunrise - now))
    .map((r) => ({ ...r, sun: sunriseLabel(now, r.desc.nearSunrise, r.place.tz) }));
  const nextRows = soon.filter((r) => !nowRows.some((x) => x.place === r.place) && Number.isFinite(r.desc.nextSunrise))
    .sort((a, b) => a.desc.nextSunrise - b.desc.nextSunrise)
    .map((r) => ({ ...r, sun: sunriseLabel(now, r.desc.nextSunrise, r.place.tz) }));
  const rows = [...nowRows, ...nextRows].slice(0, 3);
  ui.renderHome({ ready, rows, title: nowRows.length ? '지금 해 뜨는 곳' : '곧 해 뜨는 곳', soon: soon.length }, (p) => requestStart('pin', p));
}

// ------------------------------------------------------------------ frame
const debug = (window.__armchair = {
  state: 'home', scene: null, t: 0, fps: 0, frames: 0,
  camera: { space: 'globe', x: 0, y: 0, z: 0, heading: 0, pitch: 0, fov: 0 },
  terrain: terrain.info, ready: { terrain: false, pano: false, globe: false },
  params: P, mobile: MOBILE, reducedMotion: REDUCED, saveData: SAVE_DATA, errors: window.__armchairErrors || [],
  paths: () => ({ notes: pathCtx.notes, widePitch: pathCtx.widePitch, hasTerrain: pathCtx.hasTerrain, pending: pendingRebuild, wide: pathCtx.wide && { w: pathCtx.wide.w, a0: pathCtx.wide.a0, a1: pathCtx.wide.a1 }, approachEnd: pathCtx.approach && pathCtx.approach.end, standArc: poseOpts.arc }),
  sun: { elevation: 0, azimuth: 0, clock: 0 }, timeMode: () => tour.timeMode,
  audio: () => ({ enabled: audio.enabled, state: audio.ctx ? audio.ctx.state : 'none', seconds: audio.buffer ? Math.round(audio.buffer.duration) : 0, channels: audio.buffer ? audio.buffer.numberOfChannels : 0, rate: audio.buffer ? audio.buffer.sampleRate : 0, mb: audio.buffer ? Math.round(audio.buffer.length * audio.buffer.numberOfChannels * 4 / 1048576 * 10) / 10 : 0, decodes: audio.decodes, sameBuffer: !!(audio.source && audio.source.buffer === audio.buffer), fallback: audio.fallback, level: Math.round(audio.level * 100) / 100, userMuted }),
  narration: () => ({ playing: narrator.playing, paused: narrator.paused, withVoice: narrator.withVoice, voice: narrator.voice ? narrator.voice.name : null, caption: document.getElementById('caption-text').textContent }),
  paused: () => seq.paused,
  look: () => ({ yaw: Math.round(look.yaw * 10) / 10, pitch: Math.round(look.pitch * 10) / 10, fov: Math.round(look.fov * 10) / 10, holding: look.holding, idle: Math.round(look.idleFor * 10) / 10, pointers: look.pointers.size, enabled: look.enabled, returnT: look.returning ? Math.round(look.returning.T * 10) / 10 : 0, snap: !!look.snap, fade: Math.round(look.fade * 100) / 100 }),
  // for screenshot tools: true once everything the current view needs has arrived
  readyForShot: () => {
    const st = debug.state;
    const texWanted = terrain.info.texturesWanted;
    const texOk = terrain.source === 'procedural' || (terrain.ready && loadFlags.terrainTextures && terrain.info.textures >= texWanted && terrain.shadowsReady());
    const globeOk = loadFlags.globe;
    let ready = false;
    if (!firstFrame) ready = false;
    else if (P.scene && st !== 'tour') ready = false; // debug jump still preparing
    else if (st === 'home') ready = globeOk;
    else if (st === 'tour') {
      const sc = seq.scene;
      const needTerrain = !(sc === 'stand' && pano.ready);
      ready = (!needTerrain || texOk) && (sc !== 'stand' || pano.ready || pano.failed) && !holdSince && globeOk;
    }
    return { ready, state: st, scene: seq.scene, t: seq.t, frames: debug.frames, terrain: `${terrain.source}:${terrain.info.textures}/${texWanted}`, pano: pano.ready ? 'ready' : pano.failed ? 'failed' : 'none', globe: globe.source };
  },
  localTime: () => fmtLocalTime(debug.sun.clock || nowMs(), place.tz),
  // look-around trace per app frame (tools/check_fixes.mjs): [time ms, yaw, pitch, fov, fade]
  traceLook: (on) => { debug._trace = on ? [] : null; return true; },
  lookTrace: () => debug._trace || [],
  viewOffsetX: () => (globe.camera.view && globe.camera.view.enabled ? Math.round(globe.camera.view.offsetX * 10) / 10 : 0),
  suspendAudio: () => (audio.ctx ? audio.ctx.suspend().then(() => audio.ctx.state) : Promise.resolve('none')),
  terrainState: () => ({ source: terrain.source, ready: terrain.ready, textures: terrain.info.textures, wanted: terrain.info.texturesWanted, shadowRenders: terrain.info.shadowRenders, hasCore: !!terrain.core, outerTexture: !!terrain.outerTexture, patch: !!globe.patch, patchTexOk: !globe.patch || globe.patchTexture === terrain.outerTexture, region: !!globe.region }),
  // calibration hook (tools): imagery grade, day sky light, haze sample height
  tune: ({ grade, ambDay, hazeElev, debake, steep, sunDay, bounce, edge } = {}) => {
    if (Array.isArray(edge)) terrain.uniforms.uEdge.value.set(edge[0], edge[1]);
    if (Number.isFinite(sunDay)) sky.sunDay = sunDay;
    if (Number.isFinite(bounce)) sky.bounce = bounce;
    if (grade) terrain.uniforms.uGrade.value.set(grade[0], grade[1], grade[2]);
    if (ambDay) sky.ambDay = ambDay.slice();
    if (Number.isFinite(hazeElev)) sky.hazeElevDeg = hazeElev;
    if (Number.isFinite(debake)) terrain.uniforms.uDebake.value = debake;
    if (Number.isFinite(steep)) terrain.uniforms.uSteepK.value = steep;
    return true;
  },
});
const sunOut = {};
const pinOut = {};
const projectPin = (lat, lon) => globe.project(lat, lon, W, H, pinOut);

let last = performance.now();
let fpsAcc = 0, fpsN = 0;
let chipAt = 0;
const fadeEl = document.getElementById('fade');
let fadeShown = -1;
let frameErrors = 0;

function frame() {
  const tnow = performance.now();
  let dt = Math.min(0.25, (tnow - last) / 1000); // long gaps (tab switches) do not jump the timeline
  last = tnow;
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 0.5) { debug.fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
  const sdt = P.still ? 0 : dt * P.speed;
  try {
    step(dt, sdt);
  } catch (e) {
    if (frameErrors++ < 3) console.error('[frame]', e && (e.stack || e.message || e));
  }
}

function step(dt, sdt) {
  terrain.update();
  if (terrain.ready && !terrainReadyHandled) {
    terrainReadyHandled = true;
    debug.ready.terrain = true;
    mark(terrain.source === 'data' ? 'terrain-ready' : 'terrain-procedural');
    if (qs.has('lod')) terrain.forceLod(Number(qs.get('lod'))); // debug: one LOD level everywhere
    rebuildPaths(); // now, or at the next cut when a scene is running
  }
  if (terrain.ready && loadFlags.terrainTextures && terrain.info.textures >= terrain.info.texturesWanted) mark('terrain-textures');
  if (globe.source === 'data' && firstFrame) mark('globe-data');
  if (pano.ready) mark('pano-ready');
  // the place's own imagery on the globe for the last part of the descend (a fresh texture after a reload)
  if (terrain.ready && terrain.outerTexture) {
    if (!globe.patch) globe.setPatch(terrain.outerTexture, terrain.outer ? terrain.outer.size : 100000);
    else if (globe.patchTexture !== terrain.outerTexture) globe.setPatchTexture(terrain.outerTexture);
  }
  if (disposeTerrainAt && performance.now() > disposeTerrainAt && seq.state === 'home' && !turning) {
    disposeTerrainAt = 0;
    globe.clearPatch();
    terrain.dispose();
    terrain.disposedOnce = true;
    terrainReadyHandled = false;
  }
  debug.ready.pano = pano.ready;
  debug.ready.globe = globe.source;

  // ---------- home / turning
  if (seq.state !== 'tour') {
    if (homeDwell >= 0) {
      homeDwell -= sdt;
      if (homeDwell < 0) { homeDwell = -1; requestStart('auto'); }
    }
    if (turning) {
      turning.t += sdt;
      const u = turning.dur > 0 ? smoothstep(0, turning.dur, turning.t) : 1;
      const ll = globeTurnAt(turning.plan, u, turnLL);
      home.lat = ll.lat; home.lon = ll.lon;
      home.dist = lerp(home.dist, home.fitDist, Math.min(1, sdt * 2));
      if (turning.t >= turning.dur) beginDescend();
    } else if (!REDUCED) {
      home.lon -= GLOBE.AUTO_ROT_DEG_S * sdt;
    }
    let offK = 1;
    if (homeSettle) {
      homeSettle.t += dt;
      offK = smoothstep(0, HOME_SETTLE_S, homeSettle.t);
      if (!turning) home.dist = Math.exp(lerp(homeSettle.from, Math.log(home.fitDist), offK));
      if (homeSettle.t >= HOME_SETTLE_S) homeSettle = null;
    }
    if (!turning && !homeSettle && seq.state !== 'tour') home.dist = home.fitDist;
    if (seq.state !== 'tour') {
      globe.updateSun(nowMs());
      const hp = globe.homePose(home.lat, home.lon, home.dist);
      const off = homeOffset(offK);
      globe.applyPose(hp, aspect, off);
      renderer.render(globe.scene, globe.camera);
      if (!P.nogui && document.body.classList.contains('is-home')) {
        ui.updatePins(projectPin);
        refreshSunList(false);
      }
      setFade(0);
      debug.state = turning ? 'turning' : 'home';
      debug.scene = null; debug.t = 0;
      debug.camera.space = 'globe';
      if (!firstFrame) { firstFrame = true; mark('first-frame'); ui.bootDone(); }
      ui.update(dt, uiHome);
      debug.frames++;
      mirrorDebug();
      return;
    }
  }

  // ---------- tour
  seq.update(sdt);
  if (seq.state !== 'tour') return; // ended this frame; next frame renders home
  const scene = seq.scene;
  const T = seq.dur_(scene);
  let t = seq.t;
  let id = scene;
  if (scene === 'stand' && pano.failed) {
    id = 'stand-terrain';
    if (!step.panoNote) { step.panoNote = true; ui.setCaption('360 사진을 불러오지 못해 전망대 위에서 지형으로 보여 드립니다.', (place.camera && place.camera.stand && place.camera.stand.name_ko) || ''); }
  } else step.panoNote = false;
  let pose;
  if (REDUCED) pose = reducedPose(id, t, T);
  else pose = pathPose(id, t, pathCtx, poseOut, poseOpts);
  const fade = Math.max(pose.fade || 0, seq.jumpFade, REDUCED ? reducedFade(t, T) : 0, look.fade);
  setFade(fade);

  const clockMs = sceneClock();
  const sp = sunPosition(clockMs, place.lat, place.lon, sunOut);
  debug.sun.elevation = Math.round(sp.elevation * 10) / 10;
  debug.sun.azimuth = Math.round(sp.azimuth);
  debug.sun.clock = clockMs;
  look.enabled = pose.space !== 'globe';
  look.keepYaw = pose.space === 'pano';
  let night = smoothstep(-2, -10, sp.elevation);

  if (pose.space === 'globe') {
    globe.updateSun(scene === 'ascend' ? nowMs() : clockMs);
    // reduced motion: no slide from the home position, the change shows as a dissolve only
    const blend = scene === 'descend' && !REDUCED ? 1 - smoothstep(0, 3, t) : 0;
    globe.applyPose(pose, aspect, blend > 0.001 ? homeOffset(blend) : null);
    renderer.render(globe.scene, globe.camera);
    setCam(pose, 'globe');
  } else if (pose.space === 'terrain') {
    applyTerrainCamera(pose);
    sky.update(sp.elevation, sp.azimuth, worldCam);
    terrain.updateShadows(sky.sunDir);
    if (P.debug === 'crack') {
      // every pixel the terrain does not cover shows pure magenta (holes, cracks, the sky)
      sky.sky.visible = false; sky.dome.visible = false; sky.stars.visible = false;
      world.background.setRGB(1, 0, 1, THREE.SRGBColorSpace);
    }
    renderer.render(world, worldCam);
  } else if (pose.space === 'pano') {
    // auto-rotation stops while the viewer holds or waits, then resumes (no swing back)
    const dy = pose.yaw - lastPanoPathYaw;
    lastPanoPathYaw = pose.yaw;
    panoAuto += dy * look.resume;
    if (!look.holding && look.idleFor >= LOOK_RESUME_S && look.yaw !== 0) panoAuto += look.absorbYaw();
    const hd = panoAuto + look.yaw;
    pano.setOpacity(1);
    pano.setView(hd, pose.pitch + look.pitch, fovFor(pose.fov + look.fov), aspect);
    renderer.render(pano.scene, pano.camera);
    setCam({ x: 0, y: 0, z: 0, heading: hd, pitch: pose.pitch + look.pitch, fov: pose.fov }, 'pano');
    night = 0;
  }
  if (pose.cloud > 0.002 && P.debug !== 'crack') {
    const zoom = scene === 'descend' ? 1 + 2.4 * smoothstep(DESCEND.CLOUD_IN[0], DESCEND.CLOUD_OUT[1], t) : 1 + 2.4 * (1 - smoothstep(ASCEND.CLOUD_IN[0], ASCEND.CLOUD_OUT[1], t));
    clouds.render(renderer, pose.cloud, performance.now() / 1000, zoom, aspect, night);
  }
  // place name as we break through the clouds
  if (scene === 'descend' && !REDUCED && t >= DESCEND.GLOBE_END_S && !step.namedAt) {
    step.namedAt = true;
    const native = (place.names || []).find((n) => n.lang && !/^ko|^en/i.test(n.lang));
    // only the first sentence of the name note on screen (the rest is for the deep read)
    const note1 = native && native.note_ko ? (String(native.note_ko).match(/^.*?[.!?](?=\s|$)/) || [native.note_ko])[0] : '';
    const nativeName = native ? (native.reading_ko ? `${native.reading_ko}(${native.text})` : native.text) : '';
    ui.setCaption(`${place.name_ko} · ${place.region_ko || ''}`.trim(), native ? `${nativeName}${note1 ? ' — ' + note1 : ''}` : (place.scenes[0] && place.scenes[0].caption_ko) || '');
  }
  if (scene !== 'descend') step.namedAt = false;

  look.update(dt);
  if (debug._trace && debug._trace.length < 5000) debug._trace.push([performance.now(), look.yaw, look.pitch, look.fov, look.fade]);
  ui.setLookHint(look.enabled && (look.holding || (look.idleFor < LOOK_RESUME_S && !!(look.yaw || look.pitch || look.fov))));
  if (performance.now() - chipAt > 250) {
    chipAt = performance.now();
    if (pose.space === 'pano' && pano.meta && pano.meta.taken) {
      // the 360 photo is not "now": show when it was taken
      ui.setTime(photoTimeLabel(pano.meta), 'photo', `지금 그곳은 ${fmtLocalTime(nowMs(), place.tz)}입니다`);
    } else {
      const d = describeSun(clockMs, place.lat, place.lon, place.tz);
      let extra = '', note = '';
      if (scene === 'daylapse') extra = ' · 빨리 감기';
      else if (tour.timeMode === 'sunrise') {
        extra = ' · 미리 보기';
        const dn = describeSun(nowMs(), place.lat, place.lon, place.tz);
        note = `지금 그곳은 ${dn.short} ${dn.time}입니다`;
      }
      ui.setTime(`${d.time} ${d.short}${extra}`, d.phase, note);
    }
  }
  uiTour.paused = seq.paused || P.still;
  ui.update(dt, uiTour);
  debug.state = 'tour';
  debug.scene = scene;
  debug.t = Math.round(t * 100) / 100;
  debug.frames++;
  if (!firstFrame) { firstFrame = true; mark('first-frame'); ui.bootDone(); }
  mirrorDebug();
}

// Mirror a few fields onto <html data-*> so headless checks can read them with --dump-dom.
let mirrorAt = 0;
function mirrorDebug() {
  const t = performance.now();
  if (t - mirrorAt < 400) return;
  mirrorAt = t;
  const ds = document.documentElement.dataset;
  ds.state = debug.state;
  ds.scene = debug.scene || '';
  ds.t = String(debug.t);
  ds.fps = String(debug.fps);
  ds.terrain = terrain.source + (terrain.ready ? ':ready' : '') + `:${terrain.info.textures}/${terrain.info.texturesWanted}`;
  ds.globe = globe.source;
  ds.pano = pano.ready ? 'ready' : pano.failed ? 'failed' : 'none';
  ds.cam = `${debug.camera.space} ${debug.camera.x},${debug.camera.y},${debug.camera.z} h${debug.camera.heading} p${debug.camera.pitch}`;
  ds.sun = `${debug.sun.elevation}`;
  ds.frames = String(debug.frames);
  ds.warn = terrain.info.warnings.join(' | ').slice(0, 300);
}

function homeOffset(k) {
  // shift the projection so the globe sits in the free area (k=1) or centred (k=0)
  const dx = (W / 2 - homeArea.cx) * k, dy = (H / 2 - homeArea.cy) * k;
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return null;
  viewOff.fullW = W; viewOff.fullH = H; viewOff.x = dx; viewOff.y = dy; viewOff.w = W; viewOff.h = H;
  return viewOff;
}

function applyTerrainCamera(pose) {
  const hd = pose.heading + look.yaw;
  const pt = clamp(pose.pitch + look.pitch, -88, 35);
  worldCam.position.set(pose.x, pose.y, pose.z);
  worldCam.rotation.set(pt * DEG, -hd * DEG, 0, 'YXZ');
  const fov = fovFor(pose.fov + look.fov);
  const g = terrain.ready ? terrain.heightAt(pose.x, pose.z) : NaN;
  const hagl = Number.isFinite(g) ? Math.max(1, pose.y - g) : 2000;
  const near = clamp(hagl * 0.03, CAMERA.NEAR_MIN, 400);
  if (worldCam.fov !== fov || worldCam.aspect !== aspect || Math.abs(worldCam.near - near) > near * 0.1) {
    worldCam.fov = fov; worldCam.aspect = aspect; worldCam.near = near; worldCam.far = CAMERA.FAR;
    worldCam.updateProjectionMatrix();
  }
  setCam({ x: pose.x, y: pose.y, z: pose.z, heading: hd, pitch: pt, fov }, 'terrain');
}

function setCam(p, space) {
  const c = debug.camera;
  c.space = space;
  c.x = Math.round(p.x || 0); c.y = Math.round(p.y || 0); c.z = Math.round(p.z || 0);
  c.heading = Math.round((p.heading || 0) * 10) / 10; c.pitch = Math.round((p.pitch || 0) * 10) / 10; c.fov = Math.round((p.fov || 0) * 10) / 10;
  if (space === 'globe') { c.altM = Math.round(poseOut.altM || 0); }
}

function setFade(f) {
  const v = Math.round(clamp(f, 0, 1) * 1000) / 1000;
  if (v !== fadeShown) { fadeShown = v; fadeEl.style.opacity = String(v); }
}

// prefers-reduced-motion: one still frame per scene, 3 s dissolves (through dark)
function reducedFade(t, T) {
  const h = REDUCED_DISSOLVE_S / 2;
  return Math.max(1 - smoothstep(0, h, t), smoothstep(T - h, T, t));
}
const _still = {};
function reducedPose(id, t, T) {
  if (id === 'descend' || id === 'ascend') {
    const hp = globe.homePose(GLOBE.HOME_LAT, place.lon + GLOBE.HOME_LON_OFFSET, GLOBE.HOME_DIST);
    Object.assign(_still, hp);
    _still.fade = 0; _still.cloud = 0;
    return _still;
  }
  const p = pathPose(id, id === 'daylapse' || id === 'stand' || id === 'stand-terrain' ? stillTime(id === 'stand-terrain' ? 'stand' : id, pathCtx) : stillTime(id, pathCtx), pathCtx, _still, { from: daylapseEnd, reducedMotion: true, standPitch: poseOpts.standPitch });
  p.fade = 0; p.cloud = 0;
  if (p.space === 'pano') p.yaw = 0;
  return p;
}

// ------------------------------------------------------------------ boot
async function boot() {
  if (P.scene && (SCENE_DUR[P.scene] !== undefined)) {
    // debug jump: wait for terrain (and the photo when needed) so the frame is complete
    startMode = 'once';
    document.body.classList.remove('is-home');
    ui.setMode('turning');
    await Promise.race([terrainPromise, new Promise((r) => setTimeout(r, 20000))]);
    if (!terrain.ready) terrain.useProcedural();
    if (terrain.texturesDone) await Promise.race([terrain.texturesDone, new Promise((r) => setTimeout(r, 20000))]);
    terrain.flushTextures();
    await placePromise;
    rebuildPaths();
    if (P.scene === 'stand') await Promise.race([pano.load(DATA.pano(PLACE_ID), PANO_SMALL), new Promise((r) => setTimeout(r, 15000))]);
    if (P.scene === 'ascend') pathPose('daylapse', seq.dur_('daylapse'), pathCtx, daylapseEnd);
    home.dist = home.fitDist;
    beginDescend(P.scene, clamp(P.t, 0, seq.dur_(P.scene)));
    if (P.paused) togglePause();
    if (P.open === 'cards') ui.openCards();
    if (P.open === 'deep') ui.openDeep();
    if (P.open === 'credits') ui.openCredits();
  } else if (P.autoplay) {
    requestStart('auto');
  } else if (P.open === 'credits') {
    await placePromise;
    await refreshCredits();
    ui.openCredits();
  }
}
renderer.setAnimationLoop(frame);
boot();
