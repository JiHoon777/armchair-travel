"""Sample the terrain DEM at the CONTENT camera hints (read-only sanity check).

Usage:
  uv run --quiet --with numpy --with pillow python -I tools/content_dem_check.py

Reads site/data/grand-canyon/terrain/meta.json and core_dem.png (written by the
TERRAIN agent; this script never writes there) and prints the ground elevation
under each camera hint in site/data/grand-canyon/place.json.
"""
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
DATA = HERE.parent / 'site' / 'data' / 'grand-canyon'


def main():
    meta = json.loads((DATA / 'terrain' / 'meta.json').read_text(encoding='utf-8'))
    place = json.loads((DATA / 'place.json').read_text(encoding='utf-8'))
    lat0, lon0 = meta['origin']['lat'], meta['origin']['lon']
    core = meta['core']
    size, n = core['size_m'], core['dem']['n']
    rgb = np.asarray(Image.open(DATA / 'terrain' / core['dem']['file']).convert('RGB'), dtype=np.float64)
    elev = rgb[..., 0] * 256 + rgb[..., 1] + rgb[..., 2] / 256 - 32768
    step = size / (n - 1)

    def sample(lat, lon):
        x = (lon - lon0) * 111320 * math.cos(math.radians(lat0))
        z = -(lat - lat0) * 110574
        c, r = (x + size / 2) / step, (z + size / 2) / step
        c0, r0 = int(math.floor(c)), int(math.floor(r))
        fc, fr = c - c0, r - r0
        e = (elev[r0, c0] * (1 - fc) * (1 - fr) + elev[r0, c0 + 1] * fc * (1 - fr)
             + elev[r0 + 1, c0] * (1 - fc) * fr + elev[r0 + 1, c0 + 1] * fc * fr)
        return x, z, e

    cam = place['camera']
    pts = [('wide_focus', cam['wide_focus']), ('approach_target', cam['approach_target']), ('stand', cam['stand']),
           ('daylapse_from', cam['daylapse_from']), ('daylapse look_at', cam['daylapse_from']['look_at'])]
    for label, p in pts:
        x, z, e = sample(p['lat'], p['lon'])
        print(f'{label:16s} x={x:7.0f} z={z:7.0f} ground {e:7.1f} m')
    # lowest point within 300 m of the approach target = river level there
    x, z, _ = sample(cam['approach_target']['lat'], cam['approach_target']['lon'])
    c, r = int((x + size / 2) / step), int((z + size / 2) / step)
    k = int(300 / step)
    win = elev[r - k:r + k + 1, c - k:c + k + 1]
    print(f'lowest ground within 300 m of approach_target: {win.min():.1f} m')
    print(f'core DEM range {elev.min():.1f} .. {elev.max():.1f} m')


if __name__ == '__main__':
    main()
