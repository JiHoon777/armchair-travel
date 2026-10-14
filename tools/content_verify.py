"""Check the CONTENT data files against the data contract and the cached sources.

Usage:
  uv run --quiet --with numpy --with pillow python -I tools/content_verify.py [PLACE_JSON]

Checks (exit code 1 when any ERROR is printed):
  * place.json has the contract keys, the five scenes in order, three cards.
  * every fact has a source and a quote, and the quote is found verbatim
    (after whitespace / quote-mark normalisation) in the cached source text
    (tools/cache/content/text/<name>.txt, see tools/content_sources.json).
  * every fact id used by scenes, cards, narration, deep read, names and scale exists,
    and every fact is used somewhere (unused facts are a WARNING).
  * every number written in the Korean copy appears in some fact's "ko" text.
  * lengths (characters, spaces included): caption 40-60, card 250-350,
    narration 600-650 in 6-10 sentences, deep read 1,500-2,500 in 3-5 sections.
  * style: every sentence ends in "니다." and banned words are absent.
  * camera hints sit inside the 20 km core and match the GNIS file;
    the day-lapse look_at is 8-10 km away towards the north-east.
  * places.json: the 12 launch places of docs/research/03-places.json,
    valid IANA zones, status "ready" only for grand-canyon.
"""
import csv
import json
import math
import re
import sys
import unicodedata
from pathlib import Path
from zoneinfo import ZoneInfo

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
PLACE = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'site' / 'data' / 'grand-canyon' / 'place.json'
PLACES = ROOT / 'site' / 'data' / 'places.json'
RESEARCH = ROOT / 'docs' / 'research' / '03-places.json'
TEXT = HERE / 'cache' / 'content' / 'text'
SRCMAP = HERE / 'content_sources.json'
GNIS = HERE / 'cache' / 'content' / 'gnis' / 'unz' / 'Text' / 'DomesticNames_AZ.txt'

LAT0, LON0 = 36.1150, -112.1050
SCENES = [('descend', 30), ('wide', 180), ('approach', 180), ('stand', 180), ('daylapse', 180)]
BANNED = ['발견', '치유', '힐링', '명상', '테라피', '스트레스', '인디언']

errors, warnings = [], []


def err(msg):
    errors.append(msg)
    print('ERROR  ', msg)


def warn(msg):
    warnings.append(msg)
    print('WARN   ', msg)


def norm(s):
    s = unicodedata.normalize('NFC', s)
    for a, b in (('’', "'"), ('‘', "'"), ('“', '"'), ('”', '"'),
                 ('–', '-'), ('—', '-'), (' ', ' '), ('−', '-')):
        s = s.replace(a, b)
    return re.sub(r'\s+', ' ', s).strip()


def sentences(text):
    return [s for s in re.split(r'(?<=[.?!])\s+', text.strip()) if s]


def nchars(s):
    return len(s), len(re.sub(r'\s', '', s))


def check_style(label, text):
    for s in sentences(text):
        if not re.search(r'니다\.[」’”)]*$', s):
            err(f'{label}: sentence does not end in 니다. -> {s[:40]}…')
    for w in BANNED:
        if w in text:
            err(f'{label}: banned word {w!r}')


def local_xz(lat, lon):
    return (lon - LON0) * 111320 * math.cos(math.radians(LAT0)), -(lat - LAT0) * 110574


def load_gnis():
    out = {}
    if not GNIS.exists():
        warn('GNIS file missing, coordinate cross-check skipped')
        return out
    with GNIS.open(encoding='utf-8-sig', newline='') as f:
        for r in csv.DictReader(f, delimiter='|'):
            out[r['feature_id']] = (r['feature_name'], float(r['prim_lat_dec']), float(r['prim_long_dec']))
    return out


def check_place():
    p = json.loads(PLACE.read_text(encoding='utf-8'))
    for k in ('id', 'name_ko', 'name_en', 'region_ko', 'tz', 'lat', 'lon', 'names', 'camera', 'scenes', 'cards',
              'narration_ko', 'deep_ko', 'scale_ko', 'facts', 'sources'):
        if k not in p:
            err(f'place.json: missing key {k}')
    ZoneInfo(p['tz'])

    # sources and quotes
    srcmap = json.loads(SRCMAP.read_text(encoding='utf-8'))['sources']
    sources = {s['id']: s for s in p['sources']}
    for s in p['sources']:
        for k in ('id', 'title', 'publisher', 'url', 'accessed'):
            if not s.get(k):
                err(f'source {s.get("id")}: missing {k}')
        if s['url'] not in srcmap:
            err(f'source {s["id"]}: url not in content_sources.json')
    texts = {}
    facts = {}
    for f in p['facts']:
        fid = f.get('id')
        if fid in facts:
            err(f'fact {fid}: duplicate id')
        facts[fid] = f
        for k in ('id', 'ko', 'source', 'quote'):
            if not f.get(k):
                err(f'fact {fid}: missing {k}')
        src = sources.get(f.get('source'))
        if not src:
            err(f'fact {fid}: unknown source {f.get("source")}')
            continue
        name = srcmap.get(src['url'])
        path = TEXT / f'{name}.txt'
        if name not in texts:
            texts[name] = norm(path.read_text(encoding='utf-8')) if path.exists() else None
        if texts[name] is None:
            err(f'fact {fid}: cached text {path.name} missing')
        elif norm(f['quote']) not in texts[name]:
            err(f'fact {fid}: quote not found in {path.name}: {f["quote"][:70]}…')
    print(f'facts: {len(facts)}, sources: {len(sources)}, quotes checked against {len(texts)} cached texts')

    used = set()

    def use(label, ids):
        for i in ids or []:
            if i not in facts:
                err(f'{label}: unknown fact id {i}')
            used.add(i)

    # names
    for n in p['names']:
        for k in ('lang', 'text', 'note_ko'):
            if not n.get(k):
                err(f'names: missing {k}')
        use('names', n.get('fact_ids'))

    # scenes
    ids = [(s['id'], s['dur_s']) for s in p['scenes']]
    if ids != SCENES:
        err(f'scenes: expected {SCENES}, got {ids}')
    for s in p['scenes']:
        c, cn = nchars(s['caption_ko'])
        ok = 40 <= c <= 60
        print(f'caption {s["id"]:9s} {c:3d} chars ({cn} without spaces) {"ok" if ok else "OUT OF RANGE"}')
        if not ok:
            err(f'caption {s["id"]}: {c} chars')
        check_style(f'caption {s["id"]}', s['caption_ko'])
        use(f'scene {s["id"]}', s.get('fact_ids'))

    # cards
    if len(p['cards']) != 3:
        err('cards: need exactly 3')
    for i, cd in enumerate(p['cards'], 1):
        c, cn = nchars(cd['body_ko'])
        ok = 250 <= c <= 350
        print(f'card {i} {cd["title_ko"]!r}: {c} chars ({cn} without spaces) {"ok" if ok else "OUT OF RANGE"}')
        if not ok:
            err(f'card {i}: {c} chars')
        check_style(f'card {i}', cd['body_ko'])
        use(f'card {i}', cd.get('fact_ids'))

    # narration
    nar = p['narration_ko']
    total = ' '.join(nar)
    c, cn = nchars(total)
    ok = 600 <= c <= 650 and 6 <= len(nar) <= 10
    print(f'narration: {len(nar)} sentences, {c} chars ({cn} without spaces) {"ok" if ok else "OUT OF RANGE"}')
    if not ok:
        err(f'narration: {len(nar)} sentences, {c} chars')
    for s in nar:
        if len(sentences(s)) != 1:
            err(f'narration item holds more than one sentence: {s[:40]}…')
    check_style('narration', total)
    use('narration', p.get('narration_fact_ids'))

    # deep read
    deep = p['deep_ko']
    dtotal = sum(len(sec['h']) + sum(len(x) for x in sec['p']) for sec in deep)
    dtotal_p = sum(sum(len(x) for x in sec['p']) for sec in deep)
    ok = 1500 <= dtotal <= 2500 and 3 <= len(deep) <= 5
    print(f'deep read: {len(deep)} sections, {dtotal} chars incl. headings ({dtotal_p} body) {"ok" if ok else "OUT OF RANGE"}')
    if not ok:
        err(f'deep read: {len(deep)} sections, {dtotal} chars')
    for sec in deep:
        for para in sec['p']:
            check_style(f'deep {sec["h"]}', para)
        use(f'deep {sec["h"]}', sec.get('fact_ids'))

    # scale
    check_style('scale', p['scale_ko'])
    use('scale', p.get('scale_fact_ids'))
    print(f'scale: {nchars(p["scale_ko"])[0]} chars')

    for fid in facts:
        if fid not in used:
            warn(f'fact {fid} is not referenced by any layer')

    # numbers in copy must appear in some fact's ko text
    fact_ko = ' '.join(norm(f['ko']) for f in p['facts'])
    blocks = [('caption ' + s['id'], s['caption_ko']) for s in p['scenes']]
    blocks += [(f'card {i}', cd['body_ko']) for i, cd in enumerate(p['cards'], 1)]
    blocks += [('narration', total), ('scale', p['scale_ko'])]
    blocks += [(f'deep {sec["h"]}', ' '.join(sec['p'])) for sec in deep]
    for label, text in blocks:
        for tok in re.findall(r'\d[\d,]*(?:\.\d+)?', text):
            if tok not in fact_ko:
                err(f'{label}: number {tok} does not appear in any fact')

    # camera hints
    gnis = load_gnis()
    cam = p['camera']
    pts = [('wide_focus', cam['wide_focus']), ('approach_target', cam['approach_target']), ('stand', cam['stand']),
           ('daylapse_from', cam['daylapse_from']), ('daylapse look_at', cam['daylapse_from']['look_at'])]
    for label, pt in pts:
        x, z = local_xz(pt['lat'], pt['lon'])
        inside = abs(x) <= 10000 and abs(z) <= 10000
        print(f'camera {label:16s} {pt["lat"]:.6f},{pt["lon"]:.6f} x={x:7.0f} z={z:7.0f} {"core" if inside else "OUTSIDE CORE"}')
        if not inside:
            err(f'camera {label}: outside the 20 km core')
        m = re.search(r'GNIS (\d+)', pt.get('coord_source', ''))
        if not m:
            err(f'camera {label}: coord_source must name a GNIS feature id')
        elif gnis:
            g = gnis.get(m.group(1))
            if not g:
                err(f'camera {label}: GNIS {m.group(1)} not in the GNIS file')
            elif 'snapped' in pt.get('coord_source', ''):
                # a GNIS point moved onto the rim with the DEM; the move must stay small and be documented
                gx, gz = local_xz(g[1], g[2])
                moved = math.hypot(x - gx, z - gz)
                print(f'       {label} snapped {moved:.0f} m from GNIS {m.group(1)}')
                if moved > 300:
                    err(f'camera {label}: snapped {moved:.0f} m from GNIS {m.group(1)} (max 300 m)')
            elif abs(g[1] - pt['lat']) > 1e-5 or abs(g[2] - pt['lon']) > 1e-5:
                err(f'camera {label}: does not match GNIS {m.group(1)} {g}')
    a, b = cam['daylapse_from'], cam['daylapse_from']['look_at']
    ax, az = local_xz(a['lat'], a['lon'])
    bx, bz = local_xz(b['lat'], b['lon'])
    dist = math.hypot(bx - ax, bz - az)
    bearing = math.degrees(math.atan2(bx - ax, -(bz - az))) % 360
    print(f'daylapse look_at: {dist / 1000:.2f} km at bearing {bearing:.0f}°')
    if not (8000 <= dist <= 10000 and 15 <= bearing <= 75):
        err('daylapse look_at should be 8-10 km to the north-east')


def check_places():
    data = json.loads(PLACES.read_text(encoding='utf-8'))
    research = [r for r in json.loads(RESEARCH.read_text(encoding='utf-8')) if r['tier'] == 'launch']
    rows = data['places']
    if [r['id'] for r in rows] != [r['id'] for r in research]:
        err('places.json: ids/order differ from the research launch list')
    for r, src in zip(rows, research):
        for k in ('id', 'name_ko', 'lat', 'lon', 'tz', 'status'):
            if k not in r:
                err(f'places.json {r.get("id")}: missing {k}')
        try:
            ZoneInfo(r['tz'])
        except Exception as e:  # noqa: BLE001
            err(f'places.json {r["id"]}: bad tz {r["tz"]} ({e})')
        want = 'ready' if r['id'] == 'grand-canyon' else 'soon'
        if r['status'] != want:
            err(f'places.json {r["id"]}: status {r["status"]}, want {want}')
        vp = src['viewpoints'][0]
        tol = 2e-3 if r['id'] == 'grand-canyon' else 1e-6
        if abs(vp['lat'] - r['lat']) > tol or abs(vp['lon'] - r['lon']) > tol:
            err(f'places.json {r["id"]}: lat/lon differ from first viewpoint {vp["name"]}')
        print(f'place {r["id"]:22s} {r["name_ko"]:10s} {r["tz"]:20s} {r["status"]:5s} {r["lat"]:.5f},{r["lon"]:.5f}')


def main():
    check_place()
    check_places()
    print(f'\n{len(errors)} errors, {len(warnings)} warnings')
    sys.exit(1 if errors else 0)


if __name__ == '__main__':
    main()
