"""SVG pictures for the armchair plan page (pictures only; copy lives in content.py).

All landscapes are drawn in a 320 x 200 box and nested into bigger pictures
with <svg x y width height viewBox="0 0 320 200">. Colours are literal on
purpose: the page is one visual world (no light/dark switch).
"""
import math

from sprites import GLOBE_HERO, GLOBE_HOME, project, size as sprite_size

_n = [0]


def uid(p):
    _n[0] += 1
    return f'{p}{_n[0]}'


# ---------------------------------------------------------------- primitives
def _a(extra):
    return f' {extra}' if extra else ''


def R(x, y, w, h, fill, extra=''):
    return f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" fill="{fill}"{_a(extra)}></rect>'


def P(pts, fill, extra=''):
    s = ' '.join(f'{x:.1f},{y:.1f}' for x, y in pts)
    return f'<polygon points="{s}" fill="{fill}"{_a(extra)}></polygon>'


def PATH(d, fill='none', extra=''):
    return f'<path d="{d}" fill="{fill}"{_a(extra)}></path>'


def C(cx, cy, r, fill, extra=''):
    return f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" fill="{fill}"{_a(extra)}></circle>'


def E(cx, cy, rx, ry, fill, extra=''):
    return f'<ellipse cx="{cx:.1f}" cy="{cy:.1f}" rx="{rx:.1f}" ry="{ry:.1f}" fill="{fill}"{_a(extra)}></ellipse>'


def L(x1, y1, x2, y2, stroke, w=2, extra=''):
    return (f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{stroke}" '
            f'stroke-width="{w}"{_a(extra)}></line>')


def T(x, y, s, cls, anchor='start', extra=''):
    return f'<text class="{cls}" x="{x:.1f}" y="{y:.1f}" text-anchor="{anchor}"{_a(extra)}>{s}</text>'


def G(body, extra=''):
    return f'<g{_a(extra)}>{body}</g>'


def grad(gid, stops, vertical=True):
    x2, y2 = ('0', '1') if vertical else ('1', '0')
    s = ''.join(f'<stop offset="{o}" stop-color="{c}"></stop>' for o, c in stops)
    return f'<linearGradient id="{gid}" x1="0" y1="0" x2="{x2}" y2="{y2}">{s}</linearGradient>'


def defs(*items):
    return '<defs>' + ''.join(items) + '</defs>'


def sprite(name, x, y, s):
    return f'<g data-sprite="{name}" transform="translate({x:.1f} {y:.1f}) scale({s})"></g>'


def svg(vb, label, body, cls=''):
    w, h = vb
    c = f' class="{cls}"' if cls else ''
    return (f'<svg{c} viewBox="0 0 {w} {h}" role="img" aria-label="{label}" '
            f'xmlns="http://www.w3.org/2000/svg">{body}</svg>')


def nest(x, y, w, h, body, slice_=True):
    par = 'xMidYMid slice' if slice_ else 'xMidYMid meet'
    return (f'<svg x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" viewBox="0 0 320 200" '
            f'preserveAspectRatio="{par}" overflow="hidden">{body}</svg>')


def ridge(x0, x1, y, amp, waves, phase=0.0, n=32, rough=0.0):
    pts = []
    for i in range(n + 1):
        f = i / n
        yy = y - amp * (0.5 + 0.5 * math.sin(waves * 2 * math.pi * f + phase))
        yy -= rough * amp * 0.35 * math.sin(17.3 * f + phase * 3.1)
        pts.append((x0 + (x1 - x0) * f, yy))
    return pts


def landmass(pts, bottom, fill, extra=''):
    return P(pts + [(pts[-1][0], bottom), (pts[0][0], bottom)], fill, extra)


# ---------------------------------------------------------------- skies
SKIES = {
    'dawn': [(0, '#26305C'), (0.52, '#D4806C'), (1, '#F5C98F')],
    'day': [(0, '#6AB2E4'), (1, '#D3EDF8')],
    'gold': [(0, '#5D7DB6'), (0.6, '#EFBF8C'), (1, '#F8DDB0')],
    'dusk': [(0, '#2A2550'), (0.6, '#C2625A'), (1, '#EFA45E')],
    'night': [(0, '#060A1C'), (1, '#1B2A57')],
}


def sky(t, w=320, h=200):
    gid = uid('sky')
    return defs(grad(gid, SKIES[t])) + R(0, 0, w, h, f'url(#{gid})')


def stars(n=36, w=320, h=110, seed=3):
    out = []
    for i in range(n):
        x = (i * 73 + seed * 41) % w
        y = (i * 37 + seed * 17) % h
        r = 0.8 if i % 5 else 1.4
        out.append(C(x, y, r, '#FFFFFF', 'opacity="0.85"'))
    return ''.join(out)


def sun(cx, cy, r, color='#FFE3A3', halo=True):
    h = C(cx, cy, r * 2.4, color, 'opacity="0.25"') if halo else ''
    return h + C(cx, cy, r, color)


# ---------------------------------------------------------------- landscapes (320 x 200)
def _mesa(x0, x1, top, step, ledge, base, fill, lit, shade):
    """stepped butte: flat top x0..x1 at y=top, a wider ledge at y=step, slopes down to base"""
    pts = [(x0 - ledge * 2.2, base), (x0 - ledge, step), (x0, step), (x0, top), (x1, top), (x1, step),
           (x1 + ledge, step), (x1 + ledge * 2.2, base)]
    o = P(pts, fill)
    o += P([(x1, top + 2), (x1, step), (x1 + ledge, step), (x1 + ledge * 2.2, base), (x1 + ledge * 0.4, base)], shade, 'opacity="0.55"')
    o += R(x0, top, x1 - x0, 2.5, lit) + R(x0 - ledge, step, ledge, 2, lit) + R(x1, step, ledge * 0.6, 2, lit, 'opacity="0.6"')
    return o


def canyon(t='dawn'):
    lit = {'dawn': '#F0AE74', 'gold': '#F2BC80', 'day': '#E7A06E', 'dusk': '#D07A55', 'night': '#3B2A3A'}[t]
    far = {'dawn': '#B48A97', 'gold': '#BF9A92', 'day': '#C4A296', 'dusk': '#8A5E6E', 'night': '#262338'}[t]
    far2 = {'dawn': '#BE8478', 'gold': '#C99178', 'day': '#C89276', 'dusk': '#90586A', 'night': '#231E30'}[t]
    wall = {'dawn': '#B65A3E', 'gold': '#C2643F', 'day': '#B9603F', 'dusk': '#8E4434', 'night': '#2A1E2A'}[t]
    deep = {'dawn': '#5E2C25', 'gold': '#683225', 'day': '#6E3528', 'dusk': '#46211F', 'night': '#120D15'}[t]
    near = {'dawn': '#4A2722', 'gold': '#512D1F', 'day': '#5A3224', 'dusk': '#30181A', 'night': '#0A080F'}[t]
    o = sky(t)
    if t == 'night':
        o += stars()
    elif t in ('dawn', 'gold'):
        o += sun(250, 68, 10, '#FFE7B0')
    elif t == 'dusk':
        o += sun(64, 76, 12, '#FFD39A')
    # far (north) rim: almost flat
    o += P([(0, 84), (50, 82), (110, 83), (170, 81), (230, 83), (320, 82), (320, 132), (0, 132)], far)
    # far buttes
    o += _mesa(28, 62, 96, 104, 8, 132, far2, lit, deep)
    o += _mesa(214, 246, 92, 101, 7, 132, far2, lit, deep)
    # mid terraces
    o += P([(0, 120), (80, 118), (160, 121), (240, 117), (320, 119), (320, 176), (0, 176)], wall)
    for y, op in ((128, 0.28), (136, 0.22), (146, 0.26)):
        o += L(0, y, 320, y - 1, lit, 1.5, f'opacity="{op}"')
    o += _mesa(58, 104, 100, 111, 11, 152, wall, lit, deep)
    o += _mesa(250, 288, 104, 114, 9, 152, wall, lit, deep)
    # inner gorge: narrow at the bottom, river glinting in it
    o += P([(112, 124), (138, 150), (148, 170), (162, 170), (176, 148), (204, 122), (188, 122), (166, 146), (156, 162), (146, 146), (128, 124)], deep)
    o += P([(128, 124), (146, 146), (156, 162), (166, 146), (188, 122)], deep, 'opacity="0.0"')
    o += P([(128, 124), (188, 122), (166, 146), (156, 162), (146, 146)], '#7B3A2C')
    o += L(150, 166, 160, 166, '#73B1D2', 3)
    # foreground rim
    o += P([(0, 152), (44, 148), (86, 156), (122, 172), (176, 176), (214, 164), (262, 154), (320, 150), (320, 200), (0, 200)], near)
    o += P([(0, 164), (40, 158), (70, 166), (70, 200), (0, 200)], deep, 'opacity="0.55"')
    for x in (16, 32, 286, 302):
        o += P([(x, 154), (x + 5, 141), (x + 10, 154)], '#3E5A3A' if t != 'night' else '#0E1512')
    return o


def mountain(t='dawn'):
    glow = {'dawn': '#F4B08C', 'gold': '#F2C190', 'day': '#E8EEF4', 'dusk': '#E59A82', 'night': '#3A4462'}[t]
    rock = {'dawn': '#6A7186', 'gold': '#6E7488', 'day': '#7C8597', 'dusk': '#5A5570', 'night': '#20253A'}[t]
    shade = {'dawn': '#4B5166', 'gold': '#4E5468', 'day': '#5D6577', 'dusk': '#3E3A52', 'night': '#141829'}[t]
    o = sky(t)
    if t == 'night':
        o += stars(seed=5)
    o += landmass(ridge(0, 320, 116, 22, 2.2, 0.4, rough=1), 200, '#93A6C6' if t != 'night' else '#1E2742')
    # main horn
    o += P([(150, 26), (172, 56), (192, 84), (232, 122), (92, 122), (118, 86), (136, 54)], rock)
    o += P([(150, 26), (172, 56), (192, 84), (232, 122), (162, 122), (156, 70)], glow)
    o += P([(150, 26), (160, 44), (154, 48), (146, 40)], '#FFFFFF')
    o += P([(118, 86), (132, 84), (128, 98), (106, 104)], '#F3F6FA', 'opacity="0.9"')
    o += P([(150, 26), (136, 54), (118, 86), (92, 122), (130, 122), (140, 76)], shade, 'opacity="0.55"')
    # side peaks
    o += P([(0, 120), (40, 92), (70, 110), (96, 104), (120, 124), (0, 124)], rock)
    o += P([(40, 92), (52, 100), (44, 104)], '#F3F6FA')
    o += P([(220, 124), (262, 96), (290, 108), (320, 98), (320, 126)], rock)
    o += P([(262, 96), (272, 104), (262, 106)], '#F3F6FA')
    # meadow
    o += landmass(ridge(0, 320, 150, 18, 1.2, 1.6), 200, '#5E8F5D' if t != 'night' else '#101C16')
    o += landmass(ridge(0, 320, 176, 14, 1.6, 0.2), 200, '#3F6B46' if t != 'night' else '#0A130F')
    for i, x in enumerate((20, 34, 46, 262, 276, 292, 306)):
        y = 158 + (i % 3) * 4
        o += P([(x, y), (x + 6, y - 18), (x + 12, y)], '#2E5236' if t != 'night' else '#07100B')
    return o


def waterfall(t='day'):
    o = sky(t)
    o += landmass(ridge(0, 320, 70, 10, 3, 0.3, rough=1.2), 200, '#5B9562')
    # cliff arc
    o += P([(0, 92), (60, 86), (120, 92), (170, 90), (220, 84), (320, 90), (320, 132), (0, 132)], '#5A5047')
    o += P([(0, 92), (60, 86), (120, 92), (170, 90), (220, 84), (320, 90), (320, 98), (0, 100)], '#3F7A45')
    # curtains
    for i, x in enumerate(range(8, 316, 12)):
        h = 34 + (i % 4) * 4
        o += R(x, 96 - (i % 3), 7 + (i % 2) * 2, h, '#F4F8FA', 'opacity="0.95"')
    o += E(160, 136, 200, 18, '#FFFFFF', 'opacity="0.6"')
    # pool and river
    o += P([(0, 140), (320, 140), (320, 200), (0, 200)], '#8FAE9F')
    o += PATH('M0 158 C80 150 140 170 220 160 C260 156 300 162 320 158', 'none',
              'stroke="#FFFFFF" stroke-opacity="0.5" stroke-width="3"')
    # jungle foreground
    o += landmass(ridge(0, 120, 176, 22, 1.4, 0.4, rough=1), 200, '#2F6B3D')
    o += landmass(ridge(210, 320, 172, 26, 1.2, 1.2, rough=1), 200, '#2F6B3D')
    return o


def karst(t='gold'):
    o = sky(t)
    if t in ('gold', 'dawn'):
        o += sun(236, 92, 9, '#FFF0C8')
    wgid = uid('sea')
    o += defs(grad(wgid, [(0, '#9FC3C0'), (1, '#4E8E94')]))
    o += R(0, 110, 320, 90, f'url(#{wgid})')

    def tower(cx, base, w, h, fill):
        x0, x1 = cx - w / 2, cx + w / 2
        return PATH(f'M{x0:.1f} {base} C{x0 - 2:.1f} {base - h * 0.6:.1f} {x0 + w * 0.15:.1f} {base - h:.1f} {cx:.1f} {base - h:.1f} '
                    f'C{x1 - w * 0.15:.1f} {base - h:.1f} {x1 + 2:.1f} {base - h * 0.6:.1f} {x1:.1f} {base} Z', fill)
    for cx, w, h in ((30, 26, 34), (70, 18, 26), (110, 30, 40), (200, 24, 30), (260, 34, 44), (300, 20, 28)):
        o += tower(cx, 112, w, h, '#A9C0B6')
    for cx, w, h in ((52, 34, 58), (150, 40, 72), (226, 30, 54), (292, 36, 62)):
        o += tower(cx, 126, w, h, '#6F907F')
    for cx, w, h in ((14, 46, 96), (96, 40, 84), (306, 44, 100)):
        o += tower(cx, 150, w, h, '#3D5E4B')
    o += P([(0, 150), (320, 150), (320, 200), (0, 200)], '#3F7F86', 'opacity="0.55"')
    # junk boat
    o += P([(180, 156), (214, 156), (208, 164), (186, 164)], '#5A3A2A')
    o += P([(192, 156), (194, 132), (206, 140), (204, 156)], '#C8553D')
    o += L(170, 168, 226, 168, '#FFFFFF', 1.5, 'opacity="0.5"')
    return o


def aurora(t='night'):
    o = sky('night') + stars(46, seed=7)
    for d, col, w, op in (('M-10 70 C60 30 120 90 180 50 C230 20 280 60 330 34', '#7CF5C8', 16, 0.55),
                          ('M-10 92 C70 60 130 100 200 74 C250 56 290 80 330 62', '#7CF5C8', 10, 0.45),
                          ('M20 50 C80 20 150 60 210 30 C250 14 290 30 330 20', '#B48CF2', 8, 0.35)):
        o += PATH(d, 'none', f'stroke="{col}" stroke-width="{w}" stroke-linecap="round" opacity="{op}"')
    o += landmass(ridge(0, 320, 132, 34, 1.6, 0.6, rough=1.2), 200, '#0C1426')
    o += R(0, 140, 320, 60, '#0A1830')
    for d, col, w, op in (('M-10 176 C60 196 120 160 180 186 C230 200 280 176 330 190', '#7CF5C8', 8, 0.25),):
        o += PATH(d, 'none', f'stroke="{col}" stroke-width="{w}" stroke-linecap="round" opacity="{op}"')
    o += landmass(ridge(0, 320, 150, 8, 2, 0.2), 200, '#05080F', 'opacity="0.0"')
    o += P([(0, 140), (60, 134), (90, 142), (0, 146)], '#05080F')
    return o


def dunes(t='gold'):
    o = sky('day' if t == 'day' else 'gold')
    if t != 'day':
        o += sun(70, 70, 10, '#FFF1C9')
    o += landmass(ridge(0, 320, 112, 18, 1.4, 0.8), 200, '#E9B178')
    # big dune: lit and shadow faces split on the crest line
    o += P([(40, 200), (150, 96), (300, 200)], '#E59A55')
    o += P([(150, 96), (210, 150), (300, 200), (186, 200)], '#A9592F')
    o += P([(-20, 200), (60, 140), (130, 200)], '#EFAE6A')
    o += P([(60, 140), (90, 172), (130, 200), (96, 200)], '#B8653A')
    # white pan with dead trees (Deadvlei)
    o += E(240, 186, 70, 10, '#EFE6D6')
    for x in (222, 248, 262):
        o += L(x, 186, x, 172, '#2A1D18', 2)
        o += L(x, 176, x - 6, 170, '#2A1D18', 1.5) + L(x, 178, x + 6, 172, '#2A1D18', 1.5)
    return o


def glacier(t='day'):
    o = sky(t)
    o += landmass(ridge(0, 320, 70, 26, 1.8, 0.2, rough=1), 200, '#8D9BB2')
    o += P([(150, 52), (162, 60), (150, 64)], '#FFFFFF')
    o += P([(0, 92), (320, 82), (320, 120), (0, 124)], '#E3F2F9')
    for x in range(10, 320, 26):
        o += L(x, 96, x + 10, 118, '#8CC3E0', 2, 'opacity="0.8"')
    # ice front
    o += P([(0, 124), (320, 120), (320, 146), (0, 150)], '#BFE3F2')
    for x in range(6, 320, 9):
        o += L(x, 125, x - 2, 148, '#7FB8D8', 1.5, 'opacity="0.7"')
    o += P([(0, 150), (320, 146), (320, 200), (0, 200)], '#4E86A2')
    for x, w in ((60, 18), (140, 10), (230, 22), (280, 8)):
        o += P([(x, 166), (x + w * 0.3, 158), (x + w, 160), (x + w + 3, 166)], '#E8F6FC')
    return o


def volcano(t='dawn'):
    """tuff cone by the sea at sunrise (Seongsan Ilchulbong-like)"""
    o = sky(t)
    if t in ('dawn', 'gold'):
        o += sun(250, 118, 12, '#FFE1A0')
    o += R(0, 120, 320, 80, '#3A6A8C')
    o += L(0, 121, 320, 121, '#F6C98E', 2, 'opacity="0.7"')
    o += L(196, 132, 300, 132, '#F6C98E', 3, 'opacity="0.5"')
    # cone with jagged crater rim
    rim = [(60, 120), (84, 82), (96, 76), (104, 80), (114, 72), (126, 78), (138, 70), (150, 76), (162, 72), (172, 80),
           (182, 76), (196, 86), (226, 120)]
    o += P(rim, '#4E7A4E')
    o += P([(96, 76), (104, 80), (114, 72), (126, 78), (138, 70), (150, 76), (162, 72), (172, 80), (182, 76), (178, 88), (100, 88)], '#3B5E3D')
    for x0 in (78, 98, 120, 140, 160, 182, 200):
        o += L(x0, 118, x0 + 8, 88, '#335236', 2, 'opacity="0.6"')
    o += landmass(ridge(0, 120, 136, 10, 1.2, 0.3), 200, '#2D4A33')
    o += P([(0, 150), (320, 140), (320, 200), (0, 200)], '#2B5470')
    return o


def fjord(t='day'):
    o = sky(t)
    o += P([(0, 30), (60, 50), (110, 80), (150, 108), (150, 200), (0, 200)], '#4C5F5C')
    o += P([(320, 24), (260, 46), (210, 78), (172, 108), (172, 200), (320, 200)], '#5A6E69')
    o += P([(0, 30), (60, 50), (110, 80), (150, 108), (120, 108), (60, 72), (0, 56)], '#6F857E')
    o += P([(320, 24), (260, 46), (210, 78), (172, 108), (196, 108), (260, 66), (320, 50)], '#7C918A')
    for x, y0 in ((70, 60), (238, 58)):
        o += L(x, y0, x + 4, y0 + 46, '#F4F8FA', 2, 'opacity="0.85"')
    o += P([(120, 108), (200, 108), (320, 200), (0, 200)], '#2F5E73')
    o += P([(148, 150), (168, 150), (166, 156), (150, 156)], '#E9EEF2')
    o += L(120, 160, 196, 160, '#FFFFFF', 1.5, 'opacity="0.4"')
    return o


def saltflat(t='gold'):
    gid = uid('sky')
    gid2 = uid('mir')
    stops = SKIES['gold' if t != 'day' else 'day']
    o = defs(grad(gid, stops), grad(gid2, list(reversed([(1 - o_, c) for o_, c in stops]))))
    o += R(0, 0, 320, 110, f'url(#{gid})') + R(0, 110, 320, 90, f'url(#{gid2})')
    o += P([(0, 110), (40, 104), (80, 108), (130, 102), (170, 108), (320, 106), (320, 110)], '#7D6E8A')
    o += P([(0, 110), (40, 116), (80, 112), (130, 118), (170, 112), (320, 114), (320, 110)], '#7D6E8A', 'opacity="0.5"')
    for x in (150, 160, 168):
        o += R(x, 96, 3, 14, '#2B2236') + R(x, 110, 3, 14, '#2B2236', 'opacity="0.45"')
    o += E(60, 40, 24, 7, '#FFFFFF', 'opacity="0.7"') + E(60, 180, 24, 7, '#FFFFFF', 'opacity="0.5"')
    o += E(250, 30, 30, 8, '#FFFFFF', 'opacity="0.7"') + E(250, 190, 30, 8, '#FFFFFF', 'opacity="0.5"')
    return o


def reef(t='day'):
    gid = uid('sea')
    o = defs(grad(gid, [(0, '#2FC4C8'), (1, '#1A5E9C')]))
    o += R(0, 0, 320, 200, f'url(#{gid})')
    for cx, cy, rx, ry in ((70, 60, 60, 22), (220, 140, 80, 26), (250, 50, 40, 14), (90, 160, 44, 16)):
        o += E(cx, cy, rx, ry, '#7FD9C6', 'opacity="0.65"')
        o += E(cx, cy, rx * 0.7, ry * 0.6, '#B6EBDD', 'opacity="0.5"')
    o += E(160, 100, 46, 18, '#F2E2B6')
    o += E(160, 100, 56, 24, '#BFF2E8', 'opacity="0.45"')
    o += L(166, 100, 172, 84, '#6B4A2E', 2)
    o += E(172, 82, 10, 4, '#3E8C4C') + E(176, 86, 8, 3, '#3E8C4C')
    return o


def forest(t='day'):
    o = R(0, 0, 320, 200, '#2F6B3D')
    for i in range(70):
        x = (i * 47) % 330 - 5
        y = (i * 29) % 210 - 5
        r = 12 + (i % 4) * 3
        col = ('#3E8048', '#4F9356', '#2C6438', '#5FA35E')[i % 4]
        o += C(x, y, r, col)
    o += PATH('M-10 40 C60 70 40 110 110 120 C180 130 160 170 230 176 C280 180 300 160 330 168', 'none',
              'stroke="#B49A6E" stroke-width="12" stroke-linecap="round"')
    o += R(0, 0, 320, 200, '#FFFFFF', 'opacity="0.08"')
    return o


def lake(t='day'):
    o = sky(t)
    o += landmass(ridge(0, 320, 96, 52, 3.1, 0.5, rough=1.4), 200, '#7F879A')
    for x, y in ((40, 56), (110, 48), (176, 50), (250, 46)):
        o += P([(x - 10, y + 8), (x, y), (x + 10, y + 8)], '#FFFFFF')
    o += P([(0, 118), (320, 112), (320, 200), (0, 200)], '#3BB4C6')
    o += L(0, 122, 320, 118, '#FFFFFF', 1.5, 'opacity="0.35"')
    for i, x in enumerate(range(0, 330, 14)):
        h = 26 + (i % 3) * 8
        o += P([(x, 124), (x + 6, 124 - h), (x + 12, 124)], '#1F4A33')
    return o


def plateau(t='gold'):
    """flat-topped mountain (Table Mountain / Roraima type)"""
    o = sky(t)
    o += P([(30, 120), (60, 62), (250, 58), (282, 120)], '#6F6A78')
    o += P([(60, 62), (250, 58), (246, 66), (64, 70)], '#E6E2EC', 'opacity="0.8"')
    o += P([(250, 58), (282, 120), (240, 120)], '#57525F')
    o += landmass(ridge(0, 320, 150, 20, 1.4, 0.5, rough=1), 200, '#4E7E57')
    o += R(0, 168, 320, 32, '#2F6B7E')
    return o


BIOME_DRAW = {
    'canyon': canyon, 'mountain': mountain, 'waterfall': waterfall, 'karst': karst, 'sky': aurora,
    'desert_dunes': dunes, 'glacier_ice': glacier, 'volcano': volcano, 'coast_cliff_fjord': fjord,
    'salt_flat': saltflat, 'reef_island': reef, 'forest': forest, 'lake_river': lake, 'monolith_rock': plateau,
}
BIOME_LIGHT = {
    'canyon': 'dawn', 'mountain': 'dawn', 'waterfall': 'day', 'karst': 'gold', 'sky': 'night', 'desert_dunes': 'gold',
    'glacier_ice': 'day', 'volcano': 'dawn', 'coast_cliff_fjord': 'day', 'salt_flat': 'gold', 'reef_island': 'day',
    'forest': 'day', 'lake_river': 'day', 'monolith_rock': 'gold',
}


def landscape(biome, t=None):
    return BIOME_DRAW[biome](t or BIOME_LIGHT[biome])


def postcard(biome, label):
    return svg((320, 200), label, landscape(biome))


# ---------------------------------------------------------------- hero globe
def hero_globe(places):
    n = GLOBE_HERO['n']
    s = 4
    W = H = n * s + 40
    o = R(0, 0, W, H, 'transparent')
    o += sprite('globe_hero', 20, 20, s)
    for p in places:
        xy = project(n, GLOBE_HERO['lat0'], GLOBE_HERO['lon0'], p['lat'], p['lon'])
        if not xy:
            continue
        x, y = 20 + xy[0] * s, 20 + xy[1] * s
        o += C(x, y, 9, '#FFD35C', 'opacity="0.35"') + C(x, y, 4.5, '#FFD35C', 'stroke="#1A1D2B" stroke-width="1.5"')
    return svg((W, H), '해 질 녘의 동아시아를 비추는 도트 지구본. 노란 점은 첫 출시 장소들이다.', o)


# ---------------------------------------------------------------- positioning map
def positioning(items):
    W, H = 720, 470
    x0, x1, y0, y1 = 110, 690, 40, 400
    o = R(0, 0, W, H, 'transparent')
    # empty quadrant (lean-back x deep)
    o += R(x0, y0, (x1 - x0) / 2, (y1 - y0) / 2, '#FFD35C', 'opacity="0.13"')
    o += L(x0, y1, x1, y1, 'currentColor', 2) + L(x0, y0, x0, y1, 'currentColor', 2)
    o += L((x0 + x1) / 2, y0, (x0 + x1) / 2, y1, 'currentColor', 1, 'stroke-dasharray="4 6" opacity="0.4"')
    o += L(x0, (y0 + y1) / 2, x1, (y0 + y1) / 2, 'currentColor', 1, 'stroke-dasharray="4 6" opacity="0.4"')
    o += T(x0, y1 + 34, '← 틀어 두고 본다', 'pos-axis')
    o += T(x1, y1 + 34, '직접 몰고 다닌다 →', 'pos-axis', 'end')
    o += T(x0 - 14, y0 + 8, '설명', 'pos-axis', 'end') + T(x0 - 14, y0 + 34, '깊음', 'pos-axis', 'end')
    o += T(x0 - 14, y1 - 24, '설명', 'pos-axis', 'end') + T(x0 - 14, y1 + 2, '없음', 'pos-axis', 'end')
    o += T(x0 + 14, y0 + 30, '빈자리', 'pos-gap')
    for it in items:
        x = x0 + it['x'] * (x1 - x0)
        y = y1 - it['y'] * (y1 - y0)
        if it.get('us'):
            o += C(x, y, 16, '#FF7A45', 'opacity="0.3"') + C(x, y, 9, '#FF7A45', 'stroke="#1A1D2B" stroke-width="2"')
            o += T(x + 18, y + 8, it['name'], 'pos-us')
        else:
            o += C(x, y, 6, 'currentColor')
            dx = it.get('dx', 12)
            anchor = 'end' if dx < 0 else 'start'
            o += T(x + dx, y + it.get('dy', 6), it['name'], 'pos-name', anchor)
    return svg((W, H), '이미 있는 서비스를 가로(틀어 두기↔직접 몰기), 세로(설명 없음↔깊음)로 놓은 지도', o)


# ---------------------------------------------------------------- concept cards (A/B/C)
def concept_window():
    o = R(0, 0, 320, 200, '#1A1D2B')
    o += nest(30, 22, 260, 146, landscape('mountain', 'dawn'))
    o += R(30, 22, 260, 146, 'none', 'stroke="#F3EEE6" stroke-width="6"')
    o += R(140, 168, 40, 10, '#F3EEE6') + R(110, 178, 100, 6, '#F3EEE6')
    return svg((320, 200), '창문처럼 틀어 두는 풍경 화면', o)


def concept_story():
    o = nest(0, 0, 320, 200, landscape('canyon', 'gold'))
    pts = [(40, 160), (110, 120), (190, 136), (270, 96)]
    o += PATH('M40 160 C70 130 90 120 110 120 S170 140 190 136 S250 100 270 96', 'none',
              'stroke="#FFFFFF" stroke-width="4" stroke-dasharray="8 7" stroke-linecap="round"')
    for i, (x, y) in enumerate(pts):
        o += C(x, y, 12, '#FF7A45', 'stroke="#1A1D2B" stroke-width="2"') + T(x, y + 6, str(i + 1), 'cc-num', 'middle')
    o += R(150, 18, 156, 50, '#FFFFFF', 'rx="10"') + P([(190, 68), (204, 68), (194, 82)], '#FFFFFF')
    o += R(164, 32, 110, 6, '#1A1D2B', 'opacity="0.7"') + R(164, 46, 128, 6, '#1A1D2B', 'opacity="0.4"')
    return svg((320, 200), '번호를 따라 정거장을 이어 가며 설명하는 이야기 여행', o)


def concept_explore():
    n = GLOBE_HOME['n']
    o = R(0, 0, 320, 200, '#0B1026') + stars(30, 320, 200, seed=9)
    o += sprite('globe_home', 160 - n, 100 - n, 2)
    o += sprite('ic_hand_l', 214, 120, 3)
    o += PATH('M196 112 C220 96 236 98 250 108', 'none', 'stroke="#FFD35C" stroke-width="3" stroke-dasharray="5 5"')
    return svg((320, 200), '지구본을 직접 돌리며 찾아가는 탐험', o)


# ---------------------------------------------------------------- flow steps (240 x 150)
def step_descend():
    n = GLOBE_HERO['n']
    o = R(0, 0, 240, 150, '#0B1026') + stars(18, 240, 150, seed=11)
    o += sprite('globe_hero', 12, 8, 1.2)
    o += PATH('M150 36 C190 50 200 80 196 118', 'none',
              'stroke="#FFD35C" stroke-width="4" stroke-dasharray="7 6" stroke-linecap="round"')
    o += P([(186, 112), (206, 112), (196, 128)], '#FFD35C')
    return svg((240, 150), '지구본에서 그곳으로 내려가는 30초', o)


def step_wide():
    o = nest(0, 0, 240, 150, landscape('canyon', 'dawn'))
    o += PATH('M16 30 C80 12 160 12 224 30', 'none', 'stroke="#FFFFFF" stroke-width="3" stroke-dasharray="6 6"')
    o += cam(28, 22)
    return svg((240, 150), '높이 떠서 크게 보는 설정 장면', o)


def step_close():
    body = landscape('canyon', 'gold')
    o = f'<svg x="0" y="0" width="240" height="150" viewBox="70 70 180 112" preserveAspectRatio="xMidYMid slice">{body}</svg>'
    o += E(120, 80, 84, 26, 'none', 'stroke="#FFFFFF" stroke-width="3" stroke-dasharray="6 6"')
    o += cam(196, 66)
    return svg((240, 150), '천천히 다가가며 도는 장면', o)


def step_stand():
    o = nest(0, 0, 240, 150, landscape('canyon', 'day'))
    o += R(0, 112, 240, 38, '#4F2A24')
    o += R(0, 108, 240, 4, '#2A1A16') + L(0, 98, 240, 98, '#2A1A16', 3)
    for x in range(10, 240, 24):
        o += L(x, 98, x, 110, '#2A1A16', 3)
    o += person(70, 112) + person(176, 112, 0.9)
    o += E(120, 132, 46, 9, 'none', 'stroke="#FFD35C" stroke-width="3"')
    o += P([(162, 128), (172, 132), (162, 136)], '#FFD35C')
    return svg((240, 150), '전망대 그 자리에 서서 360도로 둘러보는 장면', o)


def step_dusk():
    o = nest(0, 0, 240, 150, landscape('canyon', 'night'))
    o += PATH('M150 120 C180 110 204 96 222 76', 'none', 'stroke="#FFD35C" stroke-width="4" stroke-dasharray="7 6"')
    o += P([(214, 72), (230, 70), (224, 86)], '#FFD35C')
    return svg((240, 150), '해가 지고 밤이 되면 다음 장소로 이어진다', o)


def cam(x, y):
    return (R(x - 12, y - 8, 24, 16, '#1A1D2B', 'rx="3"') + C(x, y, 5, '#FFD35C') +
            P([(x + 12, y - 4), (x + 20, y - 8), (x + 20, y + 8), (x + 12, y + 4)], '#1A1D2B'))


def person(x, y, s=1.0):
    return (C(x, y - 30 * s, 5 * s, '#1A1D2B') + R(x - 5 * s, y - 25 * s, 10 * s, 15 * s, '#1A1D2B', 'rx="3"') +
            R(x - 4 * s, y - 11 * s, 3.5 * s, 11 * s, '#1A1D2B') + R(x + 0.5 * s, y - 11 * s, 3.5 * s, 11 * s, '#1A1D2B'))


# ---------------------------------------------------------------- screen mockups (640 x 400)
def hud_chip(x, y, w, h, body, dark=True):
    fill = '#0B1026' if dark else '#FFFFFF'
    return R(x, y, w, h, fill, f'rx="{h / 2:.0f}" opacity="0.72"') + body


def screen_home(places, sun_rows):
    n = GLOBE_HOME['n']
    s = 3.4
    W, H = 640, 400
    o = R(0, 0, W, H, '#0B1026') + stars(40, W, H, seed=13)
    gx, gy = 24, (H - n * s) / 2
    o += sprite('globe_home', gx, gy, s)
    for p in places:
        xy = project(n, GLOBE_HOME['lat0'], GLOBE_HOME['lon0'], p['lat'], p['lon'])
        if not xy:
            continue
        x, y = gx + xy[0] * s, gy + xy[1] * s
        hot = p.get('hot')
        o += C(x, y, 10 if hot else 7, '#FFD35C', 'opacity="0.35"')
        o += C(x, y, 5 if hot else 3.5, '#FFD35C', 'stroke="#1A1D2B" stroke-width="1.5"')
        if hot:
            o += T(x + 12, y - 8, p['name_ko'], 'scr-pin')
    # right panel
    px = 360
    o += T(px, 64, '지금 해 뜨는 곳', 'scr-h')
    for i, r in enumerate(sun_rows[:3]):
        y = 100 + i * 46
        o += sprite('ic_sun', px, y - 18, 2.2)
        o += T(px + 30, y - 2, r['name_ko'], 'scr-b') + T(px + 30, y + 18, r['sunrise'], 'scr-s')
    o += R(px, 252, 248, 48, '#FF7A45', 'rx="24"') + T(px + 124, 283, '그냥 틀어 두기 ▶', 'scr-btn', 'middle')
    o += R(px, 312, 248, 44, 'none', 'rx="22" stroke="#F3EEE6" stroke-width="2"')
    o += T(px + 124, 340, '들어가기 · 소리 켜기', 'scr-btn2', 'middle')
    return svg((W, H), '첫 화면: 지금 낮과 밤이 도는 지구본과 해 뜨는 곳 목록', o)


def screen_play():
    W, H = 640, 400
    o = nest(0, 0, W, H, landscape('canyon', 'dawn'))
    o += hud_chip(20, 20, 210, 34, T(38, 43, '그랜드캐니언 · 미국', 'scr-chip'))
    o += hud_chip(428, 20, 192, 34, sprite('ic_sun', 442, 28, 2) + T(472, 43, '06:42 해 뜸 · 4°C', 'scr-chip'))
    o += R(20, 316, 440, 64, '#0B1026', 'rx="12" opacity="0.72"')
    o += T(38, 344, '협곡 맨 아래 바위는 약 18억 년 전 것입니다.', 'scr-cap')
    o += T(38, 368, '탭하면 이야기가 열립니다', 'scr-s')
    for i, ic in enumerate(('ic_pause_l', 'ic_sound_l', 'ic_info_l', 'ic_next_l')):
        x = 480 + i * 36
        o += C(x + 9, 348, 16, '#0B1026', 'opacity="0.72"') + sprite(ic, x, 339, 2)
    return svg((W, H), '재생 화면: 그랜드캐니언 새벽, 위에 장소와 그곳의 지금, 아래에 한 줄 설명과 버튼', o)


def screen_card():
    W, H = 640, 400
    o = nest(0, 0, W, H, landscape('canyon', 'gold'))
    o += R(0, 0, W, H, '#0B1026', 'opacity="0.35"')
    cx = 340
    o += R(cx, 16, 284, 368, '#F7F3EC', 'rx="14"')
    o += T(cx + 20, 52, '바위에 쌓인 18억 년', 'card-h')
    o += T(cx + 20, 76, '그랜드캐니언 · 카드 1/3', 'card-s')
    for i, w in enumerate((244, 236, 244, 210, 240, 180)):
        o += R(cx + 20, 92 + i * 16, w, 7, '#1A1D2B', 'opacity="0.55" rx="3"')
    # then / now
    fid = uid('sepia')
    o += defs(f'<filter id="{fid}"><feColorMatrix type="matrix" values="0.39 0.77 0.19 0 0 0.35 0.69 0.17 0 0 0.27 0.53 0.13 0 0 0 0 0 1 0"></feColorMatrix></filter>')
    o += f'<svg x="{cx + 20}" y="196" width="118" height="70" viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice"><g filter="url(#{fid})">{landscape("canyon", "day")}</g></svg>'
    o += f'<svg x="{cx + 146}" y="196" width="118" height="70" viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice">{landscape("canyon", "day")}</svg>'
    o += T(cx + 22, 284, '1903년 사진 ↔ 지금', 'card-s')
    o += R(cx + 20, 300, 116, 38, '#FF7A45', 'rx="19"') + T(cx + 78, 324, '▶ 90초 듣기', 'card-btn', 'middle')
    o += R(cx + 146, 300, 118, 38, 'none', 'rx="19" stroke="#1A1D2B" stroke-width="2"') + T(cx + 205, 324, '깊이 읽기', 'card-btn2', 'middle')
    o += T(cx + 20, 364, '사진 NPS(공공 영역) · 사실 Wikidata · 출처 5', 'card-xs')
    return svg((W, H), '카드 화면: 풍경 옆에 이야기 카드, 그때와 지금 비교, 90초 듣기와 깊이 읽기', o)


def screen_look():
    W, H = 640, 400
    o = nest(0, 0, W, H, landscape('canyon', 'day'))
    o += R(0, 300, W, 100, '#4F2A24')
    o += R(0, 292, W, 8, '#2A1A16') + L(0, 270, W, 270, '#2A1A16', 5)
    for x in range(16, W, 46):
        o += L(x, 270, x, 296, '#2A1A16', 5)
    o += sprite('ic_hand', 300, 170, 5)
    o += PATH('M250 180 C220 180 196 186 176 196', 'none', 'stroke="#FFFFFF" stroke-width="5" stroke-linecap="round"')
    o += P([(170, 186), (164, 202), (182, 200)], '#FFFFFF')
    o += PATH('M380 180 C410 180 434 186 454 196', 'none', 'stroke="#FFFFFF" stroke-width="5" stroke-linecap="round"')
    o += P([(460, 186), (466, 202), (448, 200)], '#FFFFFF')
    o += hud_chip(170, 330, 300, 40, T(320, 356, '손을 떼면 4초 뒤 다시 흐릅니다', 'scr-chip', 'middle'))
    o += hud_chip(20, 20, 250, 34, T(38, 43, '마더 포인트 · 그 자리에 서기', 'scr-chip'))
    return svg((W, H), '둘러보기 화면: 전망대 난간에서 손으로 끌어 둘러보고, 손을 떼면 자동으로 돌아간다', o)


# ---------------------------------------------------------------- explanation layers as strata
def strata(layers):
    W, H = 720, 430
    o = R(0, 0, W, H, 'transparent')
    o += nest(0, 0, W, 120, landscape('canyon', 'gold'))
    cols = ['#E8D3A8', '#D9A06A', '#B5553A', '#6E3B33']
    y = 120
    heights = [48, 62, 84, 116]
    for (name, size_, when), col, h in zip(layers, cols, heights):
        o += R(0, y, W, h, col)
        o += L(0, y, W, y, '#1A1D2B', 1.5, 'opacity="0.35"')
        ink = '#1A1D2B' if col in ('#E8D3A8', '#D9A06A') else '#F7F3EC'
        o += T(24, y + h / 2 + 8, name, 'st-name', 'start', f'fill="{ink}"')
        o += T(W - 24, y + h / 2 - 4, size_, 'st-size', 'end', f'fill="{ink}"')
        o += T(W - 24, y + h / 2 + 20, when, 'st-when', 'end', f'fill="{ink}"')
        y += h
    o += person(150, 120, 1.0)
    return svg((W, H), '설명 네 겹을 지층처럼 쌓은 그림: 한 줄, 카드, 90초 듣기, 깊이 읽기', o)


# ---------------------------------------------------------------- what draws what (annotated scene)
def stack(labels):
    W, H = 720, 420
    o = R(0, 0, W, H, 'transparent')
    o += nest(0, 0, W, H - 70, landscape('mountain', 'dawn'))
    o += R(0, H - 70, W, 70, '#1A1D2B', 'opacity="0.0"')
    # 360 photo bubble
    o += C(560, 236, 46, '#FFFFFF', 'opacity="0.18" stroke="#FFFFFF" stroke-width="3"')
    o += E(560, 236, 46, 14, 'none', 'stroke="#FFFFFF" stroke-width="2" stroke-dasharray="5 5"')
    for (x, y, tx, ty, label, anchor) in labels:
        o += L(x, y, tx, ty, '#FFFFFF', 2)
        o += C(x, y, 5, '#FFD35C', 'stroke="#1A1D2B" stroke-width="1.5"')
        o += T(tx + (8 if anchor == 'start' else -8), ty + 6, label, 'stk-label', anchor)
    return svg((W, H), '한 장면을 무엇으로 그리는지 이름표를 붙인 그림', o)


# ---------------------------------------------------------------- cost bars (to scale)
def cost_bars(rows, unit='$'):
    W = 720
    L0, R0, T0, RH, BH = 210, 120, 12, 44, 22
    H = T0 * 2 + RH * len(rows)
    vmax = max(v for _, v, _ in rows)
    o = R(0, 0, W, H, 'transparent')
    for i, (name, v, pick) in enumerate(rows):
        y = T0 + i * RH
        w = max(3, (W - L0 - R0) * v / vmax)
        o += T(L0 - 14, y + BH - 4, name, 'cb-name', 'end')
        o += R(L0, y, w, BH, '#FFD35C' if pick else '#F3EEE6', '' if pick else 'opacity="0.55"')
        o += T(L0 + w + 10, y + BH - 4, f'{unit}{v:,}', 'cb-val')
    o += L(L0, 4, L0, H - 4, '#F3EEE6', 2, 'opacity="0.6"')
    return svg((W, H), '월 10만 방문일 때 데이터 비용 비교 막대', o)


# ---------------------------------------------------------------- world map with pins
def world_map(places, labels):
    from sprites import COLS, ROWS, LAT_TOP, STEP
    s = 4
    W, H = COLS * s, ROWS * s
    o = sprite('worldmap', 0, 0, s)
    for p in sorted(places, key=lambda p: p['tier'] == 'launch'):
        x = (p['lon'] + 180) / STEP * s
        y = (LAT_TOP - p['lat']) / STEP * s
        if p['tier'] == 'launch':
            o += C(x, y, 13, '#FF7A45', 'opacity="0.3"')
            o += C(x, y, 7, '#FF7A45', 'stroke="#1A1D2B" stroke-width="2"')
            name, _, _, (dx, dy, anchor) = labels[p['id']]
            o += T(x + dx, y + dy, name, 'wm-name', anchor)
        else:
            o += C(x, y, 4.5, '#F3EEE6', 'stroke="#1A1D2B" stroke-width="1.5"')
    return svg((W, H), '첫 출시 장소(주황)와 다음 장소(흰 점)를 찍은 세계 지도', o)
