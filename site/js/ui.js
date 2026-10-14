// HTML interface over the canvas: home list and pins, HUD chips, caption, scene dots, controls,
// story cards with the then/now pair, deep read, credits, notices, idle hiding, keyboard.
import { UI_IDLE_HIDE_S, CAPTION_SHOW_S } from './config.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = (u) => (/^https?:\/\//i.test(String(u || '')) ? String(u) : null);
// Keep a number with its unit on one line ("300 m", "446 km", "1,829 m"): no break before the unit.
export const nb = (s) => String(s ?? '').replace(/(\d)[ \t]+(?=(?:km²|m²|km|cm|mm|m|°C|°F|%|ft|mi|kg)(?![A-Za-z]))/g, '$1 ');
const HANGUL = /[가-힣]/;
// Language names for the deep read (codes from place.json names[].lang).
const LANG_KO = { hop: '호피어', nv: '나바호어', hav: '하바수파이어', yuf: '하바수파이·왈라파이어', en: '영어', ko: '한국어', es: '스페인어', zun: '주니어' };
function langName(code) {
  const c = String(code || '').trim();
  if (!c) return '';
  if (LANG_KO[c]) return LANG_KO[c];
  try {
    const n = new Intl.DisplayNames(['ko'], { type: 'language' }).of(c);
    if (n && n !== c) return n;
  } catch { /* unknown code */ }
  return c;
}
// Short Korean licence label for the credits list; the original wording stays in the tooltip.
export function licenseKo(lic) {
  const s = String(lic || '');
  if (!s) return '';
  const parts = [];
  const cc = s.match(/CC[ -]BY(-SA)?[ -]?(\d\.\d)?/i);
  if (/CC0/i.test(s)) parts.push('CC0 (공공 영역 기증)');
  if (cc) parts.push(`CC BY${cc[1] ? '-SA' : ''}${cc[2] ? ' ' + cc[2] : ''}`);
  if (/public domain|PD-/i.test(s)) {
    if (/U\.S\. Gov|PD-USGov|NASA|NPS|USGS|USDA|National Park/i.test(s)) parts.push('공공 영역 (미국 정부 저작물)');
    else if (/in the U\.S\.|PD-US/i.test(s)) parts.push('공공 영역 (미국)');
    else parts.push('공공 영역');
  }
  if (/\bMIT\b/.test(s)) parts.push('MIT 라이선스');
  if (/OFL/i.test(s)) parts.push('SIL 오픈 폰트 라이선스 1.1');
  if (!parts.length || HANGUL.test(s)) return s;
  return [...new Set(parts)].join(' · ');
}

const SCENE_TITLES = { descend: '내려가기', wide: '크게 보기', approach: '다가가기', stand: '그 자리에 서기', daylapse: '하루 빨리 감기', ascend: '돌아가기' };
// everything behind an open dialog is made inert (focus cannot leave the dialog)
const BEHIND_MODAL = ['home', 'hud', 'cards', 'notices'];

export class UI {
  constructor(handlers) {
    this.h = handlers;
    this.place = null;
    this.cardIndex = 0;
    this.idleT = 0;
    this.idle = false;
    this.captionT = Infinity;
    this.captionHold = false;   // narration owns the caption
    this._deferred = null;      // scene caption that arrived during the narration
    this._sceneCap = null;      // the current scene caption (restored after the narration)
    this.modalStack = [];
    this.lastFocus = null;
    this.toastTimer = 0;
    this.pins = [];
    this.nogui = false;
    this._bind();
  }

  _bind() {
    const h = this.h;
    $('btn-play').addEventListener('click', () => h.onStart('loop'));
    $('btn-enter').addEventListener('click', () => h.onStart('enter'));
    $('btn-credits-home').addEventListener('click', () => this.openCredits());
    $('btn-pause').addEventListener('click', () => h.onTogglePause());
    $('sheet-play').addEventListener('click', () => h.onTogglePause());
    $('btn-sound').addEventListener('click', () => h.onToggleSound());
    $('btn-story').addEventListener('click', () => this.toggleCards());
    $('btn-next').addEventListener('click', () => h.onNext());
    $('cards-close').addEventListener('click', () => this.closeCards());
    $('card-prev').addEventListener('click', () => this.showCard(this.cardIndex - 1));
    $('card-next').addEventListener('click', () => this.showCard(this.cardIndex + 1));
    $('btn-listen').addEventListener('click', () => h.onListen());
    $('btn-deep').addEventListener('click', () => this.openDeep());
    $('btn-credits').addEventListener('click', () => this.openCredits());
    $('btn-home').addEventListener('click', () => { this.closeCards(); h.onHome && h.onHome(); });
    $('deep-close').addEventListener('click', () => this.closeModal('deep'));
    $('credits-close').addEventListener('click', () => this.closeModal('credits'));
    for (const id of ['deep', 'credits']) {
      $(id).addEventListener('click', (e) => { if (e.target === $(id)) this.closeModal(id); });
    }
    $('toast-close').addEventListener('click', () => this.hideToast());
    // layer 1 -> layer 2: a tap on the one-line caption opens the story cards
    $('caption').addEventListener('click', () => { if (h.inTour()) this.openCards(); else this.showCaption(); });
    $('caption-more').addEventListener('focus', () => this.showCaption());
    const wake = () => this.poke();
    for (const ev of ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart']) window.addEventListener(ev, wake, { passive: true });
    window.addEventListener('keydown', (e) => this._onKey(e));
  }

  _onKey(e) {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const tag = (e.target && e.target.tagName) || '';
    const inField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    const h = this.h;
    if (e.key === 'Escape') {
      if (this.modalStack.length) { this.closeModal(this.modalStack[this.modalStack.length - 1]); e.preventDefault(); return; }
      if (!$('cards').hidden) { this.closeCards(); e.preventDefault(); return; }
      if (!$('toast').hidden) { this.hideToast(); e.preventDefault(); }
      return;
    }
    if (inField) return;
    if (this.modalStack.length) return;
    const k = e.key;
    if (k === ' ' || k === 'Spacebar') {
      const t = e.target;
      if (t && (t.tagName === 'BUTTON' || t.tagName === 'A' || t.tagName === 'SUMMARY')) return; // let the control act
      if (!h.inTour()) return;
      e.preventDefault(); h.onTogglePause();
    } else if (k === 'ArrowRight') { if (h.inTour()) { e.preventDefault(); h.onNext(); } }
    else if (k === 'ArrowLeft') { if (h.inTour()) { e.preventDefault(); h.onPrev(); } }
    else if (k === 'i' || k === 'I' || k === 'ㅑ') { if (h.inTour()) { e.preventDefault(); this.toggleCards(); } }
    else if (k === 'm' || k === 'M' || k === 'ㅡ') { e.preventDefault(); h.onToggleSound(); }
    else if (k === 'f' || k === 'F' || k === 'ㄹ') { e.preventDefault(); h.onFullscreen(); }
  }

  // ------------------------------------------------------------ modes
  setMode(mode) {
    document.body.classList.toggle('is-home', mode === 'home');
    $('hud').hidden = mode !== 'tour' || this.nogui;
    if (mode !== 'tour') { $('look-hint').hidden = true; }
    if (mode === 'home') { this.closeCards(); this.setIdle(false); }
  }
  setNoGui(v) {
    this.nogui = v;
    if (v) { $('home').hidden = true; $('hud').hidden = true; $('notices').hidden = true; }
  }
  bootDone() {
    window.__armchairBooted = true;
    $('boot').classList.add('done');
    setTimeout(() => { $('boot').hidden = true; }, 700);
  }

  poke() {
    this.idleT = 0;
    if (this.idle) this.setIdle(false);
  }
  setIdle(v) {
    this.idle = v;
    document.body.classList.toggle('ui-idle', v);
  }

  update(dt, { inTour, paused }) {
    // idle hiding only while touring, playing, and nothing is open
    const blocking = this.modalStack.length || !$('cards').hidden || paused || !inTour;
    if (blocking) { this.idleT = 0; if (this.idle) this.setIdle(false); }
    else {
      this.idleT += dt;
      if (!this.idle && this.idleT > UI_IDLE_HIDE_S) this.setIdle(true);
    }
    if (!this.captionHold && this.captionT < Infinity) {
      this.captionT += dt;
      if (this.captionT > CAPTION_SHOW_S) { $('caption').classList.add('is-hidden'); this.captionT = Infinity; }
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.hideToast();
    }
  }

  // ------------------------------------------------------------ place + home
  setPlace(place) {
    this.place = place;
    $('place-name').textContent = place.name_ko || '그랜드캐니언';
    $('place-region').textContent = place.region_ko || '';
    this.cardIndex = 0;
    this._renderCards();
  }

  buildDots(scenes) {
    const ol = $('dots');
    ol.innerHTML = '';
    scenes.forEach((id, i) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'dot';
      b.dataset.scene = id;
      const title = this.sceneTitle(id);
      b.setAttribute('aria-label', `${title} (${i + 1}/${scenes.length})`);
      b.innerHTML = `<span class="dot-label">${esc(title)}</span>`;
      b.addEventListener('click', () => this.h.onJump(id));
      li.appendChild(b);
      ol.appendChild(li);
    });
  }
  sceneTitle(id) {
    const s = this.place && Array.isArray(this.place.scenes) ? this.place.scenes.find((x) => x.id === id) : null;
    return (s && s.title_ko) || SCENE_TITLES[id] || id;
  }
  setScene(id) {
    for (const b of document.querySelectorAll('.dot')) {
      if (b.dataset.scene === id) b.setAttribute('aria-current', 'step');
      else b.removeAttribute('aria-current');
    }
  }

  // Pins over the globe. places: [{id, name_ko, status, lat, lon}]
  buildPins(places, onPick) {
    const wrap = $('pins');
    wrap.innerHTML = '';
    this.pins = places.map((p) => {
      const b = document.createElement('button');
      b.type = 'button';
      const ready = p.status === 'ready';
      b.className = 'pin ' + (ready ? 'is-ready' : 'is-soon');
      b.innerHTML = `<span class="pin-dot"></span><span class="pin-label">${esc(p.name_ko)}${ready ? '' : ' · 곧 들어옴'}</span>`;
      b.setAttribute('aria-label', ready ? `${p.name_ko} 보러 가기` : `${p.name_ko} · 곧 들어옴`);
      if (ready) b.addEventListener('click', () => onPick(p));
      else b.setAttribute('aria-disabled', 'true');
      wrap.appendChild(b);
      return { el: b, place: p, x: -100, y: -100, vis: null };
    });
  }
  // proj: (lat, lon) -> {x, y, visible}
  updatePins(proj) {
    for (const pin of this.pins) {
      const r = proj(pin.place.lat, pin.place.lon);
      if (r.visible !== pin.vis) {
        pin.vis = r.visible;
        pin.el.classList.toggle('is-back', !r.visible);
        pin.el.tabIndex = r.visible ? 0 : -1;
        pin.el.setAttribute('aria-hidden', r.visible ? 'false' : 'true');
      }
      if (r.visible && (Math.abs(r.x - pin.x) > 0.3 || Math.abs(r.y - pin.y) > 0.3)) {
        pin.x = r.x; pin.y = r.y;
        pin.el.style.transform = `translate(${(r.x - 11).toFixed(1)}px, ${(r.y - 11).toFixed(1)}px)`;
      }
    }
  }

  // Home panel: the place that can be watched now as a fixed card, then at most three places whose
  // sunrise is now or next (labelled by their sunrise time), then one line for the rest.
  // ready: [{place, desc}], rows: [{place, desc, sun: '05:31 해 뜸 · 2시간 뒤'}], soon: count
  renderHome({ ready, rows, title, soon }, onPick) {
    const focusId = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.id : null;
    const card = ready.map(({ place, desc }) => `<button type="button" class="ready-go" data-id="${esc(place.id)}" aria-label="${esc(place.name_ko)} 보러 가기, 그곳은 ${esc(desc.time)}, ${esc(desc.label)}">` +
      `<span class="sun-ic ph-${esc(desc.phase)}" aria-hidden="true"></span>` +
      `<span class="sun-name">${esc(place.name_ko)}<span class="tag">볼 수 있음</span></span>` +
      `<span class="sun-time">${esc(desc.time)}</span>` +
      `<span class="sun-state">${esc(desc.label)}</span></button>`).join('');
    const list = rows.map(({ place, desc, sun }) => `<li class="sun-row" data-id="${esc(place.id)}">` +
      `<span class="sun-ic ph-${esc(desc.phase)}" aria-hidden="true"></span>` +
      `<span class="sun-name">${esc(place.name_ko)}</span>` +
      `<span class="sun-time">${esc(desc.time)}</span>` +
      `<span class="sun-state">${esc(sun)}</span></li>`).join('');
    if ($('ready-place')._html !== card) {
      $('ready-place').innerHTML = card;
      $('ready-place')._html = card;
      for (const b of $('ready-place').querySelectorAll('.ready-go')) {
        b.addEventListener('click', () => { const r = ready.find((x) => x.place.id === b.dataset.id); if (r) onPick(r.place); });
      }
      // the minute changed under a focused card: keep the focus on the same place
      if (focusId) { const nb2 = $('ready-place').querySelector(`[data-id="${CSS.escape(focusId)}"]`); if (nb2) nb2.focus({ preventScroll: true }); }
    }
    if ($('sunlist')._html !== list) { $('sunlist').innerHTML = list; $('sunlist')._html = list; }
    $('sunlist-h').textContent = title;
    $('sunlist-sub').textContent = soon > 0 ? `곧 들어올 ${soon}곳 가운데, 해 뜰 때가 가까운 곳` : '';
  }

  // ------------------------------------------------------------ HUD
  // note: longer description for the tooltip and screen readers (e.g. the real time at night)
  setTime(text, phase, note = '') {
    $('time-text').textContent = text;
    const chip = $('chip-time');
    if (chip._note !== note) {
      chip._note = note;
      if (note) { chip.title = note; chip.setAttribute('aria-label', `${text}. ${note}`); }
      else { chip.removeAttribute('title'); chip.removeAttribute('aria-label'); }
    } else if (note) chip.setAttribute('aria-label', `${text}. ${note}`);
    const d = $('sun-dot');
    d.classList.toggle('is-low', phase === 'sunrise' || phase === 'sunset' || phase === 'dawn' || phase === 'dusk');
    d.classList.toggle('is-night', phase === 'night');
    d.classList.toggle('is-photo', phase === 'photo');
  }
  setPaused(p) {
    for (const id of ['btn-pause', 'sheet-play']) {
      const b = $(id);
      b.setAttribute('aria-pressed', p ? 'true' : 'false');
      b.setAttribute('aria-label', p ? '다시 재생' : '멈춤');
      b.title = p ? '다시 재생 (스페이스)' : '멈춤 (스페이스)';
    }
  }
  // on: the viewer wants sound; blocked: the browser has suspended it (a click turns it back on)
  setSound(on, blocked = false) {
    const b = $('btn-sound');
    const shown = on && !blocked;
    b.setAttribute('aria-pressed', shown ? 'true' : 'false');
    b.setAttribute('aria-label', blocked && on ? '소리가 멈췄습니다. 눌러서 다시 켜기' : shown ? '소리 끄기' : '소리 켜기');
  }
  // Scene captions wait while the narration owns the caption (its sentences are the subtitles).
  setCaption(text, sub = '', { hold = false } = {}) {
    if (!hold) this._sceneCap = [text, sub];
    if (this.captionHold && !hold) { this._deferred = [text, sub]; return; }
    $('caption-text').textContent = nb(text || '');
    $('caption-sub').textContent = nb(sub || '');
    this.captionHold = hold;
    if (hold) {
      // the sheet may cover the caption: the sentence is shown in the sheet as well
      const sn = $('sheet-narr');
      sn.innerHTML = `${esc(nb(text || ''))}${sub ? `<span class="sn-sub">${esc(sub)}</span>` : ''}`;
      sn.hidden = false;
    }
    this.showCaption();
  }
  // narration over: back to the scene caption (the newest one if the scene changed meanwhile)
  releaseCaption() {
    this.captionHold = false;
    $('sheet-narr').hidden = true;
    const d = this._deferred || this._sceneCap;
    this._deferred = null;
    if (d) this.setCaption(d[0], d[1]);
    else this.hideCaption();
  }
  showCaption() {
    if (!$('caption-text').textContent) return;
    $('caption').classList.remove('is-hidden');
    this.captionT = 0;
  }
  hideCaption() {
    this._sceneCap = null;
    if (this.captionHold) return;
    $('caption').classList.add('is-hidden'); this.captionT = Infinity;
  }
  setLookHint(v) { const el = $('look-hint'); if (el.hidden === v) el.hidden = !v; }
  setLoading(v, text) {
    const el = $('loading');
    el.hidden = !v;
    if (text) el.textContent = text;
  }
  setNarrating(v, withVoice = true) {
    $('narr-label').hidden = !v;
    $('narr-label').textContent = withVoice ? '기기 음성 · 시험용' : '글로 보기';
    $('btn-listen').textContent = v ? '■ 듣기 멈추기' : '▶ 90초 듣기';
    document.body.classList.toggle('narrating', v);
  }

  toast(text, { action = null, onAction = null, seconds = 9 } = {}) {
    $('toast-text').textContent = nb(text);
    const a = $('toast-action');
    if (action) {
      a.hidden = false;
      a.textContent = action;
      a.onclick = () => { this.hideToast(); onAction && onAction(); };
    } else { a.hidden = true; a.onclick = null; }
    $('toast').hidden = false;
    this.toastTimer = seconds;
  }
  hideToast() { $('toast').hidden = true; this.toastTimer = 0; }

  // ------------------------------------------------------------ story cards
  _renderCards() {
    const p = this.place;
    const media = this.media;
    if (media && media.then && media.now) {
      $('thennow').hidden = false;
      $('tn-then').src = this.mediaBase + media.then.file;
      $('tn-then').alt = media.then.alt_ko || media.then.caption_ko || `${media.then.year || ''}년 사진`;
      $('tn-now').src = this.mediaBase + media.now.file;
      $('tn-now').alt = media.now.alt_ko || media.now.caption_ko || '지금 사진';
      // a dated range ("1900~1930") must not be shown as one year
      const yr = (m, fb) => (Array.isArray(m.year_range) && m.year_range.length === 2 ? `${m.year_range[0]}~${m.year_range[1]}` : m.year ? `${m.year}` : fb);
      $('tn-label-then').textContent = yr(media.then, '그때');
      $('tn-label-now').textContent = yr(media.now, '지금');
      const cr = (c) => (c ? [String(c.author || '').split(/[;(]/)[0].trim(), licenseKo(c.license).split(' · ')[0]].filter(Boolean).join(', ') : '');
      const caption = media.pair_caption_ko || `${media.then.caption_ko || ''} ${media.now.caption_ko || ''}`.trim();
      const credit = media.credit_line_ko || `사진: ${[cr(media.then.credit), cr(media.now.credit)].filter(Boolean).join(' · ')}`;
      $('tn-caption').innerHTML = `${esc(nb(caption))}<span class="tn-credit">${esc(credit)}</span>`;
    } else {
      $('thennow').hidden = true;
    }
    const nSrc = p && Array.isArray(p.sources) ? p.sources.length : 0;
    $('sheet-credit').textContent = nSrc ? `출처 ${nSrc}곳 · 사진·지형 크레딧은` : '사진·지형 크레딧은';
    this.showCard(this.cardIndex);
  }
  setMedia(media, base) {
    this.media = media;
    this.mediaBase = base;
    if (this.place) this._renderCards();
  }
  showCard(i) {
    const cards = (this.place && Array.isArray(this.place.cards) && this.place.cards.length) ? this.place.cards : [{ title_ko: '이야기를 준비하고 있습니다', body_ko: '이곳의 이야기 카드가 아직 들어오지 않았습니다.' }];
    const n = cards.length;
    this.cardIndex = Math.max(0, Math.min(n - 1, i));
    const c = cards[this.cardIndex];
    $('card-title').textContent = c.title_ko || '';
    $('card-body').textContent = nb(c.body_ko || '');
    $('card-kicker').textContent = `${(this.place && this.place.name_ko) || ''} · 카드 ${this.cardIndex + 1}/${n}`;
    $('card-count').textContent = `${this.cardIndex + 1} / ${n}`;
    $('card-prev').disabled = this.cardIndex === 0;
    $('card-next').disabled = this.cardIndex === n - 1;
    // one link to the deep read, opened at this card's facts (with their sources and quotes)
    const refs = $('card-refs');
    refs.innerHTML = '';
    const facts = (this.place && this.place.facts) || [];
    const ids = (c.fact_ids || []).filter((fid) => facts.some((x) => x.id === fid));
    const srcs = new Set(ids.map((fid) => facts.find((x) => x.id === fid).source));
    if (ids.length) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ref-more';
      b.textContent = `출처 ${srcs.size}곳 ›`;
      b.setAttribute('aria-label', `이 카드의 사실 ${ids.length}개와 출처 ${srcs.size}곳을 깊이 읽기에서 보기`);
      b.addEventListener('click', () => this.openDeep({ facts: ids }));
      refs.appendChild(b);
    }
  }
  toggleCards() { if ($('cards').hidden) this.openCards(); else this.closeCards(); }
  // focus: move the keyboard focus into the sheet (not when the sheet opens because of a pause,
  // so the next Space resumes)
  openCards({ focus = true } = {}) {
    if (!$('cards').hidden) return;
    this.lastFocus = document.activeElement;
    $('cards').hidden = false;
    document.body.classList.add('cards-open');
    $('btn-story').setAttribute('aria-expanded', 'true');
    this.poke();
    if (focus) setTimeout(() => $('cards-close').focus({ preventScroll: true }), 30);
  }
  closeCards() {
    if ($('cards').hidden) return;
    $('cards').hidden = true;
    document.body.classList.remove('cards-open');
    $('btn-story').setAttribute('aria-expanded', 'false');
    if (this.lastFocus && this.lastFocus.focus && document.contains(this.lastFocus) && this.lastFocus !== document.body) this.lastFocus.focus({ preventScroll: true });
    this.showCaption();
  }

  // ------------------------------------------------------------ modals
  _openModal(id) {
    if (!this.modalStack.includes(id)) this.modalStack.push(id);
    this._modalReturn = this._modalReturn || {};
    this._modalReturn[id] = document.activeElement;
    $(id).hidden = false;
    for (const b of BEHIND_MODAL) { const el = $(b); if (el) el.inert = true; }
    setTimeout(() => $(id === 'deep' ? 'deep-close' : 'credits-close').focus({ preventScroll: true }), 30);
    this.h.onModal && this.h.onModal(true);
  }
  closeModal(id) {
    $(id).hidden = true;
    this.modalStack = this.modalStack.filter((x) => x !== id);
    if (!this.modalStack.length) for (const b of BEHIND_MODAL) { const el = $(b); if (el) el.inert = false; }
    const r = this._modalReturn && this._modalReturn[id];
    if (r && r.focus && document.contains(r)) r.focus({ preventScroll: true });
    this.h.onModal && this.h.onModal(this.modalStack.length > 0);
  }

  // anchor: 'facts' | 'src-N' | { facts: [ids] } (open the fact list at these facts)
  openDeep(anchor) {
    const p = this.place || {};
    $('deep-title').textContent = `${p.name_ko || ''} 깊이 읽기`;
    const parts = [];
    const names = Array.isArray(p.names) ? p.names : [];
    if (names.length) {
      parts.push('<h3>이름</h3><ul>' + names.map((n) => {
        const meta = [n.lang ? langName(n.lang) : '', n.reading_ko || ''].filter(Boolean).join(', ');
        return `<li><b${n.lang ? ` lang="${esc(n.lang)}"` : ''}>${esc(n.text)}</b>${meta ? ` <span class="muted">(${esc(meta)})</span>` : ''}${n.note_ko ? ` — ${esc(nb(n.note_ko))}` : ''}</li>`;
      }).join('') + '</ul>');
    }
    for (const sec of Array.isArray(p.deep_ko) ? p.deep_ko : []) {
      parts.push(`<h3>${esc(sec.h)}</h3>` + (Array.isArray(sec.p) ? sec.p : [sec.p]).filter(Boolean).map((t) => `<p>${esc(nb(t))}</p>`).join(''));
    }
    if (p.scale_ko) parts.push(`<div class="scale"><b>크기로 보면</b><br>${esc(nb(p.scale_ko))}</div>`);
    if (!parts.length) parts.push('<p>깊이 읽기 글이 아직 들어오지 않았습니다.</p>');
    const facts = Array.isArray(p.facts) ? p.facts : [];
    const sources = Array.isArray(p.sources) ? p.sources : [];
    const hl = anchor && typeof anchor === 'object' && Array.isArray(anchor.facts) ? new Set(anchor.facts) : null;
    if (facts.length) {
      // the fact list (with English quotes) is long: folded until asked for
      parts.push(`<details id="deep-facts-box" class="facts-box"${hl || anchor === 'facts' ? ' open' : ''}><summary id="deep-facts">사실 ${facts.length}개와 원문 보기</summary><ol>` + facts.map((f) => {
        const s = sources.find((x) => x.id === f.source);
        const n = s ? sources.indexOf(s) + 1 : null;
        return `<li id="deep-fact-${esc(f.id)}"${hl && hl.has(f.id) ? ' class="hl"' : ''}>${esc(nb(f.ko))}${n ? ` <a href="#deep-src-${n}">[${n}]</a>` : ''}${f.quote ? `<blockquote lang="${HANGUL.test(f.quote) ? 'ko' : 'en'}">${esc(f.quote)}</blockquote>` : ''}</li>`;
      }).join('') + '</ol></details>');
    }
    if (sources.length) {
      parts.push('<h3>출처</h3><ol>' + sources.map((s, i) => {
        const url = safeUrl(s.url);
        const title = url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a>` : esc(s.title);
        return `<li id="deep-src-${i + 1}">${title}${s.publisher ? ` · ${esc(s.publisher)}` : ''}${s.accessed ? ` <span class="muted">(${esc(s.accessed)} 확인)</span>` : ''}</li>`;
      }).join('') + '</ol>');
    }
    $('deep-body').innerHTML = parts.join('');
    for (const a of $('deep-body').querySelectorAll('a[href^="#deep-src-"]')) {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const t = document.getElementById(a.getAttribute('href').slice(1));
        if (t) t.scrollIntoView({ block: 'center' });
      });
    }
    this._openModal('deep');
    let target = null;
    if (hl) target = document.getElementById('deep-fact-' + [...hl][0]);
    else if (anchor === 'facts') target = $('deep-facts');
    else if (typeof anchor === 'string' && anchor.startsWith('src-')) target = document.getElementById('deep-' + anchor);
    if (target) setTimeout(() => target.scrollIntoView({ block: hl ? 'start' : 'center' }), 40);
    else $('deep-body').scrollTop = 0;
  }

  // groups: [{title, items: [{what_ko, title, author, license, license_url, url, attribution, modified_ko}]}]
  setCredits(groups) { this.creditGroups = groups; }
  openCredits() {
    const groups = this.creditGroups || [];
    const html = groups.filter((g) => g.items && g.items.length).map((g) => `<h3>${esc(g.title)}</h3><ul>` + g.items.map((c) => {
      const url = safeUrl(c.url);
      const title = c.title ? (url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(c.title)}</a>` : esc(c.title)) : '';
      const what = c.what_ko ? `<b>${esc(c.what_ko)}</b> ` : '';
      const who = c.author ? ` · ${esc(c.author)}` : '';
      const licUrl = safeUrl(c.license_url);
      const licText = esc(licenseKo(c.license));
      const lic = c.license ? (licUrl ? `<a class="lic" href="${esc(licUrl)}" target="_blank" rel="noopener noreferrer" title="${esc(c.license)}">${licText}</a>` : `<span class="lic" title="${esc(c.license)}">${licText}</span>`) : '';
      const attr = c.attribution ? `<br><span class="muted">${esc(c.attribution)}</span>` : '';
      const mod = c.modified_ko ? `<br><span class="mod">고친 점: ${esc(c.modified_ko)}</span>` : '';
      return `<li>${what}${title}${who}${lic}${attr}${mod}</li>`;
    }).join('') + '</ul>').join('');
    $('credits-body').innerHTML = html || '<p>크레딧을 불러오지 못했습니다.</p>';
    this._openModal('credits');
  }
}
