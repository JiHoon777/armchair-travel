"""Cross-check the camera hints of place.json against GNIS, Wikidata and OSM (CONTENT VERIFICATION area).

Usage:
  uv run --quiet --with numpy --with pillow python -I tools/verify_coords.py

Reads only cached data (downloaded 2026-10-13, untrusted, parsed as data):
  tools/cache/content/gnis/unz/Text/DomesticNames_AZ.txt   USGS GNIS (public domain)
  tools/cache/verify/wikidata/gnis_items.json, Q49019925.json   Wikidata (CC0)
  tools/cache/verify/osm/gc_points.json   OpenStreetMap (ODbL; used here only to check, never shipped)
and samples the TERRAIN core DEM (site/data/grand-canyon/terrain/core_dem.png, read only).
"""
import csv
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
PLACE = ROOT / 'site' / 'data' / 'grand-canyon' / 'place.json'
TERRAIN = ROOT / 'site' / 'data' / 'grand-canyon' / 'terrain'
GNIS = HERE / 'cache' / 'content' / 'gnis' / 'unz' / 'Text' / 'DomesticNames_AZ.txt'
WD = HERE / 'cache' / 'verify' / 'wikidata'
OSM = HERE / 'cache' / 'verify' / 'osm' / 'gc_points.json'
LAT0, LON0 = 36.1150, -112.1050


def xz(lat, lon):
    return (lon - LON0) * 111320 * math.cos(math.radians(LAT0)), -(lat - LAT0) * 110574


def dist(a, b):
    ax, az = xz(*a)
    bx, bz = xz(*b)
    return math.hypot(ax - bx, az - bz)


def load_dem():
    meta = json.loads((TERRAIN / 'meta.json').read_text(encoding='utf-8'))
    core = meta['core']
    img = np.asarray(Image.open(TERRAIN / core['dem']['file']).convert('RGB')).astype(np.float64)
    h = img[..., 0] * 256 + img[..., 1] + img[..., 2] / 256 - 32768
    return h, core['size_m'], core['dem']['n']


def sample(dem, lat, lon):
    h, size, n = dem
    x, z = xz(lat, lon)
    c = (x + size / 2) / size * (n - 1)
    r = (z + size / 2) / size * (n - 1)
    c0, r0 = int(math.floor(c)), int(math.floor(r))
    fc, fr = c - c0, r - r0
    v = (h[r0, c0] * (1 - fc) * (1 - fr) + h[r0, c0 + 1] * fc * (1 - fr)
         + h[r0 + 1, c0] * (1 - fc) * fr + h[r0 + 1, c0 + 1] * fc * fr)
    # highest ground within 150 m, to tell a rim point from a slope point
    k = int(150 / (size / (n - 1)))
    win = h[max(0, r0 - k):r0 + k + 2, max(0, c0 - k):c0 + k + 2]
    return v, float(win.max()), float(win.min())


def main():
    p = json.loads(PLACE.read_text(encoding='utf-8'))
    cam = p['camera']
    pts = [
        ('place (Mather Point)', p['lat'], p['lon'], '7771', 'Mather Point'),
        ('wide_focus', cam['wide_focus']['lat'], cam['wide_focus']['lon'], '2788', 'Cheops Pyramid'),
        ('approach_target', cam['approach_target']['lat'], cam['approach_target']['lon'], '1962', None),
        ('stand', cam['stand']['lat'], cam['stand']['lon'], '5229', 'Grandeur Point'),
        ('daylapse_from', cam['daylapse_from']['lat'], cam['daylapse_from']['lon'], '5933', 'Hopi Point'),
        ('daylapse look_at', cam['daylapse_from']['look_at']['lat'], cam['daylapse_from']['look_at']['lon'], '6477',
         'Johnson Point'),
    ]
    gnis = {}
    with GNIS.open(encoding='utf-8-sig', newline='') as f:
        for r in csv.DictReader(f, delimiter='|'):
            gnis[r['feature_id']] = (r['feature_name'], float(r['prim_lat_dec']), float(r['prim_long_dec']))
    wd = {}
    for b in json.loads((WD / 'gnis_items.json').read_text(encoding='utf-8'))['results']['bindings']:
        if 'coord' in b:
            lon, lat = map(float, b['coord']['value'][6:-1].split())
            wd.setdefault(b['gnis']['value'], []).append((lat, lon))
    e = list(json.loads((WD / 'Q49019925.json').read_text(encoding='utf-8'))['entities'].values())[0]
    v = e['claims']['P625'][0]['mainsnak']['datavalue']['value']
    wd['2788'] = [(v['latitude'], v['longitude'])]
    osm = {}
    for el in json.loads(OSM.read_text(encoding='utf-8'))['elements']:
        t = el['tags']
        if el['type'] == 'node' and (t.get('tourism') == 'viewpoint' or t.get('natural')):
            osm.setdefault(t['name'], []).append((el['lat'], el['lon'], t.get('tourism') or t.get('natural')))
    dem = load_dem()
    print(f'{"point":20s} {"lat,lon":24s} {"GNIS":>8s} {"Wikidata":>18s} {"OSM":>16s}  DEM here / max150 / min150')
    for label, lat, lon, gid, oname in pts:
        g = gnis[gid]
        dg = dist((lat, lon), g[1:])
        dw = ', '.join(f'{dist((lat, lon), w):.0f}' for w in wd.get(gid, [])) or '-'
        do = ', '.join(f'{dist((lat, lon), o[:2]):.0f}({o[2][:4]})' for o in osm.get(oname, [])) if oname else '-'
        here, hi, lo = sample(dem, lat, lon)
        print(f'{label:20s} {lat:.6f},{lon:.6f} {dg:7.0f}m {dw:>17s}m {do:>16s}  {here:7.0f} / {hi:5.0f} / {lo:5.0f}')
    g = gnis['5933']
    here, hi, lo = sample(dem, g[1], g[2])
    print(f'{"GNIS 5933 Hopi Point":20s} {g[1]:.6f},{g[2]:.6f}  DEM here {here:.0f} m (max within 150 m {hi:.0f}, min {lo:.0f})')


if __name__ == '__main__':
    main()
