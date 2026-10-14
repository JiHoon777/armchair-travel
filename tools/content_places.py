"""Build site/data/places.json from the survey table (CONTENT area).

Usage:
  uv run --quiet --with numpy --with pillow python -I tools/content_places.py

Reads docs/research/03-places.json, keeps the 12 rows with tier "launch" in their
survey order, and writes one entry per place: short Korean name (the names the
approved plan uses on its map), lat/lon of the place's first viewpoint with the
source of that coordinate, the IANA time zone of that viewpoint, and status
("ready" only for grand-canyon, "soon" for the rest).
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
RESEARCH = ROOT / 'docs' / 'research' / '03-places.json'
OUT = ROOT / 'site' / 'data' / 'places.json'

# id -> (short name shown on the globe, Korean name of the first viewpoint, IANA zone of that viewpoint)
LAUNCH = {
    'grand-canyon': ('그랜드캐니언', '마더 포인트', 'America/Phoenix'),
    'moraine-lake-banff': ('모레인 호수', '록파일 전망대', 'America/Edmonton'),
    # America/Yellowknife is now a link to America/Edmonton in the IANA database.
    'yellowknife-aurora': ('옐로나이프', '파일럿 기념탑', 'America/Edmonton'),
    'salar-de-uyuni': ('우유니', '잉카와시섬', 'America/La_Paz'),
    'jungfrau-aletsch': ('융프라우', '스핑크스 전망대', 'Europe/Zurich'),
    'geirangerfjord': ('게이랑에르', '달스니바', 'Europe/Oslo'),
    # Kala Patthar, the first viewpoint, is on the Nepal side.
    'mount-everest': ('에베레스트', '칼라파타르', 'Asia/Kathmandu'),
    'ha-long-bay': ('할롱베이', '띠똡섬', 'Asia/Ho_Chi_Minh'),
    'jeju-volcanic-island': ('제주', '성산일출봉', 'Asia/Seoul'),
    'namib-sossusvlei': ('나미브', '듄 45', 'Africa/Windhoek'),
    # Danger Point is on the Zimbabwe bank.
    'victoria-falls': ('빅토리아 폭포', '데인저 포인트', 'Africa/Harare'),
    'great-barrier-reef': ('그레이트배리어리프', '힐 인렛 전망대', 'Australia/Brisbane'),
}

# English viewpoint names where the survey row holds a Korean label.
VP_EN = {'moraine-lake-banff': 'Rockpile', 'jeju-volcanic-island': 'Seongsan Ilchulbong'}

# Grand Canyon's first viewpoint is taken from the USGS GNIS file the camera hints use
# (GNIS 7771, DomesticNames_AZ 2026-09-29); the survey row has the same point via Wikidata.
OVERRIDE = {
    'grand-canyon': (36.06165, -112.107946, 'USGS GNIS 7771 Mather Point (DomesticNames_AZ, 2026-09-29); Wikidata Q49469591'),
}


def main():
    rows = [r for r in json.loads(RESEARCH.read_text(encoding='utf-8')) if r['tier'] == 'launch']
    if [r['id'] for r in rows] != list(LAUNCH):
        raise SystemExit(f'launch ids changed in the survey: {[r["id"] for r in rows]}')
    places = []
    for r in rows:
        short, vp_ko, tz = LAUNCH[r['id']]
        vp = r['viewpoints'][0]
        lat, lon, src = OVERRIDE.get(r['id'], (vp['lat'], vp['lon'], vp['coord_source']))
        places.append({
            'id': r['id'],
            'name_ko': short,
            'name_en': r['name_en'],
            'region_ko': r['country_ko'],
            'lat': lat,
            'lon': lon,
            'viewpoint_ko': vp_ko,
            'viewpoint_en': VP_EN.get(r['id'], vp['name']),
            'coord_source': src,
            'tz': tz,
            'status': 'ready' if r['id'] == 'grand-canyon' else 'soon',
        })
    OUT.parent.mkdir(parents=True, exist_ok=True)
    doc = {
        'note': 'Launch places from docs/research/03-places.json (tier launch). lat/lon = first viewpoint. '
                'Only grand-canyon has data in this prototype; the others are "soon".',
        'places': places,
    }
    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'wrote {OUT} ({len(places)} places)')


if __name__ == '__main__':
    main()
