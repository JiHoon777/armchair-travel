"""Look up GNIS points for camera hints and place them in the shared local frame.

Usage:
  uv run --quiet --with numpy --with pillow python -I tools/content_coords.py [GNIS_TXT]

GNIS_TXT defaults to tools/cache/content/gnis/unz/Text/DomesticNames_AZ.txt
(USGS Geographic Names Information System, Arizona "Domestic Names" text file,
public domain). Prints feature id, class, primary lat/lon and the local frame
x/z in metres (origin lat0=36.1150, lon0=-112.1050; x east, z south).
"""
import csv
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / 'cache' / 'content' / 'gnis' / 'unz' / 'Text' / 'DomesticNames_AZ.txt'

LAT0, LON0 = 36.1150, -112.1050
WANT = ['Grandeur Point', 'Hopi Point', 'Mather Point', 'Yavapai Point', 'Bright Angel Creek',
        'Bright Angel Canyon', 'Bright Angel Point', 'Phantom Creek', 'The Tipoff', 'Plateau Point',
        'Cheops Pyramid', 'Isis Temple', 'Brahma Temple', 'Zoroaster Temple', 'Buddha Temple',
        'Sumner Point', 'Clement Powell Butte', 'Hillers Butte', 'Sturdevant Point', 'Johnson Point',
        'Schellbach Butte', 'The Box', 'Manu Temple', 'Deva Temple', "O'Neill Butte", 'Yaki Point']


def local_xz(lat, lon):
    x = (lon - LON0) * 111320 * math.cos(math.radians(LAT0))
    z = -(lat - LAT0) * 110574
    return x, z


def main():
    rows = {}
    with SRC.open(encoding='utf-8-sig', newline='') as f:
        for r in csv.DictReader(f, delimiter='|'):
            if r['feature_name'] in WANT and r['county_name'] == 'Coconino':
                rows.setdefault(r['feature_name'], []).append(r)
    for name in WANT:
        for r in rows.get(name, []):
            lat, lon = float(r['prim_lat_dec']), float(r['prim_long_dec'])
            x, z = local_xz(lat, lon)
            src = ''
            if r['source_lat_dec']:
                src = f" source(head) {float(r['source_lat_dec']):.6f},{float(r['source_long_dec']):.6f}"
            print(f"{name:22s} GNIS {r['feature_id']:>6s} {r['feature_class']:8s} {lat:.6f},{lon:.6f} "
                  f"x={x:8.0f} z={z:8.0f} map={r['map_name']}{src}")


if __name__ == '__main__':
    main()
