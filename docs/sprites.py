"""Pixel sprites for the armchair plan page.

Each map is a list of equal-width strings; '.' is transparent.
build_plan.py turns them into the template's JS sprite table.

- worldmap: Natural Earth 110m land (public domain), rasterised at 2 degrees
  by data/rasterize_land.py (lat 84N .. 58S, lon -180 .. 180).
- globe_*: orthographic pixel globe with a day/night terminator, computed here.
- small HUD icons for the screen mockups.
"""
import json
import math
from pathlib import Path

HERE = Path(__file__).resolve().parent
WORLD = json.loads((HERE / 'data' / 'worldmap_2deg.json').read_text())
STEP = WORLD['step']
LAT_TOP = WORLD['lat_top']
COLS, ROWS = WORLD['cols'], WORLD['rows']


def is_land(lat, lon):
    if lat > LAT_TOP:
        return False
    if lat < -63.5:
        return True  # Antarctic ice
    r = int((LAT_TOP - lat) // STEP)
    if r >= ROWS:
        return False
    c = int(((lon + 180.0) % 360.0) // STEP)
    return WORLD['map'][r][c] == 'l'


# ---------------------------------------------------------------- globe
GLOBE_PALETTE = {
    'o': '#3C7FCB', 'p': '#2B5C9C', 'O': '#101F40', 'q': '#3A3F72',
    'l': '#7CC383', 'm': '#5A9763', 'L': '#1F3A2C', 'u': '#8A6A5E',
    'w': '#F1F6FA', 'W': '#5D6A80', 'c': '#FFD35C', 'a': '#5E92DA', 'A': '#26355E',
}


def _sun_vec(lat, lon):
    la, lo = math.radians(lat), math.radians(lon)
    return (math.cos(la) * math.cos(lo), math.cos(la) * math.sin(lo), math.sin(la))


def globe(n, lat0, lon0, sun_lat, sun_lon):
    """n x n orthographic globe centred on (lat0, lon0), lit from the subsolar point."""
    p0, l0 = math.radians(lat0), math.radians(lon0)
    S = _sun_vec(sun_lat, sun_lon)
    half = n / 2
    rows = []
    for i in range(n):
        row = []
        for j in range(n):
            x = (j + 0.5 - half) / half
            y = (half - (i + 0.5)) / half
            rho = math.hypot(x, y)
            if rho > 1.0:
                if rho <= 1.0 + 1.6 / half:
                    # rim: lit side brighter (rough: use the limb point's lighting)
                    ang = math.atan2(x, y)
                    lat, lon = _inv(math.sin(ang) * 0.999, math.cos(ang) * 0.999, p0, l0)
                    d = _dot(lat, lon, S)
                    row.append('a' if d > -0.05 else 'A')
                else:
                    row.append('.')
                continue
            lat, lon = _inv(x, y, p0, l0)
            d = _dot(lat, lon, S)
            z = math.sqrt(max(0.0, 1 - rho * rho))
            land = is_land(lat, lon)
            ice = land and (abs(lat) > 68 or lat < -63.5)
            if d > 0.10:
                if ice:
                    ch = 'w'
                elif land:
                    ch = 'l' if z > 0.32 else 'm'
                else:
                    ch = 'o' if z > 0.32 else 'p'
            elif d > -0.10:
                ch = ('w' if ice else 'u') if land else 'q'
            else:
                if ice:
                    ch = 'W'
                elif land:
                    # sparse, deterministic city lights away from the poles
                    ch = 'c' if (abs(lat) < 58 and (i * 7 + j * 13) % 11 == 0) else 'L'
                else:
                    ch = 'O'
            row.append(ch)
        rows.append(''.join(row))
    return rows


def _inv(x, y, p0, l0):
    rho = math.hypot(x, y)
    if rho < 1e-9:
        return math.degrees(p0), math.degrees(l0)
    c = math.asin(min(1.0, rho))
    lat = math.asin(math.cos(c) * math.sin(p0) + y * math.sin(c) * math.cos(p0) / rho)
    lon = l0 + math.atan2(x * math.sin(c), rho * math.cos(c) * math.cos(p0) - y * math.sin(c) * math.sin(p0))
    lon = (math.degrees(lon) + 540) % 360 - 180
    return math.degrees(lat), lon


def _dot(lat, lon, S):
    P = _sun_vec(lat, lon)
    return P[0] * S[0] + P[1] * S[1] + P[2] * S[2]


def project(n, lat0, lon0, lat, lon):
    """forward orthographic: pixel (x, y) in the n x n sprite, or None if on the far side"""
    p0, l0 = math.radians(lat0), math.radians(lon0)
    p, l = math.radians(lat), math.radians(lon)
    cosc = math.sin(p0) * math.sin(p) + math.cos(p0) * math.cos(p) * math.cos(l - l0)
    if cosc <= 0.05:
        return None
    x = math.cos(p) * math.sin(l - l0)
    y = math.cos(p0) * math.sin(p) - math.sin(p0) * math.cos(p) * math.cos(l - l0)
    return n / 2 + x * n / 2, n / 2 - y * n / 2


# hero globe: East Asia and the Pacific at dusk; home screen globe: Atlantic side, morning
GLOBE_HERO = dict(n=112, lat0=22, lon0=118, sun_lat=-7, sun_lon=52)
GLOBE_HOME = dict(n=88, lat0=12, lon0=-40, sun_lat=-7, sun_lon=-15)

# ---------------------------------------------------------------- world map
WORLD_PALETTE = {'l': 'var(--map-land)'}

# ---------------------------------------------------------------- HUD icons (drawn in ink k / light w)
ICONS = {
    'ic_pause': [
        '.........',
        '.kk...kk.',
        '.kk...kk.',
        '.kk...kk.',
        '.kk...kk.',
        '.kk...kk.',
        '.kk...kk.',
        '.kk...kk.',
        '.........',
    ],
    'ic_sound': [
        '....k....',
        '...kk..k.',
        '.kkkk...k',
        '.kkkk.k.k',
        '.kkkk.k.k',
        '.kkkk...k',
        '...kk..k.',
        '....k....',
        '.........',
    ],
    'ic_info': [
        '..kkkkk..',
        '.k.....k.',
        'k...k...k',
        'k.......k',
        'k...k...k',
        'k...k...k',
        'k...k...k',
        '.k.....k.',
        '..kkkkk..',
    ],
    'ic_next': [
        '.........',
        '.k...k...',
        '.kk..kk..',
        '.kkk.kkk.',
        '.kkkkkkkk',
        '.kkk.kkk.',
        '.kk..kk..',
        '.k...k...',
        '.........',
    ],
    'ic_hand': [
        '...kk......',
        '..kwwk.....',
        '..kwwk.....',
        '..kwwkkk...',
        '..kwwkwwkk.',
        'kkkwwkwwkwk',
        'kwkwwwwwwwk',
        'kwwwwwwwwwk',
        '.kwwwwwwwk.',
        '..kwwwwwk..',
        '...kkkkk...',
    ],
    'ic_sun': [
        '....y....',
        '.y..y..y.',
        '..yyyyy..',
        '..yyyyy..',
        'yyyyyyyyy',
        '..yyyyy..',
        '..yyyyy..',
        '.y..y..y.',
        '....y....',
    ],
    'ic_moon': [
        '...yyy...',
        '..yyy....',
        '.yyy.....',
        '.yyy.....',
        '.yyy.....',
        '.yyy.....',
        '..yyy....',
        '...yyy...',
        '.........',
    ],
}
ICON_PALETTE_DARK = {'k': 'var(--ink-dark)', 'w': '#FFFFFF', 'y': 'var(--accent-2)'}
ICON_PALETTE_LIGHT = {'k': '#FFFFFF', 'w': 'var(--ink-dark)', 'y': 'var(--accent-2)'}


def sprite_table():
    """name -> (map, palette)"""
    t = {
        'worldmap': (WORLD['map'], WORLD_PALETTE),
        'globe_hero': (globe(**GLOBE_HERO), GLOBE_PALETTE),
        'globe_home': (globe(**GLOBE_HOME), GLOBE_PALETTE),
    }
    for k, m in ICONS.items():
        t[k] = (m, ICON_PALETTE_DARK)
        t[k + '_l'] = (m, ICON_PALETTE_LIGHT)
    return t


def size(name):
    m = sprite_table()[name][0]
    return len(m[0]), len(m)


def check():
    for name, (m, pal) in sprite_table().items():
        w = len(m[0])
        assert all(len(r) == w for r in m), name
        used = set(''.join(m)) - {'.'}
        missing = used - set(pal)
        assert not missing, (name, missing)


if __name__ == '__main__':
    check()
    for row in globe(**GLOBE_HERO)[::2]:
        print(row[::1])
