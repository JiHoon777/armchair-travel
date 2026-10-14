"""Regional globe patch for the descend (FIX, 2026-10-13).

From 1,000 km down to 100 km the 4K Blue Marble globe (about 10 km per pixel) is a blur. This cuts a
lat/lon box of about 1,200 km around northern Arizona out of the same NASA product at 500 m
(Blue Marble Next Generation with Topography and Bathymetry, October 2004, tile A1 = 180W-90W,
90N-0N, 21600 x 21600 px, 15 arc-seconds per pixel; public domain) and writes two JPEGs plus a
"region" entry in globe.json and a credits row. The app drapes it on the globe as a lat/lon patch
with feathered edges (globe.js setRegion).

Run (after `fetch_media.py globe`, which keeps an existing "region" entry):
  uv run --quiet --with numpy --with pillow python -I tools/make_globe_region.py

Input (download once, 57.7 MB):
  tools/cache/media/globe500/world.topo.bathy.200410.3x21600x21600.A1.jpg
  https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73826/world.topo.bathy.200410.3x21600x21600.A1.jpg
"""
import json
import math
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "tools/cache/media/globe500/world.topo.bathy.200410.3x21600x21600.A1.jpg"
SRC_URL = "https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73826/world.topo.bathy.200410.3x21600x21600.A1.jpg"
GLOBE = ROOT / "site/data/globe"
CREDITS = ROOT / "site/data/credits/media.json"

# tile A1 geometry
TILE_LON0, TILE_LAT0, PX_PER_DEG = -180.0, 90.0, 240.0  # 21600 px / 90 deg
# box: 1,200 km on a side around the place (Mather Point), in whole source pixels
CENTER = (36.0617, -112.1081)
HALF_KM = 600.0
OUT = [("region_sw_2k.jpg", 2400), ("region_sw_1k.jpg", 1200)]


def main():
    if not SRC.exists():
        sys.exit(f"missing {SRC}\n  download: {SRC_URL}")
    lat_c, lon_c = CENTER
    dlat = HALF_KM / 111.0
    dlon = HALF_KM / (111.32 * math.cos(math.radians(lat_c)))
    col0 = math.floor((lon_c - dlon - TILE_LON0) * PX_PER_DEG)
    col1 = math.ceil((lon_c + dlon - TILE_LON0) * PX_PER_DEG)
    row0 = math.floor((TILE_LAT0 - (lat_c + dlat)) * PX_PER_DEG)
    row1 = math.ceil((TILE_LAT0 - (lat_c - dlat)) * PX_PER_DEG)
    # edges of the cut, in degrees (pixel edges, not centres)
    lon_left = TILE_LON0 + col0 / PX_PER_DEG
    lon_right = TILE_LON0 + col1 / PX_PER_DEG
    lat_top = TILE_LAT0 - row0 / PX_PER_DEG
    lat_bottom = TILE_LAT0 - row1 / PX_PER_DEG
    print(f"cut cols {col0}..{col1}, rows {row0}..{row1}: lon {lon_left:.4f}..{lon_right:.4f}, lat {lat_bottom:.4f}..{lat_top:.4f}")

    Image.MAX_IMAGE_PIXELS = None  # the tile is 21600 x 21600 (decoded once, about 1.4 GB)
    with Image.open(SRC) as im:
        assert im.size == (21600, 21600), im.size
        cut = im.convert("RGB").crop((col0, row0, col1, row1))
    cut.load()
    w0, h0 = cut.size
    print("cut", cut.size)
    files = {}
    for name, w in OUT:
        h = round(w * h0 / w0)
        cut.resize((w, h), Image.LANCZOS).save(GLOBE / name, "JPEG", quality=84, optimize=True, progressive=False)
        files[name] = (w, h, (GLOBE / name).stat().st_size)
        print(f"wrote {name} {w}x{h} {files[name][2] / 1024:.0f} KB")

    gj_path = GLOBE / "globe.json"
    gj = json.loads(gj_path.read_text())
    gj["region"] = {
        "file": OUT[0][0], "mobile": OUT[1][0],
        "width": files[OUT[0][0]][0], "height": files[OUT[0][0]][1],
        "lon_left_deg": round(lon_left, 6), "lon_right_deg": round(lon_right, 6),
        "lat_top_deg": round(lat_top, 6), "lat_bottom_deg": round(lat_bottom, 6),
        "projection": "equirectangular (plate carree), row 0 = north",
        "note": "Same Blue Marble NG October 2004 product as the day globe, cut from the 500 m tile A1; shown during the descend between about 5,000 km and the 100 km aerial patch.",
        "source_url": SRC_URL,
    }
    gj_path.write_text(json.dumps(gj, ensure_ascii=False, indent=1) + "\n")
    print("globe.json region entry written")

    rows = json.loads(CREDITS.read_text())
    row = {
        "what_ko": "지구본 확대 패치 (미국 남서부, 500 m, 2004년 10월 합성)",
        "title": "Blue Marble: Next Generation with Topography and Bathymetry, October 2004 — 500 m tile A1 (180W-90W, 90N-0N)",
        "author": "NASA Earth Observatory (Reto Stöckli)",
        "license": "Public domain (U.S. Government work, NASA)",
        "url": SRC_URL,
        "attribution": "NASA Earth Observatory, Blue Marble: Next Generation (Reto Stöckli)",
        "notes": "NASA imagery is generally not subject to copyright in the United States; credit NASA and do not imply NASA endorsement.",
        "modified_ko": f"북위 {lat_bottom:.1f}~{lat_top:.1f}°, 서경 {-lon_right:.1f}~{-lon_left:.1f}° 부분을 잘라 {OUT[0][1]}·{OUT[1][1]} px 너비로 줄였습니다.",
        "accessed": "2026-10-13",
    }
    rows = [r for r in rows if r.get("url") != SRC_URL]
    # right after the two globe rows
    idx = max([i for i, r in enumerate(rows) if "지구본" in r.get("what_ko", "")] or [-1]) + 1
    rows.insert(idx, row)
    CREDITS.write_text(json.dumps(rows, ensure_ascii=False, indent=1) + "\n")
    print("credits row written")


if __name__ == "__main__":
    main()
