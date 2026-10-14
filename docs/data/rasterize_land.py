"""Rasterize Natural Earth 110m land polygons to a pixel map (strings of 'l' / '.')."""
import json, sys

src, out, step = sys.argv[1], sys.argv[2], float(sys.argv[3])
LAT_TOP, LAT_BOT = 84.0, -58.0

g = json.load(open(src))
rings = []  # (bbox, ring) — outer rings and holes both toggle (even-odd)
for f in g['features']:
    geom = f['geometry']
    polys = [geom['coordinates']] if geom['type'] == 'Polygon' else geom['coordinates']
    for poly in polys:
        for ring in poly:
            xs = [p[0] for p in ring]; ys = [p[1] for p in ring]
            rings.append(((min(xs), min(ys), max(xs), max(ys)), ring))

def inside(x, y):
    hit = False
    for (x0, y0, x1, y1), ring in rings:
        if x < x0 or x > x1 or y < y0 or y > y1:
            continue
        n = len(ring)
        j = n - 1
        for i in range(n):
            xi, yi = ring[i]; xj, yj = ring[j]
            if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
                hit = not hit
            j = i
    return hit

cols = int(round(360 / step))
rows = int(round((LAT_TOP - LAT_BOT) / step))
grid = []
for r in range(rows):
    lat = LAT_TOP - (r + 0.5) * step
    line = ''.join('l' if inside(-180 + (c + 0.5) * step, lat) else '.' for c in range(cols))
    grid.append(line)
json.dump({'step': step, 'lat_top': LAT_TOP, 'lat_bot': LAT_BOT, 'cols': cols, 'rows': rows, 'map': grid}, open(out, 'w'))
print(cols, rows, sum(l.count('l') for l in grid))
for line in grid[::3]:
    print(line[::2])
