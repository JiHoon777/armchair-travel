#!/usr/bin/env python3
"""Build armchair/docs/plan.html from the deeper ELI5 template (CSS + sprite renderer + depth meter).

python3 build_plan.py  ->  plan.html (publish the same path again after edits)
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from sprites import sprite_table, check  # noqa: E402
import scenes as S  # noqa: E402
import content as C  # noqa: E402

TPL = Path('/Users/jihoon/jihoons/odcode/deeper/docs/idea1-ocean.html')
OUT = HERE / 'plan.html'
lines = TPL.read_text(encoding='utf-8').split('\n')
head = '\n'.join(lines[:425])          # head + common CSS (before page-specific block)
tail = '\n'.join(lines[1290:])         # from "function paint" to end of script
assert tail.lstrip().startswith('function paint'), tail[:80]

head = head.replace('<title>거꾸로 수족관</title>', f'<title>{C.TITLE}</title>')
OLD_FONTS = 'family=Do+Hyeon&amp;family=Gowun+Dodum&amp;family=IBM+Plex+Mono:wght@400;600&amp;family=Jua&amp;display=swap'
NEW_FONTS = 'family=Do+Hyeon&amp;family=Gowun+Batang:wght@400;700&amp;family=Gowun+Dodum&amp;family=IBM+Plex+Mono:wght@400;600&amp;display=swap'
assert OLD_FONTS in head
head = head.replace(OLD_FONTS, NEW_FONTS)
tok_start = head.index('  /* ---- 페이지 토큰')
tok_end = head.index('  /* ---- 공통 토큰')
TOKENS = '''  /* ---- 페이지 토큰 (집에서 세계 여행) ----
     우주에서 지구로 내려와 땅속 지층까지 간다. 위는 밤하늘, 가운데는 새벽과 한낮,
     아래는 그랜드캐니언 지층 색이다. band 0·1·6·7·8은 data-ink="light", 2~5는 "dark". */
  --band-0: #0B1026;  /* 우주 */
  --band-1: #1D2B5E;  /* 성층권 */
  --band-2: #F0B18C;  /* 새벽 구름 */
  --band-3: #CFE8F4;  /* 한낮 하늘 */
  --band-4: #B9D7AE;  /* 숲과 초원 */
  --band-5: #E3B48A;  /* 카이밥 석회암 위 모래 */
  --band-6: #8E4532;  /* 붉은 사암 */
  --band-7: #4A2C2E;  /* 오래된 바위 */
  --band-8: #17111C;  /* 비슈누 편암 */
  --ink-light: #F3EEE6;
  --ink-dark: #1A1D2B;
  --accent: #FF7A45;   /* 해 뜨는 빛 */
  --accent-2: #FFD35C; /* 해 */
  --glow: #7CF5C8;     /* 오로라 */
  --display-font: "Gowun Batang";
  --label-font: "Do Hyeon";

'''
head = head[:tok_start] + TOKENS + head[tok_end:]

PAGE_CSS = r'''
/* =====================================================================
   이 페이지 전용 (집에서 세계 여행)
   그림 재료 색은 scenes.py에 있다. 레이아웃은 템플릿 컴포넌트를 쓰고 부족한 것만 더한다.
   ===================================================================== */
:root { --map-land: #A8C99A; }
.sec-title, .hero-title, .step-title, .gear-name { font-weight: 700; }
.hero-title { letter-spacing: -0.01em; }
.hero-en { font-family: var(--font-label); font-size: clamp(1.1rem, 0.9rem + 0.8vw, 1.5rem); letter-spacing: 0.08em; opacity: 0.85; }
.hero-meta { display: flex; flex-wrap: wrap; gap: 6px 18px; font-family: var(--font-label); font-size: 1.05rem; }
.hero-meta span { padding: 2px 10px; border: 2px solid color-mix(in oklab, var(--ink) 45%, transparent); }
.pic--globe > svg { max-width: 540px; margin-inline: auto; }
.note { font-size: 1.02rem; max-width: 70ch; }
.c-dim { font-family: var(--font-label); font-size: 0.95rem; opacity: 0.78; }
.ok { display: inline-block; padding: 0 8px; font-family: var(--font-label); font-size: 0.9rem; line-height: 1.6;
      background: var(--accent-2); color: var(--ink-dark); white-space: nowrap; }
.no { display: inline-block; padding: 0 8px; font-family: var(--font-label); font-size: 0.9rem; line-height: 1.6;
      border: 2px solid currentColor; white-space: nowrap; }

/* 그림 속 글자 */
.pos-axis { font-family: var(--font-label); font-size: 20px; fill: currentColor; }
.pos-gap { font-family: var(--font-label); font-size: 24px; fill: var(--accent-2); }
.pos-name { font-family: var(--font-body); font-size: 16px; fill: currentColor; }
.pos-us { font-family: var(--font-display); font-weight: 700; font-size: 24px; fill: var(--accent); }
.cc-num { font-family: var(--font-mono); font-weight: 600; font-size: 14px; fill: #1A1D2B; }
.scr-pin { font-family: var(--font-label); font-size: 17px; fill: #FFD35C; }
.scr-h { font-family: var(--font-display); font-weight: 700; font-size: 26px; fill: #F3EEE6; }
.scr-b { font-family: var(--font-label); font-size: 20px; fill: #F3EEE6; }
.scr-s { font-family: var(--font-body); font-size: 14px; fill: #C9D3EA; }
.scr-btn { font-family: var(--font-label); font-size: 20px; fill: #1A1D2B; }
.scr-btn2 { font-family: var(--font-label); font-size: 18px; fill: #F3EEE6; }
.scr-chip { font-family: var(--font-label); font-size: 17px; fill: #F3EEE6; }
.scr-cap { font-family: var(--font-body); font-size: 19px; fill: #FFFFFF; }
.card-h { font-family: var(--font-display); font-weight: 700; font-size: 22px; fill: #1A1D2B; }
.card-s { font-family: var(--font-label); font-size: 14px; fill: #5B5F70; }
.card-btn, .card-btn2 { font-family: var(--font-label); font-size: 16px; fill: #1A1D2B; }
.card-xs { font-family: var(--font-body); font-size: 11px; fill: #5B5F70; }
.st-name { font-family: var(--font-display); font-weight: 700; font-size: 24px; }
.st-size { font-family: var(--font-mono); font-weight: 600; font-size: 17px; }
.st-when { font-family: var(--font-label); font-size: 16px; }
.stk-label { font-family: var(--font-label); font-size: 17px; fill: #FFFFFF; paint-order: stroke; stroke: #1A1D2B; stroke-width: 4px; stroke-linejoin: round; }
.cb-name { font-family: var(--font-label); font-size: 17px; fill: currentColor; }
.cb-val { font-family: var(--font-mono); font-weight: 600; font-size: 15px; fill: currentColor; }
.wm-name { font-family: var(--font-label); font-size: 15px; fill: var(--ink-dark); paint-order: stroke; stroke: var(--bg); stroke-width: 5px; stroke-linejoin: round; }

/* 두 칸 */
.two { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--s-6); align-items: start; }
.given { display: grid; gap: var(--s-3); align-content: start; }
.given h3 { font-family: var(--font-display); font-weight: 700; font-size: var(--fs-h3); }
.given .short li { font-size: 1.05rem; }
@media (max-width: 799.98px) { .two { grid-template-columns: minmax(0, 1fr); } }

/* 띠 안의 칸은 줄어들 수 있어야 한다(넓은 그림·표가 페이지를 밀지 않게) */
.inner > *, .given > * { min-width: 0; }
/* 큰 그림: 좁은 화면에서는 글자가 읽히는 폭을 지키고 그림 안에서 옆으로 민다 */
.pic--wide, .pic--plain { grid-template-columns: minmax(0, 1fr); }
.pic-scroll { overflow-x: auto; }
.pic-scroll > svg { display: block; width: 100%; height: auto; }
.pic--wide .pic-scroll > svg { max-width: 980px; min-width: 600px; }
.pic--plain .pic-scroll > svg { min-width: 640px; }
.chart-scroll > svg.wide { min-width: 640px; max-width: 980px; }

/* 세 안 */
.concepts { list-style: none; padding: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--s-5); }
.concept { display: grid; gap: var(--s-3); align-content: start; padding: var(--s-4);
           border: 2px solid color-mix(in oklab, var(--ink) 28%, transparent); }
.concept.is-pick { border: 4px solid var(--accent); background: color-mix(in oklab, var(--accent) 12%, transparent); }
.concept svg { display: block; width: 100%; height: auto; clip-path: var(--pixel-corners); }
.concept h3 { font-family: var(--font-display); font-weight: 700; font-size: 1.35rem; line-height: 1.25; }
.concept h3 .num { font-size: 1rem; opacity: 0.7; margin-inline-end: 6px; }
.concept .pick-tag { justify-self: start; padding: 2px 10px; font-family: var(--font-label); background: var(--accent); color: var(--ink-dark); }
.concept dl { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 6px 12px; font-size: 1rem; }
.concept dt { font-family: var(--font-label); }
@media (max-width: 899.98px) { .concepts { grid-template-columns: minmax(0, 1fr); } }

/* 장면 흐름 */
.steps--flow { --n: 5; gap: var(--s-4); }
.steps--flow .step:not(:last-child)::after { top: 58px; right: calc(-1 * var(--s-4) + 3px); width: calc(var(--s-4) - 6px); height: 16px; }
.step-pic { display: block; width: 100%; height: auto; clip-path: var(--pixel-corners); }
.step-head { display: flex; align-items: center; gap: var(--s-3); }
.steps--flow .step-title { font-size: 1.2rem; }
.step-note { font-size: 0.98rem; line-height: 1.55; }
@media (max-width: 1100px) {
  .steps--flow { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .steps--flow .step::after { display: none; }
}
@media (max-width: 719.98px) {
  .steps--flow { grid-template-columns: minmax(0, 1fr); }
  .steps--flow .step { grid-template-columns: 150px minmax(0, 1fr); column-gap: var(--s-4); row-gap: var(--s-2); align-items: start; }
  .steps--flow .step-pic { grid-column: 1; grid-row: 1 / span 3; }
  .steps--flow .step-head, .steps--flow .step-time, .steps--flow .step-note { grid-column: 2; }
}

/* 화면 네 장 */
.screens { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--s-5); }
.screens .pic--screen figcaption { font-size: 1rem; }
@media (max-width: 899.98px) { .screens { grid-template-columns: minmax(0, 1fr); } }

/* 편하게 보기 규칙 */
.rules { list-style: none; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--s-4) var(--s-6); }
.rule { display: grid; grid-template-columns: 40px minmax(0, 1fr); gap: var(--s-3); align-items: start;
        padding-block-start: var(--s-3); border-top: 2px solid color-mix(in oklab, var(--ink) 25%, transparent); }
.rule-no { width: 40px; height: 40px; display: grid; place-items: center; font-family: var(--font-mono); font-weight: 600;
           background: var(--accent); color: var(--ink-dark); clip-path: var(--pixel-corners); }
.rule-body { display: grid; gap: 4px; }
.rule h3 { font-family: var(--font-display); font-weight: 700; font-size: 1.2rem; line-height: 1.3; }
.rule p { font-size: 1rem; line-height: 1.55; }
.rule small { font-size: 0.9rem; opacity: 0.8; }
@media (max-width: 799.98px) { .rules { grid-template-columns: minmax(0, 1fr); } }

/* 장소 카드 */
.places { list-style: none; padding: 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--s-5) var(--s-4); }
.place { display: grid; gap: var(--s-2); align-content: start; }
.place-pic > svg { display: block; width: 100%; height: auto; clip-path: var(--pixel-corners); }
.place-name { font-family: var(--font-display); font-weight: 700; font-size: 1.2rem; line-height: 1.25; }
.place-meta { font-family: var(--font-label); font-size: 0.95rem; opacity: 0.8; }
.place-hook { font-size: 0.98rem; line-height: 1.55; }
.place-view { font-size: 0.92rem; line-height: 1.5; opacity: 0.9; }
@media (max-width: 1000px) { .places { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 760px) { .places { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 440px) { .places { grid-template-columns: minmax(0, 1fr); } }

/* 표 */
.tbl { overflow-x: auto; }
.tbl table { color: inherit; font-family: inherit; border-collapse: collapse; width: 100%; min-width: 40rem; font-size: 1rem; line-height: 1.5; }
.tbl th, .tbl td { text-align: left; vertical-align: top; padding: 10px 12px; border-bottom: 2px solid color-mix(in oklab, var(--ink) 22%, transparent); }
.tbl th { font-family: var(--font-label); font-weight: 400; font-size: 1.05rem; white-space: nowrap; }
.tbl td:first-child { font-family: var(--font-label); font-size: 1.08rem; white-space: nowrap; }
.tbl tr.is-pick td { background: color-mix(in oklab, var(--accent-2) 22%, transparent); }

.stats--4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
@media (max-width: 799.98px) { .stats--4 { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.stat-label small { display: block; font-family: var(--font-body); font-size: 0.92rem; opacity: 0.85; margin-block-start: 4px; }

.steps--build .step-facts { font-size: 1rem; }
.foot a { word-break: break-all; }
'''


# ---------------------------------------------------------------- page body
def section(id_, band, ink, zname, zdepth, inner, cls='band'):
    return (f'<section id="{id_}" class="{cls}" data-band="{band}" data-ink="{ink}" data-zone-name="{zname}" data-zone-depth="{zdepth}">'
            f'<div class="inner">{inner}</div></section>\n')


def head_(eyebrow, title, lede=''):
    lp = f'<p class="sec-lede">{lede}</p>' if lede else ''
    return f'<header class="sec-head"><p class="eyebrow">{eyebrow}</p><h2 class="sec-title">{title}</h2>{lp}</header>'


def table(headers, rows, label='표', pick=None):
    th = ''.join(f'<th>{h}</th>' for h in headers)
    trs = []
    for i, r in enumerate(rows):
        cls = ' class="is-pick"' if pick is not None and i in (pick if isinstance(pick, (list, tuple, set)) else [pick]) else ''
        trs.append(f'<tr{cls}>' + ''.join(f'<td>{c}</td>' for c in r) + '</tr>')
    return (f'<div class="tbl" tabindex="0" role="region" aria-label="{label}"><table><thead><tr>{th}</tr></thead>'
            f'<tbody>{"".join(trs)}</tbody></table></div>')


H = {'section': section, 'head': head_, 'table': table}
SECTIONS = C.build(S, H)


def _wrap_short(html):
    import re
    def fix_list(m):
        return re.sub(r'<li>(.*?)</li>', lambda k: k.group(0) if k.group(1).startswith('<span>') else f'<li><span>{k.group(1)}</span></li>', m.group(0), flags=re.S)
    return re.sub(r'<ul class="short">.*?</ul>', fix_list, html, flags=re.S)


SECTIONS = _wrap_short(SECTIONS)

BODY = f'''
<aside class="depthmeter" aria-label="지금 보는 곳">
  <div class="dm-rail">
    <p class="dm-plate"><span class="dm-name">{C.METER0[0]}</span><span class="dm-depth">{C.METER0[1]}</span></p>
    <span class="dm-strip" aria-hidden="true"><span class="dm-mark"></span></span>
  </div>
</aside>

<main class="descent">
{SECTIONS}
</main>
'''
BODY = BODY.replace('<section id="hero" class="band"', '<section id="hero" class="band hero"')

# ---------------------------------------------------------------- sprites
check()
maps, sprites = {}, {}
for name, (m, pal) in sprite_table().items():
    key = json.dumps(m)
    mk = next((k for k, v in maps.items() if v == key), None)
    if mk is None:
        mk = name
        maps[name] = key
    sprites[name] = f'{{ palette: {json.dumps(pal)}, map: MAPS.{mk} }}'
MAPS_JS = ('  const MAPS = {\n' + ''.join(f'    {k}: {v},\n' for k, v in maps.items()) + '  };\n'
           '  const SPRITES = {\n' + ''.join(f'    {k}: {v},\n' for k, v in sprites.items()) + '  };\n')

SCRIPT = "<script>\n(() => {\n  const NS = 'http://www.w3.org/2000/svg';\n" + MAPS_JS + '\n' + tail

html = head + '\n' + PAGE_CSS + '</style>\n' + BODY + '\n' + SCRIPT + '\n'
OUT.write_text(html, encoding='utf-8')
print(OUT, len(html))
