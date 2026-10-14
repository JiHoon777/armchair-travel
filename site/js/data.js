// Data loading with fallbacks: the app must run even when a data file is missing.
// All URLs are relative to the page (works as plain static files and as a claude.ai Artifact).

export const DATA = {
  places: 'data/places.json',
  placeDir: (id) => `data/${id}/`,
  place: (id) => `data/${id}/place.json`,
  terrain: (id) => `data/${id}/terrain/`,
  pano: (id) => `data/${id}/pano/`,
  media: (id) => `data/${id}/media/`,
  audio: (id) => `data/${id}/audio/`,
  globe: 'data/globe/',
  credits: ['data/credits/terrain.json', 'data/credits/media.json'],
};

export async function fetchJSON(url, { quiet = false } = {}) {
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`${res.status}`);
    return await res.json();
  } catch (e) {
    if (!quiet) console.warn(`[data] ${url} not available (${e.message})`);
    return null;
  }
}

// The first 12 places (research note 03) in case data/places.json is not there yet.
export const FALLBACK_PLACES = [
  { id: 'grand-canyon', name_ko: '그랜드캐니언', lat: 36.0617, lon: -112.1081, tz: 'America/Phoenix', status: 'ready' },
  { id: 'moraine-lake-banff', name_ko: '모레인 호수', lat: 51.3225, lon: -116.1856, tz: 'America/Edmonton', status: 'soon' },
  { id: 'yellowknife-aurora', name_ko: '옐로나이프', lat: 62.4536, lon: -114.37, tz: 'America/Edmonton', status: 'soon' },
  { id: 'salar-de-uyuni', name_ko: '우유니 소금사막', lat: -20.1338, lon: -67.4891, tz: 'America/La_Paz', status: 'soon' },
  { id: 'jungfrau-aletsch', name_ko: '융프라우-알레치', lat: 46.4422, lon: 8.0772, tz: 'Europe/Zurich', status: 'soon' },
  { id: 'geirangerfjord', name_ko: '게이랑에르피오르', lat: 62.0944, lon: 7.0806, tz: 'Europe/Oslo', status: 'soon' },
  { id: 'mount-everest', name_ko: '에베레스트', lat: 27.9883, lon: 86.9253, tz: 'Asia/Kathmandu', status: 'soon' },
  { id: 'ha-long-bay', name_ko: '할롱베이', lat: 20.9, lon: 107.2, tz: 'Asia/Ho_Chi_Minh', status: 'soon' },
  { id: 'jeju-volcanic-island', name_ko: '제주 화산섬', lat: 33.4581, lon: 126.9425, tz: 'Asia/Seoul', status: 'soon' },
  { id: 'namib-sossusvlei', name_ko: '나미브 소수스블레이', lat: -24.7398, lon: 15.2877, tz: 'Africa/Windhoek', status: 'soon' },
  { id: 'victoria-falls', name_ko: '빅토리아 폭포', lat: -17.9244, lon: 25.8567, tz: 'Africa/Harare', status: 'soon' },
  { id: 'great-barrier-reef', name_ko: '그레이트배리어리프', lat: -20.2459, lon: 149.0205, tz: 'Australia/Brisbane', status: 'soon' },
];

// Placeholder story so every layer has something to show before data/grand-canyon/place.json exists.
export const FALLBACK_PLACE = {
  id: 'grand-canyon', name_ko: '그랜드캐니언', name_en: 'Grand Canyon', region_ko: '미국 애리조나',
  tz: 'America/Phoenix', lat: 36.0617, lon: -112.1081,
  names: [],
  camera: {},
  scenes: [
    { id: 'descend', title_ko: '내려가기', dur_s: 30, caption_ko: '지구본에서 그랜드캐니언으로 내려갑니다.' },
    { id: 'wide', title_ko: '크게 보기', dur_s: 180, caption_ko: '높이 떠서 협곡 위를 천천히 돕니다.' },
    { id: 'approach', title_ko: '다가가기', dur_s: 180, caption_ko: '협곡 안쪽, 강이 흐르는 곳으로 천천히 내려갑니다.' },
    { id: 'stand', title_ko: '그 자리에 서기', dur_s: 180, caption_ko: '전망대에서 찍은 360 사진입니다. 끌면 둘러볼 수 있습니다.' }, // fallback only
    { id: 'daylapse', title_ko: '하루 빨리 감기', dur_s: 180, caption_ko: '이곳의 오늘 하루를 3분에 돌립니다.' },
  ],
  cards: [],
  narration_ko: [],
  deep_ko: [],
  scale_ko: '',
  facts: [],
  sources: [],
  _fallback: true,
};

export function normalizePlace(p) {
  if (!p || typeof p !== 'object') return { ...FALLBACK_PLACE };
  const out = { ...FALLBACK_PLACE, ...p };
  // keep fallback captions for scenes the file leaves out
  const byId = new Map((Array.isArray(p.scenes) ? p.scenes : []).filter((s) => s && s.id).map((s) => [s.id, s]));
  out.scenes = FALLBACK_PLACE.scenes.map((s) => ({ ...s, ...(byId.get(s.id) || {}) }));
  for (const k of ['cards', 'narration_ko', 'deep_ko', 'facts', 'sources', 'names']) if (!Array.isArray(out[k])) out[k] = [];
  out._fallback = !p.scenes;
  return out;
}

export function normalizePlaces(list) {
  const arr = list && Array.isArray(list.places) ? list.places : null;
  if (!arr || !arr.length) return FALLBACK_PLACES.slice();
  const fb = new Map(FALLBACK_PLACES.map((x) => [x.id, x]));
  return arr
    .filter((x) => x && Number.isFinite(x.lat) && Number.isFinite(x.lon))
    .map((x) => ({ ...(fb.get(x.id) || {}), ...x, tz: x.tz || (fb.get(x.id) || {}).tz || 'UTC' }));
}

// Credits shown in the credits dialog, grouped by kind.
let creditFiles = null;
export async function loadCredits(extra) {
  creditFiles = creditFiles || Promise.all(DATA.credits.map((u) => fetchJSON(u, { quiet: true })));
  const files = await creditFiles;
  const fromFiles = files.filter(Array.isArray).flat();
  const groups = [];
  const media = [];
  const pushCredit = (what, c) => {
    if (!c) return;
    media.push({ what_ko: what, title: c.title, author: c.author, license: c.license, license_url: c.license_url, url: c.url, attribution: c.attribution, modified_ko: c.modified_ko });
  };
  if (extra.pano) pushCredit('360 사진', extra.pano.credit);
  if (extra.media) {
    const yr = (m) => (m.year_label_ko || (Array.isArray(m.year_range) ? m.year_range.join('~') : m.year || ''));
    if (extra.media.then) pushCredit(`그때 사진 (${yr(extra.media.then)})`, extra.media.then.credit);
    if (extra.media.now) pushCredit(`지금 사진 (${yr(extra.media.now)})`, extra.media.now.credit);
  }
  if (extra.audio) pushCredit('자연의 소리 (섞은 소리)', extra.audio.credit);
  for (const c of extra.globe || []) media.push({ what_ko: c.what_ko || '지구본 사진', ...c });
  // one row per work: the credits files come first and carry the more descriptive what_ko,
  // so a later row with the same url (or the same title when there is no url) is dropped
  const seen = new Set();
  const dedupe = (arr) => arr.filter((c) => {
    const k = c.url ? 'u|' + c.url : 't|' + c.title;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  groups.push({ title: '지형·사진·소리', items: dedupe([...fromFiles, ...media]) });
  const src = (extra.place && extra.place.sources) || [];
  groups.push({ title: '설명 글의 출처', items: src.map((s) => ({ title: s.title, author: s.publisher, url: s.url, attribution: s.accessed ? `${s.accessed} 확인` : '' })) });
  groups.push({
    title: '만든 재료', items: [
      { what_ko: '3D', title: 'three.js r170', author: 'three.js authors', license: 'MIT', url: 'https://threejs.org/' },
      { what_ko: '하늘', title: 'Sky (Preetham 모델), three.js 예제', author: 'zz85, Simon Wallner, Martin Upitis', license: 'MIT', url: 'https://github.com/mrdoob/three.js/blob/r170/examples/jsm/objects/Sky.js' },
      { what_ko: '글꼴', title: 'Gowun Dodum · Gowun Batang · Do Hyeon', author: 'Google Fonts', license: 'SIL OFL 1.1', url: 'https://fonts.google.com/' },
      { what_ko: '해 계산', title: 'NOAA Solar Calculator 식을 직접 구현', author: 'NOAA GML', license: '공공 영역', url: 'https://gml.noaa.gov/grad/solcalc/' },
      { what_ko: '대체 지구본', title: 'Natural Earth 110m 육지', author: 'Natural Earth', license: '공공 영역', url: 'https://www.naturalearthdata.com/' },
    ],
  });
  return groups;
}
