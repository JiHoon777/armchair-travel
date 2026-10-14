#!/usr/bin/env python3
"""Grand Canyon terrain data for the 「지금 거기」 prototype (TERRAIN agent).

Run from anything (paths are resolved from this file):
    uv run --quiet --with numpy --with pillow python -I tools/fetch_terrain.py all

Steps (each can be run alone, later steps read what earlier ones wrote):
    download  tiles (curl, max 4 in parallel) + USGS EPQS reference heights -> tools/cache/terrain/
    build     DEM PNGs, texture JPEGs, meta.json, credits/terrain.json -> site/data/...
    check     round-trip, spikes, seams, check points, alignment -> docs/proto/terrain_checks.json
    preview   hillshade + texture + contour overlay -> docs/proto/terrain_preview.jpg
    compare   USGS vs Sentinel-2 crop near Phantom Ranch -> docs/proto/compare_imagery.jpg

Frame (shared contract): origin lat0=36.1150, lon0=-112.1050.
    x = (lon-lon0)*111320*cos(lat0)  (east), z = -(lat-lat0)*110574 (south), y = metres a.s.l.
DEM grids are corner-aligned (n vertices per side); texture pixels cover their square
edge to edge (pixel centre at x0 + (j+0.5)*extent/px). Row 0 = north, column 0 = west.

Downloaded tiles are untrusted: they stay in tools/cache/terrain/ and are only decoded
with Pillow (size and mode are checked before use).
"""
import argparse
import json
import math
import struct
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

Image.MAX_IMAGE_PIXELS = 200_000_000  # our own mosaics only; source tiles are checked to be 256x256

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "tools" / "cache" / "terrain"
OUT = ROOT / "site" / "data" / "grand-canyon" / "terrain"
CREDITS = ROOT / "site" / "data" / "credits" / "terrain.json"
DOCS = ROOT / "docs" / "proto"
UA = "armchair-proto/0.1 (jihoon@deepintothe.xyz)"
TODAY = "2026-10-13"

LAT0, LON0 = 36.1150, -112.1050
KX = 111320.0 * math.cos(math.radians(LAT0))  # local metres per degree of longitude
KZ = 110574.0                                  # local metres per degree of latitude

CORE = {"size": 20000.0, "n": 1537, "dem_z": 14, "tex_z": 16, "grid": 3, "px": 2048, "mpx": 1024}
OUTER = {"size": 100000.0, "n": 513, "dem_z": 12, "tex_z": 12, "px": 2048, "mpx": 1024}
JPEG_Q = 82

SOURCES = {
    "dem": "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
    "usgs": "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}",
    "s2": "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg",
}
EPQS = "https://epqs.nationalmap.gov/v1/json?x={lon}&y={lat}&wkid=4326&units=Meters&includeDate=true"

# name, lat, lon, expected elevation from the brief (None = no figure given)
CHECKS = [
    ("Mather Point", 36.06167, -112.10806, 2170.0),
    ("Yavapai Point", 36.0659, -112.1176, None),
    ("Hopi Point", 36.07452, -112.15489, None),
    ("Phantom Ranch", 36.1055, -112.0947, 750.0),
    ("Bright Angel Point", 36.1997, -112.0526, 2480.0),
]

# imagery comparison crop: inner gorge at Phantom Ranch / the two bridges, 4 km x 2.5 km
COMPARE = {"lat": 36.1018, "lon": -112.0945, "w_m": 4000.0, "h_m": 2500.0}
COMPARE_S2_ZOOMS = (13, 14)  # z13 is the brief; z14 (~7.7 m/px) is a supplementary panel

FONT_PATH = "/System/Library/Fonts/AppleSDGothicNeo.ttc"


# ----------------------------------------------------------------------------- frame helpers
def lon_of_x(x):
    return LON0 + np.asarray(x, dtype=np.float64) / KX


def lat_of_z(z):
    return LAT0 - np.asarray(z, dtype=np.float64) / KZ


def x_of_lon(lon):
    return (lon - LON0) * KX


def z_of_lat(lat):
    return -(lat - LAT0) * KZ


def merc_x(lon, zoom):
    return (np.asarray(lon, dtype=np.float64) + 180.0) / 360.0 * (256.0 * 2 ** zoom)


def merc_y(lat, zoom):
    phi = np.radians(np.asarray(lat, dtype=np.float64))
    return (1.0 - np.arcsinh(np.tan(phi)) / math.pi) / 2.0 * (256.0 * 2 ** zoom)


def lon_of_px(gx, zoom):
    """Longitude of the centre of global pixel column gx."""
    return (gx + 0.5) / (256.0 * 2 ** zoom) * 360.0 - 180.0


def lat_of_px(gy, zoom):
    """Latitude of the centre of global pixel row gy."""
    return math.degrees(math.atan(math.sinh(math.pi * (1.0 - 2.0 * (gy + 0.5) / (256.0 * 2 ** zoom)))))


def src_spacing(zoom):
    """Local metres per source pixel at lat0, (x, z)."""
    n = 256.0 * 2 ** zoom
    return KX * 360.0 / n, KZ * 360.0 * math.cos(math.radians(LAT0)) / n


def sigma_for(out_spacing, spacing):
    s = out_spacing / spacing
    return 0.5 * math.sqrt(s * s - 1.0) if s > 1.0 else 0.0


def dem_axis(size, n):
    return -size / 2.0 + np.arange(n, dtype=np.float64) * (size / (n - 1))


def tex_axis(start, extent, px):
    return start + (np.arange(px, dtype=np.float64) + 0.5) * (extent / px)


# ----------------------------------------------------------------------------- layers
def layer(name):
    """Returns dict(src, zoom, xs, zs, spacing, kind) for every product we build."""
    c, o = CORE, OUTER
    if name == "core_dem":
        ax = dem_axis(c["size"], c["n"])
        return dict(src="dem", zoom=c["dem_z"], xs=ax, zs=ax, spacing=c["size"] / (c["n"] - 1), kind="dem")
    if name == "outer_dem":
        ax = dem_axis(o["size"], o["n"])
        return dict(src="dem", zoom=o["dem_z"], xs=ax, zs=ax, spacing=o["size"] / (o["n"] - 1), kind="dem")
    if name.startswith("core_tex_"):
        r, col = (int(v) for v in name.split("_")[2:4])
        ext = c["size"] / c["grid"]
        xs = tex_axis(-c["size"] / 2 + col * ext, ext, c["px"])
        zs = tex_axis(-c["size"] / 2 + r * ext, ext, c["px"])
        return dict(src="usgs", zoom=c["tex_z"], xs=xs, zs=zs, spacing=ext / c["px"], kind="img")
    if name == "outer_tex":
        ax = tex_axis(-o["size"] / 2, o["size"], o["px"])
        return dict(src="usgs", zoom=o["tex_z"], xs=ax, zs=ax, spacing=o["size"] / o["px"], kind="img")
    if name.startswith("compare_s2_"):
        zoom = int(name.split("_")[2])
        xs, zs, res = compare_axes()
        return dict(src="s2", zoom=zoom, xs=xs, zs=zs, spacing=res, kind="img")
    raise KeyError(name)


def all_layers():
    names = ["core_dem", "outer_dem", "outer_tex"]
    names += [f"core_tex_{r}_{c}" for r in range(CORE["grid"]) for c in range(CORE["grid"])]
    return names


def compare_axes():
    """Texel centres of the shipped core texture that fall in the comparison box."""
    res = CORE["size"] / (CORE["grid"] * CORE["px"])
    xc, zc = x_of_lon(COMPARE["lon"]), z_of_lat(COMPARE["lat"])
    w, h = int(round(COMPARE["w_m"] / res)), int(round(COMPARE["h_m"] / res))
    j0 = int(round((xc - COMPARE["w_m"] / 2 + CORE["size"] / 2) / res))
    i0 = int(round((zc - COMPARE["h_m"] / 2 + CORE["size"] / 2) / res))
    xs = -CORE["size"] / 2 + (np.arange(j0, j0 + w) + 0.5) * res
    zs = -CORE["size"] / 2 + (np.arange(i0, i0 + h) + 0.5) * res
    return xs, zs, res


def window(L):
    """Source pixel window (global pixel indices, half-open) and sample coordinates."""
    sx, sz = src_spacing(L["zoom"])
    sigx, sigz = sigma_for(L["spacing"], sx), sigma_for(L["spacing"], sz)
    u = merc_x(lon_of_x(L["xs"]), L["zoom"]) - 0.5  # pixel centres sit at i + 0.5
    v = merc_y(lat_of_z(L["zs"]), L["zoom"]) - 0.5
    m = int(math.ceil(3 * max(sigx, sigz))) + 3
    x0, x1 = int(math.floor(u.min())) - m, int(math.floor(u.max())) + 2 + m
    y0, y1 = int(math.floor(v.min())) - m, int(math.floor(v.max())) + 2 + m
    return dict(x0=x0, x1=x1, y0=y0, y1=y1, u=u, v=v, sigx=sigx, sigz=sigz)


def tiles_of(W):
    return [(tx, ty) for tx in range(W["x0"] // 256, (W["x1"] - 1) // 256 + 1)
            for ty in range(W["y0"] // 256, (W["y1"] - 1) // 256 + 1)]


# ----------------------------------------------------------------------------- download
def tile_file(src, z, x, y):
    ext = "png" if src == "dem" else "jpg"
    return CACHE / src / str(z) / str(x) / f"{y}.{ext}"


def tile_ok(p):
    try:
        with Image.open(p) as im:
            im.load()
            return im.size == (256, 256) and im.mode in ("RGB", "RGBA", "P", "L", "LA")
    except Exception:
        return False


def curl(url, dest, hdr=None):
    cmd = ["curl", "-sS", "-f", "-L", "--retry", "3", "--retry-delay", "2", "--connect-timeout", "20",
           "--max-time", "90", "-A", UA, "-o", str(dest), url]
    if hdr is not None:
        cmd[1:1] = ["-D", str(hdr)]
    r = subprocess.run(cmd, capture_output=True, text=True)
    return r.returncode, (r.stderr or "").strip()[:300]


def fetch_tile(job):
    src, z, x, y = job
    p = tile_file(src, z, x, y)
    if p.exists() and tile_ok(p):
        return job, "cached", None
    p.parent.mkdir(parents=True, exist_ok=True)
    part, hdr = p.with_name(p.name + ".part"), p.with_name(p.name + ".hdr")
    url = SOURCES[src].format(z=z, x=x, y=y)
    err = None
    for attempt in range(3):
        code, err = curl(url, part, hdr)
        if code == 0 and tile_ok(part):
            part.replace(p)
            return job, "downloaded", None
        err = err or f"curl exit {code}"
        time.sleep(2.0 * (attempt + 1))
    part.unlink(missing_ok=True)
    return job, "failed", f"{url}: {err}"


def fetch_all(jobs, label):
    jobs = sorted(set(jobs))
    t0, counts, failed = time.time(), {"cached": 0, "downloaded": 0, "failed": 0}, []
    with ThreadPoolExecutor(max_workers=4) as ex:
        futs = [ex.submit(fetch_tile, j) for j in jobs]
        for i, f in enumerate(as_completed(futs), 1):
            job, status, err = f.result()
            counts[status] += 1
            if err:
                failed.append(err)
            if i % 250 == 0 or i == len(jobs):
                print(f"  {label}: {i}/{len(jobs)} {counts} {time.time() - t0:.0f}s", flush=True)
    if failed:
        raise SystemExit(f"{label}: {len(failed)} tiles failed, e.g. {failed[:3]}")
    return counts


def download_jobs():
    jobs = {}
    for name in all_layers() + [f"compare_s2_{z}" for z in COMPARE_S2_ZOOMS]:
        L = layer(name)
        for tx, ty in tiles_of(window(L)):
            jobs.setdefault((L["src"], L["zoom"]), set()).add((L["src"], L["zoom"], tx, ty))
    return jobs


def step_plan(args):
    for name in all_layers() + [f"compare_s2_{z}" for z in COMPARE_S2_ZOOMS]:
        L = layer(name)
        W = window(L)
        print(f"{name:<14} {L['src']:<5} z{L['zoom']:<2} out {len(L['xs'])}x{len(L['zs'])} @ {L['spacing']:.2f} m"
              f"  src {src_spacing(L['zoom'])[0]:.2f} m  sigma {W['sigx']:.2f}/{W['sigz']:.2f}"
              f"  window {W['x1'] - W['x0']}x{W['y1'] - W['y0']}  tiles {len(tiles_of(W))}")
    for (src, z), js in sorted(download_jobs().items()):
        cached = sum(1 for j in js if tile_file(*j).exists())
        print(f"{src} z{z}: {len(js)} tiles ({cached} cached)")


def step_download(args):
    jobs = download_jobs()
    summary = {}
    for (src, z), js in sorted(jobs.items()):
        print(f"{src} z{z}: {len(js)} tiles", flush=True)
        summary[f"{src}_z{z}"] = {"tiles": len(js), **fetch_all(js, f"{src} z{z}")}
    # USGS 3DEP point elevations (1 m lidar where available) as an independent reference
    (CACHE / "epqs").mkdir(parents=True, exist_ok=True)

    def one(pt):
        name, lat, lon = pt
        p = CACHE / "epqs" / (name.replace(" ", "_") + ".json")
        if p.exists() and p.stat().st_size > 0:
            return name, "cached"
        code, err = curl(EPQS.format(lat=lat, lon=lon), p)
        return name, "ok" if code == 0 else err

    with ThreadPoolExecutor(max_workers=4) as ex:
        res = list(ex.map(one, epqs_points()))
    print(f"  EPQS: {sum(1 for _, s in res if s in ('ok', 'cached'))}/{len(res)} ok", flush=True)
    (CACHE / "download_summary.json").write_text(json.dumps(summary, indent=1))
    print(json.dumps(summary))


PINNACLE = (36.16903, -112.07638)  # the one z14 source pixel standing >40 m above all 8 neighbours


def epqs_points():
    """Check points + 60 seeded random points in the core + 5x5 grid (30 m) around PINNACLE."""
    pts = [(name, lat, lon) for name, lat, lon, _ in CHECKS]
    rng = np.random.default_rng(20261013)
    half = CORE["size"] / 2 - 200
    for k, (x, z) in enumerate(rng.uniform(-half, half, size=(60, 2))):
        pts.append((f"rand_{k:02d}", round(float(lat_of_z(z)), 6), round(float(lon_of_x(x)), 6)))
    for i in range(-2, 3):
        for j in range(-2, 3):
            lat = PINNACLE[0] - i * 30.0 / KZ
            lon = PINNACLE[1] + j * 30.0 / KX
            pts.append((f"pin_{i + 2}{j + 2}", round(lat, 6), round(lon, 6)))
    return pts


# ----------------------------------------------------------------------------- decode / mosaic
STATS = {"usgs_transparent_px": 0, "usgs_flat_tiles": []}


def decode_terrarium(rgb):
    a = rgb.astype(np.float64)
    return a[..., 0] * 256.0 + a[..., 1] + a[..., 2] / 256.0 - 32768.0


def encode_terrarium(v):
    q = np.round((np.asarray(v, dtype=np.float64) + 32768.0) * 256.0).astype(np.int64)
    if q.min() < 0 or q.max() >= 1 << 24:
        raise ValueError("elevation out of Terrarium range")
    return np.dstack([(q >> 16) & 255, (q >> 8) & 255, q & 255]).astype(np.uint8)


def read_tile(src, z, tx, ty, kind):
    p = tile_file(src, z, tx, ty)
    with Image.open(p) as im:
        if im.size != (256, 256):
            raise ValueError(f"bad tile size {p}")
        if kind == "dem":
            return decode_terrarium(np.asarray(im.convert("RGB")))
        rgba = np.asarray(im.convert("RGBA"))
    transparent = int((rgba[..., 3] < 255).sum())
    if transparent:
        STATS["usgs_transparent_px"] += transparent
    rgb = rgba[..., :3]
    if rgb.reshape(-1, 3).std(0).max() < 2.0:
        STATS["usgs_flat_tiles"].append(f"{src}/{z}/{tx}/{ty}")
    return rgb


def load_mosaic(src, z, W, kind):
    x0, x1, y0, y1 = W["x0"], W["x1"], W["y0"], W["y1"]
    shape = (y1 - y0, x1 - x0) if kind == "dem" else (y1 - y0, x1 - x0, 3)
    out = np.zeros(shape, np.float64 if kind == "dem" else np.uint8)
    for tx, ty in tiles_of(W):
        t = read_tile(src, z, tx, ty, kind)
        gx, gy = tx * 256, ty * 256
        ix0, ix1, iy0, iy1 = max(x0, gx), min(x1, gx + 256), max(y0, gy), min(y1, gy + 256)
        out[iy0 - y0:iy1 - y0, ix0 - x0:ix1 - x0] = t[iy0 - gy:iy1 - gy, ix0 - gx:ix1 - gx]
    return out


def gauss1d(a, sigma, axis):
    if sigma < 0.3:
        return a
    r = int(math.ceil(3 * sigma))
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k = (k / k.sum()).astype(a.dtype)
    a = np.moveaxis(a, axis, 0)
    n = a.shape[0]
    pad = np.concatenate([np.repeat(a[:1], r, 0), a, np.repeat(a[-1:], r, 0)], 0)
    out = k[0] * pad[0:n]
    for i in range(1, 2 * r + 1):
        out += k[i] * pad[i:i + n]
    return np.moveaxis(out, 0, axis)


def bilinear(a, x0, y0, u, v, clamp=False):
    """Separable bilinear sample of window a (global origin x0, y0) at columns u, rows v."""
    uu, vv = u - x0, v - y0
    if clamp:  # edge extension, only for checks/previews that touch the outermost half texel
        uu = np.clip(uu, 0, a.shape[1] - 1 - 1e-9)
        vv = np.clip(vv, 0, a.shape[0] - 1 - 1e-9)
    i = np.floor(uu).astype(np.int64)
    j = np.floor(vv).astype(np.int64)
    if i.min() < 0 or i.max() + 1 >= a.shape[1] or j.min() < 0 or j.max() + 1 >= a.shape[0]:
        raise ValueError("sample outside source window")
    fx, fy = uu - i, vv - j
    ex = (None, slice(None)) + (None,) * (a.ndim - 2)
    ey = (slice(None), None) + (None,) * (a.ndim - 2)
    fx = fx.astype(a.dtype)[ex]
    fy = fy.astype(a.dtype)[ey]
    tmp = a[:, i] * (1 - fx) + a[:, i + 1] * fx
    return tmp[j] * (1 - fy) + tmp[j + 1] * fy


DESPIKE_M = 30.0  # a source pixel this far above/below ALL 8 neighbours is replaced by their median


def despike(e, thr=DESPIKE_M):
    """In place. Returns [(row, col, old, new)] in window coordinates."""
    c = e[1:-1, 1:-1]
    nb = np.stack([e[1 + dy:e.shape[0] - 1 + dy, 1 + dx:e.shape[1] - 1 + dx]
                   for dy in (-1, 0, 1) for dx in (-1, 0, 1) if dy or dx])
    bad = (c - nb.max(0) > thr) | (nb.min(0) - c > thr)
    fixed = []
    if bad.any():
        med = np.median(nb[:, bad], axis=0)
        for (y, x), m in zip(np.argwhere(bad), med):
            fixed.append((int(y) + 1, int(x) + 1, round(float(c[y, x]), 2), round(float(m), 2)))
        c[bad] = med
    return fixed


def render(L, keep_source=False):
    W = window(L)
    mos = load_mosaic(L["src"], L["zoom"], W, L["kind"])
    if L["kind"] == "dem":
        W["spikes_before"] = spike_stats(mos)
        W["despiked"] = despike(mos)
    a = mos if L["kind"] == "dem" else mos.astype(np.float32)
    a = gauss1d(gauss1d(a, W["sigz"], 0), W["sigx"], 1)
    out = bilinear(a, W["x0"], W["y0"], W["u"], W["v"])
    if L["kind"] == "img":
        out = np.clip(np.round(out), 0, 255).astype(np.uint8)
    return (out, mos, W) if keep_source else out


# ----------------------------------------------------------------------------- checks on rasters
def spike_stats(e, thr=40.0):
    """Pixels that stand above (or below) all 8 neighbours by more than thr metres."""
    c = e[1:-1, 1:-1]
    nb = [e[1 + dy:e.shape[0] - 1 + dy, 1 + dx:e.shape[1] - 1 + dx]
          for dy in (-1, 0, 1) for dx in (-1, 0, 1) if dy or dx]
    nmax, nmin = np.max(nb, axis=0), np.min(nb, axis=0)
    up, down = c - nmax, nmin - c
    return {"count_gt_thr": int(((up > thr) | (down > thr)).sum()), "thr_m": thr,
            "max_peak_above_neighbours_m": round(float(up.max()), 2),
            "max_pit_below_neighbours_m": round(float(down.max()), 2)}


def seam_stats(mos, W):
    """Mean |dz| across source tile borders vs inside tiles (1.0 = no seams)."""
    dx = np.abs(np.diff(mos, axis=1))
    dy = np.abs(np.diff(mos, axis=0))
    gx = np.arange(W["x0"], W["x1"] - 1)  # diff between column g and g+1
    gy = np.arange(W["y0"], W["y1"] - 1)
    bx, by = (gx % 256) == 255, (gy % 256) == 255
    rx = dx[:, bx].mean() / dx[:, ~bx].mean() if bx.any() else float("nan")
    ry = dy[by, :].mean() / dy[~by, :].mean() if by.any() else float("nan")
    return {"x_ratio": round(float(rx), 3), "y_ratio": round(float(ry), 3)}


def png_chunks(path):
    data = Path(path).read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("not a PNG")
    pos, chunks, ihdr = 8, [], None
    while pos < len(data):
        (ln,) = struct.unpack(">I", data[pos:pos + 4])
        typ = data[pos + 4:pos + 8].decode("latin-1")
        if typ == "IHDR":
            w, h, depth, ctype = struct.unpack(">IIBB", data[pos + 8:pos + 18])
            ihdr = {"w": w, "h": h, "bit_depth": depth, "color_type": ctype}
        chunks.append(typ)
        pos += 12 + ln
    return sorted(set(chunks)), ihdr


# ----------------------------------------------------------------------------- build
def save_jpeg(arr_or_img, path, q=JPEG_Q):
    im = arr_or_img if isinstance(arr_or_img, Image.Image) else Image.fromarray(arr_or_img)
    im.save(path, "JPEG", quality=q, optimize=True, progressive=False, subsampling="4:2:0")


def dem_sources():
    srcs = {}
    for hdr in sorted((CACHE / "dem").rglob("*.hdr")):
        z = hdr.relative_to(CACHE / "dem").parts[0]
        for line in hdr.read_text(errors="replace").splitlines():
            if line.lower().startswith("x-amz-meta-x-imagery-sources:"):
                for s in line.split(":", 1)[1].split(","):
                    srcs.setdefault(s.strip(), set()).add(int(z))
    return {k: sorted(v) for k, v in sorted(srcs.items())}


def color_match_params(outer_overlap, core_overlap):
    """Per-channel gain/offset that makes the outer imagery match the core imagery on the overlap."""
    params = []
    for ch in range(3):
        a = outer_overlap[..., ch].astype(np.float64).ravel()
        b = np.asarray(core_overlap[..., ch], dtype=np.float64).ravel()
        gain = float(b.std() / max(a.std(), 1e-6))
        off = float(b.mean() - gain * a.mean())
        params.append({"gain": round(gain, 4), "offset": round(off, 2),
                       "outer_mean": round(float(a.mean()), 1), "core_mean": round(float(b.mean()), 1),
                       "outer_std": round(float(a.std()), 1), "core_std": round(float(b.std()), 1)})
    return params


def apply_color(img, params):
    o = img.astype(np.float64)
    for ch, p in enumerate(params):
        o[..., ch] = o[..., ch] * p["gain"] + p["offset"]
    return np.clip(np.round(o), 0, 255).astype(np.uint8)


def core_on_grid(core_full, xs, zs):
    """Sample the full core texture mosaic (6144^2) at local positions xs, zs with area filtering."""
    res = CORE["size"] / core_full.shape[1]
    sig = sigma_for((xs[1] - xs[0]), res)
    a = gauss1d(gauss1d(core_full.astype(np.float32), sig, 0), sig, 1)
    u = (xs + CORE["size"] / 2) / res - 0.5
    v = (zs + CORE["size"] / 2) / res - 0.5
    return bilinear(a, 0, 0, u, v, clamp=True)


def step_build(args):
    OUT.mkdir(parents=True, exist_ok=True)
    CREDITS.parent.mkdir(parents=True, exist_ok=True)
    DOCS.mkdir(parents=True, exist_ok=True)
    report = {"generated": time.strftime("%Y-%m-%d %H:%M:%S %z"), "dem": {}, "tex": {}}

    # --- DEMs
    dem_meta = {}
    for name, cfg in (("core_dem", CORE), ("outer_dem", OUTER)):
        L = layer(name)
        dem, mos, W = render(L, keep_source=True)
        if not np.isfinite(dem).all():
            raise SystemExit(f"{name}: non-finite values")
        rgb = encode_terrarium(dem)
        path = OUT / f"{name}.png"
        Image.fromarray(rgb).save(path, "PNG", optimize=True)
        back = decode_terrarium(np.asarray(Image.open(path).convert("RGB")))
        err = float(np.abs(back - dem).max())
        chunks, ihdr = png_chunks(path)
        report["dem"][name] = {
            "zoom": L["zoom"], "source_window_px": [W["x1"] - W["x0"], W["y1"] - W["y0"]],
            "prefilter_sigma_px": [round(W["sigx"], 3), round(W["sigz"], 3)],
            "spacing_m": L["spacing"], "src_spacing_m": [round(s, 3) for s in src_spacing(L["zoom"])],
            "source_min_m": round(float(mos.min()), 2), "source_max_m": round(float(mos.max()), 2),
            "source_spikes": W["spikes_before"], "source_seams": seam_stats(mos, W),
            "despiked": [{"lat": round(float(lat_of_px(W["y0"] + y, L["zoom"])), 6),
                          "lon": round(float(lon_of_px(W["x0"] + x, L["zoom"])), 6), "old_m": old, "new_m": new}
                         for (y, x, old, new) in W["despiked"]],
            "source_spikes_after": spike_stats(mos),
            "out_min_m": round(float(back.min()), 2), "out_max_m": round(float(back.max()), 2),
            "out_spikes": spike_stats(back), "roundtrip_max_err_m": err,
            "png_chunks": chunks, "ihdr": ihdr, "bytes": path.stat().st_size,
        }
        if err >= 0.01:
            raise SystemExit(f"{name}: round-trip error {err}")
        if any(c in chunks for c in ("gAMA", "iCCP", "sRGB", "cHRM", "tRNS")) or ihdr["color_type"] != 2 \
                or ihdr["bit_depth"] != 8:
            raise SystemExit(f"{name}: unexpected PNG layout {chunks} {ihdr}")
        dem_meta[name] = {"file": path.name, "n": cfg["n"], "encoding": "terrarium",
                          "min_m": round(float(back.min()), 2), "max_m": round(float(back.max()), 2)}
        if name == "core_dem":
            np.save(CACHE / "core_dem_float.npy", dem)
            np.save(CACHE / "core_dem_source.npy", mos)
            (CACHE / "core_dem_source_window.json").write_text(
                json.dumps({k: W[k] for k in ("x0", "x1", "y0", "y1")}))
        print(f"{name}: {dem.shape} {back.min():.1f}..{back.max():.1f} m, round-trip {err:.5f} m, "
              f"{path.stat().st_size / 1e6:.2f} MB", flush=True)

    # --- core texture tiles
    g, px, mpx = CORE["grid"], CORE["px"], CORE["mpx"]
    core_full = np.zeros((g * px, g * px, 3), np.uint8)
    for r in range(g):
        for c in range(g):
            L = layer(f"core_tex_{r}_{c}")
            W = window(L)
            img = render(L)
            core_full[r * px:(r + 1) * px, c * px:(c + 1) * px] = img
            save_jpeg(img, OUT / f"core_tex_{r}_{c}.jpg")
            save_jpeg(Image.fromarray(img).resize((mpx, mpx), Image.Resampling.LANCZOS), OUT / f"core_texm_{r}_{c}.jpg")
            print(f"core_tex_{r}_{c}: sigma {W['sigx']:.2f}/{W['sigz']:.2f}px, "
                  f"{(OUT / f'core_tex_{r}_{c}.jpg').stat().st_size / 1e6:.2f} MB", flush=True)
    report["tex"]["core"] = {"zoom": CORE["tex_z"], "texel_m": CORE["size"] / (g * px),
                             "src_spacing_m": [round(s, 3) for s in src_spacing(CORE["tex_z"])],
                             "prefilter_sigma_px": [round(W["sigx"], 3), round(W["sigz"], 3)]}

    # --- outer texture, colour-matched to the core imagery over the overlap
    L = layer("outer_tex")
    W = window(L)
    outer = render(L)
    xs = L["xs"]
    inside = np.where(np.abs(xs) < CORE["size"] / 2 - 300)[0]
    core_s = core_on_grid(core_full, xs[inside], xs[inside])
    sub = outer[inside[0]:inside[-1] + 1, inside[0]:inside[-1] + 1]
    diff_before = np.abs(sub.astype(np.float64).mean((0, 1)) - core_s.mean((0, 1)))
    # gain/offset estimated on the overlap only, then applied to the whole outer texture
    params = color_match_params(sub, core_s)
    outer_out = outer if args.no_color_match else apply_color(outer, params)
    save_jpeg(outer_out, OUT / "outer_tex.jpg")
    save_jpeg(Image.fromarray(outer_out).resize((OUTER["mpx"],) * 2, Image.Resampling.LANCZOS), OUT / "outer_texm.jpg")
    np.save(CACHE / "outer_tex_raw.npy", outer)
    report["tex"]["outer"] = {"zoom": OUTER["tex_z"], "texel_m": OUTER["size"] / OUTER["px"],
                              "src_spacing_m": [round(s, 3) for s in src_spacing(OUTER["tex_z"])],
                              "prefilter_sigma_px": [round(W["sigx"], 3), round(W["sigz"], 3)],
                              "color_match": None if args.no_color_match else params,
                              "mean_abs_rgb_diff_before": [round(float(d), 1) for d in diff_before]}
    report["usgs_transparent_px"] = STATS["usgs_transparent_px"]
    report["usgs_flat_tiles"] = STATS["usgs_flat_tiles"]
    print(f"outer_tex: colour match {params}", flush=True)

    # --- sizes
    files = sorted(p for p in OUT.iterdir() if p.is_file())
    sizes = {p.name: p.stat().st_size for p in files}
    report["sizes"] = sizes
    report["total_bytes"] = sum(v for k, v in sizes.items() if k != "meta.json")
    report["dem_sources"] = dem_sources()
    (CACHE / "build_report.json").write_text(json.dumps(report, indent=1, ensure_ascii=False))
    write_meta(dem_meta, checks=None)
    write_credits()
    print(f"total {report['total_bytes'] / 1e6:.2f} MB", flush=True)


ATTRIBUTION = [
    "Elevation: Terrain Tiles (Tilezen/Mapzen, AWS Open Data) — United States 3DEP (formerly NED) "
    "and global GMTED2010 and SRTM terrain data courtesy of the U.S. Geological Survey.",
    "Imagery: USDA, USGS The National Map: Orthoimagery (USGS Imagery Only, NAIP).",
]


def write_meta(dem_meta, checks):
    meta_path = OUT / "meta.json"
    old = json.loads(meta_path.read_text()) if meta_path.exists() else {}
    c, o = CORE, OUTER
    meta = {
        "origin": {"lat": LAT0, "lon": LON0},
        "core": {"size_m": int(c["size"]),
                 "dem": dem_meta["core_dem"] if dem_meta else old["core"]["dem"],
                 "tex": {"grid": c["grid"], "px": c["px"], "file": "core_tex_{row}_{col}.jpg",
                         "mobile_px": c["mpx"], "mobile_file": "core_texm_{row}_{col}.jpg"}},
        "outer": {"size_m": int(o["size"]),
                  "dem": dem_meta["outer_dem"] if dem_meta else old["outer"]["dem"],
                  "tex": {"px": o["px"], "file": "outer_tex.jpg", "mobile_px": o["mpx"], "mobile_file": "outer_texm.jpg"}},
        "checks": checks if checks is not None else old.get("checks", []),
        "attribution": ATTRIBUTION,
    }
    meta_path.write_text(json.dumps(meta, indent=1, ensure_ascii=False) + "\n")


def write_credits():
    ned = sorted({Path(s).stem.replace("img", "").replace("_13", "") for s in dem_sources()})
    credits = [
        {
            "what_ko": "그랜드캐니언 3D 지형의 높이(DEM)",
            "title": "Terrain Tiles (Terrarium) — USGS 3DEP (NED) 1/3 arc-second, tiles " + ", ".join(ned),
            "author": "U.S. Geological Survey; tiles by Tilezen Joerd (Mapzen), hosted by AWS Open Data",
            "license": "Public domain (U.S. Government work)",
            "url": "https://registry.opendata.aws/terrain-tiles/",
            "attribution": "United States 3DEP (formerly NED) and global GMTED2010 and SRTM terrain data "
                           "courtesy of the U.S. Geological Survey.",
        },
        {
            "what_ko": "그랜드캐니언 3D 지형에 입힌 항공 사진",
            "title": "USGS Imagery Only (The National Map) — NAIP orthoimagery 2017–2021",
            "author": "USDA Farm Service Agency (NAIP); U.S. Geological Survey, The National Map",
            "license": "Public domain (U.S. Government work)",
            "url": "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer",
            "attribution": "USDA, USGS The National Map: Orthoimagery",
        },
    ]
    CREDITS.write_text(json.dumps(credits, indent=1, ensure_ascii=False) + "\n")


# ----------------------------------------------------------------------------- check
def read_core_dem():
    return decode_terrarium(np.asarray(Image.open(OUT / "core_dem.png").convert("RGB")))


def read_outer_dem():
    return decode_terrarium(np.asarray(Image.open(OUT / "outer_dem.png").convert("RGB")))


def sample_grid(e, size, x, z):
    n = e.shape[0]
    step = size / (n - 1)
    c, r = (x + size / 2) / step, (z + size / 2) / step
    i, j = int(math.floor(c)), int(math.floor(r))
    fx, fy = c - i, r - j
    return float(e[j, i] * (1 - fx) * (1 - fy) + e[j, i + 1] * fx * (1 - fy)
                 + e[j + 1, i] * (1 - fx) * fy + e[j + 1, i + 1] * fx * fy)


def hillshade(e, cell, az_deg, alt_deg, grad=None):
    gy, gx = grad if grad is not None else np.gradient(e, cell)
    dzdx, dzdn = gx, -gy  # rows run north -> south
    az, alt = math.radians(az_deg), math.radians(alt_deg)
    sun = (math.sin(az) * math.cos(alt), math.cos(az) * math.cos(alt), math.sin(alt))
    s = (-dzdx * sun[0] - dzdn * sun[1] + sun[2]) / np.sqrt(1 + dzdx ** 2 + dzdn ** 2)
    return np.clip(s, 0, 1)


def corr(a, b):
    a = (a - a.mean()) / (a.std() + 1e-9)
    b = (b - b.mean()) / (b.std() + 1e-9)
    return float((a * b).mean())


def best_shift(A, B, m):
    """Shift (dy, dx) of B against A with the highest correlation, sub-cell by parabola."""
    H, Wd = A.shape
    a = A[m:H - m, m:Wd - m]
    R = np.zeros((2 * m + 1, 2 * m + 1))
    for dy in range(-m, m + 1):
        for dx in range(-m, m + 1):
            R[dy + m, dx + m] = corr(a, B[m + dy:H - m + dy, m + dx:Wd - m + dx])
    iy, ix = np.unravel_index(int(R.argmax()), R.shape)

    def para(cm, c0, cp):
        d = cm - 2 * c0 + cp
        return 0.0 if d >= 0 else 0.5 * (cm - cp) / d

    fy = para(R[iy - 1, ix], R[iy, ix], R[iy + 1, ix]) if 0 < iy < 2 * m else 0.0
    fx = para(R[iy, ix - 1], R[iy, ix], R[iy, ix + 1]) if 0 < ix < 2 * m else 0.0
    return {"dy": round(iy - m + fy, 2), "dx": round(ix - m + fx, 2),
            "r_best": round(float(R[iy, ix]), 3), "r_zero": round(float(R[m, m]), 3)}


def luminance(rgb):
    rgb = np.asarray(rgb, dtype=np.float64)
    return 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]


def load_core_full_from_jpegs(mobile=False):
    g = CORE["grid"]
    px = CORE["mpx"] if mobile else CORE["px"]
    stem = "core_texm" if mobile else "core_tex"
    full = np.zeros((g * px, g * px, 3), np.uint8)
    for r in range(g):
        for c in range(g):
            full[r * px:(r + 1) * px, c * px:(c + 1) * px] = np.asarray(
                Image.open(OUT / f"{stem}_{r}_{c}.jpg").convert("RGB"))
    return full


def step_check(args):
    rep = json.loads((CACHE / "build_report.json").read_text())
    core, outer = read_core_dem(), read_outer_dem()
    src = np.load(CACHE / "core_dem_source.npy")
    sw = json.loads((CACHE / "core_dem_source_window.json").read_text())
    out = {"frame": {"lat0": LAT0, "lon0": LON0, "kx_m_per_deg": KX, "kz_m_per_deg": KZ}}

    def src_at(lat, lon):  # despiked z14 source mosaic, bilinear, unfiltered
        u = float(merc_x(lon, CORE["dem_z"])) - 0.5 - sw["x0"]
        v = float(merc_y(lat, CORE["dem_z"])) - 0.5 - sw["y0"]
        i, j = int(math.floor(u)), int(math.floor(v))
        fx, fy = u - i, v - j
        return float(src[j, i] * (1 - fx) * (1 - fy) + src[j, i + 1] * fx * (1 - fy)
                     + src[j + 1, i] * (1 - fx) * fy + src[j + 1, i + 1] * fx * fy)

    def epqs_val(name):
        """(value, is_1m) from the cached USGS point query, or (None, None)."""
        try:
            d = json.loads((CACHE / "epqs" / (name.replace(" ", "_") + ".json")).read_text())
            v = float(d["value"])
            return (v, d.get("resolution") == 1) if v > -1000 else (None, None)
        except Exception:
            return None, None

    # independent reference: USGS 3DEP point service at 60 seeded random points. Only the points it
    # answers from 1 m lidar are independent of NED; the rest come from the 1/3" seamless DEM.
    dc, ds, dc10, pin = [], [], [], {}
    for name, lat, lon in epqs_points():
        ref, is1m = epqs_val(name)
        if ref is None:
            continue
        x, z = x_of_lon(lon), z_of_lat(lat)
        if name.startswith("rand_"):
            if is1m:
                dc.append(sample_grid(core, CORE["size"], x, z) - ref)
                ds.append(src_at(lat, lon) - ref)
            else:
                dc10.append(sample_grid(core, CORE["size"], x, z) - ref)
        elif name == "pin_22":
            pin = {"lat": lat, "lon": lon, "ref_m": round(ref, 1), "ref_is_1m_lidar": is1m,
                   "source_despiked_m": round(src_at(lat, lon), 1),
                   "core_m": round(sample_grid(core, CORE["size"], x, z), 1)}

    def dstats(d):
        d = np.asarray(d)
        return {"n": int(d.size), "median": round(float(np.median(d)), 1), "mean": round(float(d.mean()), 1),
                "rms": round(float(np.sqrt((d ** 2).mean())), 1), "abs_p90": round(float(np.percentile(np.abs(d), 90)), 1),
                "abs_max": round(float(np.abs(d).max()), 1)}

    out["lidar_compare"] = {"core_minus_lidar1m_m": dstats(dc), "ned_z14_minus_lidar1m_m": dstats(ds),
                            "core_minus_3dep_13arcsec_m": dstats(dc10) if dc10 else None, "pinnacle": pin}

    # check points
    pts = []
    for name, lat, lon, expect in CHECKS:
        x, z = x_of_lon(lon), z_of_lat(lat)
        e_core = sample_grid(core, CORE["size"], x, z)
        e_outer = sample_grid(outer, OUTER["size"], x, z)
        e_src = src_at(lat, lon)
        # local relief around the point (core grid, 3x3 cells ~ +-13 m)
        n = CORE["n"]
        step = CORE["size"] / (n - 1)
        ci, rj = int(round((x + CORE["size"] / 2) / step)), int(round((z + CORE["size"] / 2) / step))
        nb = core[rj - 1:rj + 2, ci - 1:ci + 2]
        ref = None
        p = CACHE / "epqs" / (name.replace(" ", "_") + ".json")
        if p.exists():
            try:
                d = json.loads(p.read_text())
                ref = {"value_m": round(float(d["value"]), 2), "resolution_m": d.get("resolution"),
                       "acquired": (d.get("attributes") or {}).get("AcquisitionDate")}
            except Exception:
                ref = None
        pts.append({"name": name, "lat": lat, "lon": lon, "x_m": round(x, 1), "z_m": round(z, 1),
                    "core_m": round(e_core, 1), "outer_m": round(e_outer, 1), "source_z14_m": round(e_src, 1),
                    "relief_3x3_m": [round(float(nb.min()), 1), round(float(nb.max()), 1)],
                    "expected_m": expect, "epqs_3dep": ref})
    out["checks"] = pts

    # river surface at Phantom Ranch: the lowest core DEM vertex within 800 m of the ranch
    ax = dem_axis(CORE["size"], CORE["n"])
    px_, pz_ = x_of_lon(-112.0947), z_of_lat(36.1055)
    near = ((ax[None, :] - px_) ** 2 + (ax[:, None] - pz_) ** 2) < 800.0 ** 2
    r, c = np.unravel_index(int(np.argmin(np.where(near, core, np.inf))), core.shape)
    out["river_near_phantom_ranch"] = {"elev_m": round(float(core[r, c]), 1),
                                       "lat": round(float(lat_of_z(ax[r])), 5), "lon": round(float(lon_of_x(ax[c])), 5),
                                       "x_m": round(float(ax[c]), 1), "z_m": round(float(ax[r]), 1)}

    # alignment 1: core DEM hillshade vs core texture luminance (on the DEM grid)
    tex = load_core_full_from_jpegs()
    xs = dem_axis(CORE["size"], CORE["n"])
    lum = luminance(core_on_grid(tex, xs, xs))
    step = CORE["size"] / (CORE["n"] - 1)
    best = None
    grad = np.gradient(core, step)
    for az in range(0, 360, 15):
        for alt in (30, 45, 60, 75):
            hs = hillshade(core, step, az, alt, grad)
            r = corr(hs[20:-20:2, 20:-20:2], lum[20:-20:2, 20:-20:2])
            if best is None or r > best[0]:
                best = (r, az, alt)
    hs = hillshade(core, step, best[1], best[2])
    sh = best_shift(hs[8:-8, 8:-8], lum[8:-8, 8:-8], 4)
    out["align_core_tex_vs_dem"] = {"sun_az": best[1], "sun_alt": best[2], **sh,
                                    "dx_m": round(sh["dx"] * step, 1), "dy_m": round(sh["dy"] * step, 1),
                                    "cell_m": step}

    # alignment 2: outer texture vs core texture over the overlap (outer texel grid)
    otex = np.asarray(Image.open(OUT / "outer_tex.jpg").convert("RGB"))
    oxs = tex_axis(-OUTER["size"] / 2, OUTER["size"], OUTER["px"])
    inside = np.where(np.abs(oxs) < CORE["size"] / 2 - 400)[0]
    c_on_o = luminance(core_on_grid(tex, oxs[inside], oxs[inside]))
    o_sub = luminance(otex[inside[0]:inside[-1] + 1, inside[0]:inside[-1] + 1])
    sh2 = best_shift(c_on_o, o_sub, 4)
    ocell = OUTER["size"] / OUTER["px"]
    out["align_outer_tex_vs_core_tex"] = {**sh2, "dx_m": round(sh2["dx"] * ocell, 1),
                                          "dy_m": round(sh2["dy"] * ocell, 1), "cell_m": ocell}
    orgb = otex[inside[0]:inside[-1] + 1, inside[0]:inside[-1] + 1].reshape(-1, 3).astype(np.float64)
    crgb = core_on_grid(tex, oxs[inside], oxs[inside]).reshape(-1, 3)
    out["outer_vs_core_rgb_mean"] = {"outer": orgb.mean(0).round(1).tolist(), "core": crgb.mean(0).round(1).tolist()}

    # alignment 3: outer DEM hillshade vs outer texture (on the outer DEM grid)
    oaxis = dem_axis(OUTER["size"], OUTER["n"])
    ostep = OUTER["size"] / (OUTER["n"] - 1)
    osig = sigma_for(ostep, ocell)
    oblur = gauss1d(gauss1d(otex.astype(np.float32), osig, 0), osig, 1)
    olum = luminance(bilinear(oblur, 0, 0, (oaxis + OUTER["size"] / 2) / ocell - 0.5,
                              (oaxis + OUTER["size"] / 2) / ocell - 0.5, clamp=True))
    ohs = hillshade(outer, ostep, best[1], best[2])
    sh3 = best_shift(ohs[6:-6, 6:-6], olum[6:-6, 6:-6], 3)
    out["align_outer_tex_vs_outer_dem"] = {**sh3, "dx_m": round(sh3["dx"] * ostep, 1),
                                           "dy_m": round(sh3["dy"] * ostep, 1), "cell_m": ostep}

    # outer DEM vs core DEM where they overlap
    o_at_core = np.array([[sample_grid(outer, OUTER["size"], x, z) for x in xs[::8]] for z in xs[::8]])
    d = o_at_core - core[::8, ::8]
    out["outer_minus_core_dem_m"] = {"mean": round(float(d.mean()), 2), "rms": round(float(np.sqrt((d ** 2).mean())), 2),
                                     "p01": round(float(np.percentile(d, 1)), 1),
                                     "p99": round(float(np.percentile(d, 99)), 1)}
    # core edge vs outer along the core border (what the seam would show)
    edge = np.concatenate([core[0, :], core[-1, :], core[:, 0], core[:, -1]])
    edge_o = np.concatenate([[sample_grid(outer, OUTER["size"], x, -CORE["size"] / 2) for x in xs],
                             [sample_grid(outer, OUTER["size"], x, CORE["size"] / 2) for x in xs],
                             [sample_grid(outer, OUTER["size"], -CORE["size"] / 2, z) for z in xs],
                             [sample_grid(outer, OUTER["size"], CORE["size"] / 2, z) for z in xs]])
    de = edge_o - edge
    out["seam_outer_minus_core_on_core_border_m"] = {"mean": round(float(de.mean()), 2),
                                                     "rms": round(float(np.sqrt((de ** 2).mean())), 2),
                                                     "min": round(float(de.min()), 1), "max": round(float(de.max()), 1)}
    out["build"] = rep
    (DOCS / "terrain_checks.json").write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")

    meta_checks = [{"name": p["name"], "lat": p["lat"], "lon": p["lon"], "elev_m": p["core_m"],
                    "x_m": p["x_m"], "z_m": p["z_m"],
                    "ref_3dep_1m_m": p["epqs_3dep"]["value_m"] if p["epqs_3dep"] else None} for p in pts]
    write_meta(None, meta_checks)
    for p in pts:
        print(f"{p['name']:<20} core {p['core_m']:7.1f}  src {p['source_z14_m']:7.1f}  outer {p['outer_m']:7.1f}"
              f"  3DEP {p['epqs_3dep']['value_m'] if p['epqs_3dep'] else '-':>8}  expect {p['expected_m']}")
    for k in ("river_near_phantom_ranch", "lidar_compare", "align_core_tex_vs_dem", "align_outer_tex_vs_core_tex", "align_outer_tex_vs_outer_dem",
              "outer_minus_core_dem_m", "seam_outer_minus_core_on_core_border_m", "outer_vs_core_rgb_mean"):
        print(k, out[k])


# ----------------------------------------------------------------------------- preview
def font(size, bold=False):
    for idx in ((6, 2, 0) if bold else (0,)):
        try:
            return ImageFont.truetype(FONT_PATH, size, index=idx)
        except Exception:
            continue
    return ImageFont.load_default()


def contour_mask(e, interval):
    b = np.floor(e / interval)
    m = np.zeros(e.shape, bool)
    m[:, :-1] |= b[:, :-1] != b[:, 1:]
    m[:-1, :] |= b[:-1, :] != b[1:, :]
    return m


def dem_on(e, size, xs, zs):
    n = e.shape[0]
    step = size / (n - 1)
    return bilinear(e, 0, 0, (xs + size / 2) / step, (zs + size / 2) / step)


def overlay(rgb, e, minor, major, shade=None):
    img = rgb.astype(np.float32)
    if shade is not None:
        img = img * (0.35 + 0.65 * shade[..., None])
    for interval, color, alpha in ((minor, (255, 230, 90), 0.55), (major, (255, 80, 60), 0.9)):
        m = contour_mask(e, interval)
        img[m] = img[m] * (1 - alpha) + np.array(color, np.float32) * alpha
    return np.clip(img, 0, 255).astype(np.uint8)


def panel_crop(tex_full, core, xc, zc, half, out_px):
    res = CORE["size"] / tex_full.shape[1]
    xs = np.linspace(xc - half, xc + half, out_px)
    zs = np.linspace(zc - half, zc + half, out_px)
    u = (xs + CORE["size"] / 2) / res - 0.5
    v = (zs + CORE["size"] / 2) / res - 0.5
    rgb = np.clip(bilinear(tex_full.astype(np.float32), 0, 0, u, v), 0, 255)
    e = dem_on(core, CORE["size"], xs, zs)
    return rgb, e, xs, zs


def mark(draw, pts, to_px, f):
    for name, lat, lon, _ in pts:
        X, Y = to_px(x_of_lon(lon), z_of_lat(lat))
        if X is None:
            continue
        draw.ellipse([X - 7, Y - 7, X + 7, Y + 7], outline=(0, 255, 255), width=3)
        draw.text((X + 10, Y - 10), name, fill=(0, 255, 255), font=f, stroke_width=2, stroke_fill=(0, 0, 0))


def step_preview(args):
    core = read_core_dem()
    outer = read_outer_dem()
    tex = load_core_full_from_jpegs()
    otex = np.asarray(Image.open(OUT / "outer_tex.jpg").convert("RGB"))
    S = 1000
    f, fb = font(22), font(30, bold=True)
    panels = []

    # A: whole core, texture x hillshade with 100/500 m contours
    xs = tex_axis(-CORE["size"] / 2, CORE["size"], S)
    rgb = np.asarray(Image.fromarray(tex).resize((S, S), Image.Resampling.LANCZOS)).astype(np.float32)
    e = dem_on(core, CORE["size"], xs, xs)
    hs = hillshade(e, CORE["size"] / S, 315, 45)
    a = Image.fromarray(overlay(rgb, e, 100, 500, shade=hs))
    d = ImageDraw.Draw(a)

    def to_core(x, z):
        return (x + CORE["size"] / 2) / CORE["size"] * S, (z + CORE["size"] / 2) / CORE["size"] * S

    mark(d, CHECKS, to_core, f)
    panels.append((a, "코어 20 km — 항공 사진 × 음영, 등고선 100 m(노랑)·500 m(빨강)"))

    # B: outer 100 km with 250/1000 m contours and the core square
    oxs = tex_axis(-OUTER["size"] / 2, OUTER["size"], S)
    orgb = np.asarray(Image.fromarray(otex).resize((S, S), Image.Resampling.LANCZOS)).astype(np.float32)
    oe = dem_on(outer, OUTER["size"], oxs, oxs)
    ohs = hillshade(oe, OUTER["size"] / S, 315, 45)
    b = Image.fromarray(overlay(orgb, oe, 250, 1000, shade=ohs))
    d = ImageDraw.Draw(b)
    k = S / OUTER["size"]
    d.rectangle([(-10000 + 50000) * k, (-10000 + 50000) * k, (10000 + 50000) * k, (10000 + 50000) * k],
                outline=(0, 255, 255), width=3)
    panels.append((b, "바깥 100 km — 등고선 250 m·1000 m, 하늘색 = 코어"))

    # C, D: close-ups at shipped resolution, 2.4 km wide
    for (lat, lon, title) in ((36.1018, -112.0945, "팬텀 랜치·안쪽 협곡 2.4 km — 등고선 20 m·100 m"),
                              (36.0640, -112.1110, "매더·야바파이 포인트 2.4 km — 등고선 20 m·100 m")):
        xc, zc = x_of_lon(lon), z_of_lat(lat)
        rgb, e, cxs, czs = panel_crop(tex, core, xc, zc, 1200.0, S)
        im = Image.fromarray(overlay(rgb, e, 20, 100))
        d = ImageDraw.Draw(im)

        def to_crop(x, z, cxs=cxs, czs=czs):
            if not (cxs[0] <= x <= cxs[-1] and czs[0] <= z <= czs[-1]):
                return None, None
            return (x - cxs[0]) / (cxs[-1] - cxs[0]) * S, (z - czs[0]) / (czs[-1] - czs[0]) * S

        mark(d, CHECKS, to_crop, f)
        panels.append((im, title))

    pad, head = 16, 52
    canvas = Image.new("RGB", (2 * S + 3 * pad, 2 * (S + head) + 3 * pad), (20, 22, 26))
    dc = ImageDraw.Draw(canvas)
    for idx, (im, title) in enumerate(panels):
        cx, cy = pad + (idx % 2) * (S + pad), pad + (idx // 2) * (S + head + pad)
        dc.text((cx, cy + 8), title, fill=(235, 235, 235), font=fb)
        canvas.paste(im, (cx, cy + head))
    canvas.save(DOCS / "terrain_preview.jpg", "JPEG", quality=88)
    for idx, (im, _) in enumerate(panels):
        im.save(CACHE / f"preview_panel_{idx}.jpg", "JPEG", quality=90)
    print("wrote", DOCS / "terrain_preview.jpg")


# ----------------------------------------------------------------------------- compare
def step_compare(args):
    tex = load_core_full_from_jpegs()
    xs, zs, res = compare_axes()
    j0 = int(round((xs[0] + CORE["size"] / 2) / res - 0.5))
    i0 = int(round((zs[0] + CORE["size"] / 2) / res - 0.5))
    usgs = tex[i0:i0 + len(zs), j0:j0 + len(xs)]
    fb, fs = font(34, bold=True), font(20)
    for zoom in COMPARE_S2_ZOOMS:
        s2 = render(layer(f"compare_s2_{zoom}"))
        s2_res = src_spacing(zoom)[0]
        H, Wd = usgs.shape[:2]
        pad, head, foot = 24, 118, 74
        canvas = Image.new("RGB", (2 * Wd + 3 * pad, H + head + foot + pad), (18, 20, 24))
        dc = ImageDraw.Draw(canvas)
        labels = [("USGS 공공 영역 항공 사진",
                   f"NAIP 2017–2021 · 사이트에 싣는 해상도 {res:.1f} m/px · 공공 영역"),
                  ("Sentinel-2 10 m",
                   f"EOxCloudless 2016판 z{zoom} ({s2_res:.1f} m/px를 같은 크기로 늘림) · CC BY 4.0 · 비교용, 싣지 않음")]
        for k, (img, (t1, t2)) in enumerate(zip((usgs, s2), labels)):
            cx = pad + k * (Wd + pad)
            dc.text((cx, 18), t1, fill=(245, 245, 245), font=fb)
            dc.text((cx, 66), t2, fill=(190, 196, 205), font=fs)
            canvas.paste(Image.fromarray(img), (cx, head))
            # 500 m scale bar
            bar = 500.0 / res
            bx, by = cx + 24, head + H - 34
            dc.rectangle([bx - 6, by - 30, bx + bar + 6, by + 14], fill=(0, 0, 0))
            dc.rectangle([bx, by, bx + bar, by + 6], fill=(255, 255, 255))
            dc.text((bx, by - 28), "500 m", fill=(255, 255, 255), font=fs)
        lat_c, lon_c = COMPARE["lat"], COMPARE["lon"]
        dc.text((pad, head + H + 12),
                f"같은 곳 {COMPARE['w_m'] / 1000:.0f} km × {COMPARE['h_m'] / 1000:.1f} km — 팬텀 랜치와 콜로라도강 안쪽 협곡"
                f" (중심 {lat_c:.4f}, {lon_c:.4f}), 위가 북쪽", fill=(220, 220, 220), font=fs)
        dc.text((pad, head + H + 40),
                "USDA, USGS The National Map: Orthoimagery  |  EOxCloudless https://cloudless.eox.at by EOX IT "
                "Services GmbH (Contains modified Copernicus Sentinel data 2016), CC BY 4.0",
                fill=(150, 156, 165), font=fs)
        name = "compare_imagery.jpg" if zoom == 13 else f"compare_imagery_s2z{zoom}.jpg"
        canvas.save(DOCS / name, "JPEG", quality=90)
        print("wrote", DOCS / name, canvas.size)


# ----------------------------------------------------------------------------- probe
def step_probe(args):
    """Same 7.9 km square (one z12 tile at Phantom Ranch) from USGS z12, z13, z14 and z16."""
    tx12, ty12 = 772, 1606
    panels = []
    for z in (12, 13, 14, 16):
        k = 2 ** (z - 12)
        jobs = [("usgs", z, tx12 * k + i, ty12 * k + j) for i in range(k) for j in range(k)]
        fetch_all(jobs, f"probe usgs z{z}")
        mos = np.zeros((256 * k, 256 * k, 3), np.uint8)
        for (_, _, tx, ty) in jobs:
            r0, c0 = (ty - ty12 * k) * 256, (tx - tx12 * k) * 256
            mos[r0:r0 + 256, c0:c0 + 256] = read_tile("usgs", z, tx, ty, "img")
        im = Image.fromarray(mos).resize((600, 600), Image.Resampling.LANCZOS)
        panels.append((z, im, mos.reshape(-1, 3).mean(0).round(1), mos.reshape(-1, 3).std(0).round(1)))
    canvas = Image.new("RGB", (4 * 610, 650), (20, 22, 26))
    d = ImageDraw.Draw(canvas)
    for k, (z, im, mean, std) in enumerate(panels):
        canvas.paste(im, (k * 610, 50))
        d.text((k * 610 + 8, 10), f"z{z} mean {mean.tolist()} std {std.tolist()}", fill=(240, 240, 240), font=font(18))
        print(f"z{z}: mean {mean.tolist()} std {std.tolist()}")
    canvas.save(CACHE / "probe_outer_zoom.jpg", "JPEG", quality=90)
    print("wrote", CACHE / "probe_outer_zoom.jpg")


# ----------------------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("step", choices=["plan", "download", "probe", "build", "check", "preview", "compare", "all"])
    ap.add_argument("--no-color-match", action="store_true", help="ship the outer texture without colour matching")
    args = ap.parse_args()
    steps = ["download", "build", "check", "preview", "compare"] if args.step == "all" else [args.step]
    for s in steps:
        t0 = time.time()
        print(f"== {s}", flush=True)
        globals()[f"step_{s}"](args)
        print(f"== {s} done in {time.time() - t0:.0f}s", flush=True)


if __name__ == "__main__":
    sys.exit(main())
