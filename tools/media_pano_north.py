"""Estimate where true north is in the Grandeur Point 360 photo (MEDIA agent helper).

Reads (never writes) the TERRAIN agent's DEMs and the cached panorama, then:
  1. traces the terrain skyline seen from the camera position for every compass heading,
  2. traces the sky/terrain edge in the photo for every image column in the canyon sector,
  3. slides one over the other and reports the image yaw of true north (+ the fit error).

Usage:
  uv run --quiet --with numpy --with pillow python -I tools/media_pano_north.py <pano.jpg> <terrain_dir> [lat lon] [--plot out.png]
  uv run --quiet --with numpy --with pillow python -I tools/media_pano_north.py <pano.jpg> <terrain_dir> --features

Note (2026-10-13): the whole-skyline fit is confounded when the photo's horizon is tilted (the
Grandeur Point photo was ~2 deg off), so pano.json uses --features: two sharp skyline features
(the end of the west wall near Hopi/Powell Point, and the Bright Angel Canyon notch in the North
Rim) matched between DEM and photo. The leveled output pano gives the same north.

Yaw convention (same as pano.json): yaw = x / width * 360, x from the image's left edge;
heading = (yaw - north_yaw) mod 360, increasing clockwise seen from above.
"""
import json
import math
import sys

import numpy as np
from PIL import Image, ImageDraw

Image.MAX_IMAGE_PIXELS = 400_000_000

LAT0, LON0 = 36.1150, -112.1050
KX = 111320.0 * math.cos(math.radians(LAT0))
KZ = 110574.0
R_EARTH = 6371000.0
REFRACTION_K = 0.13


def to_local(lat, lon):
    return (lon - LON0) * KX, -(lat - LAT0) * KZ


def load_dem(path):
    a = np.asarray(Image.open(path).convert("RGB")).astype(np.float64)
    return a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768


class Terrain:
    def __init__(self, terrain_dir):
        meta = json.load(open(f"{terrain_dir}/meta.json"))
        self.core = load_dem(f"{terrain_dir}/{meta['core']['dem']['file']}")
        self.core_size = meta["core"]["size_m"]
        self.outer = load_dem(f"{terrain_dir}/{meta['outer']['dem']['file']}")
        self.outer_size = meta["outer"]["size_m"]

    @staticmethod
    def _sample(grid, size, x, z):
        n = grid.shape[0]
        c = (x + size / 2) / size * (n - 1)
        r = (z + size / 2) / size * (n - 1)
        c = np.clip(c, 0, n - 1.001)
        r = np.clip(r, 0, n - 1.001)
        c0 = np.floor(c).astype(int)
        r0 = np.floor(r).astype(int)
        fc = c - c0
        fr = r - r0
        g = grid
        return (g[r0, c0] * (1 - fc) * (1 - fr) + g[r0, c0 + 1] * fc * (1 - fr)
                + g[r0 + 1, c0] * (1 - fc) * fr + g[r0 + 1, c0 + 1] * fc * fr)

    def height(self, x, z):
        x = np.asarray(x, dtype=np.float64)
        z = np.asarray(z, dtype=np.float64)
        inside = (np.abs(x) < self.core_size / 2 - 20) & (np.abs(z) < self.core_size / 2 - 20)
        h_out = self._sample(self.outer, self.outer_size, x, z)
        h_core = self._sample(self.core, self.core_size, x, z)
        return np.where(inside, h_core, h_out)


def dem_skyline(terrain, ex, ez, eye_h, headings):
    d = np.concatenate([np.arange(30, 3000, 5), np.arange(3000, 15000, 15), np.arange(15000, 49000, 60)])
    out = np.empty(len(headings))
    for i, a in enumerate(np.radians(headings)):
        x = ex + np.sin(a) * d
        z = ez - np.cos(a) * d
        h = terrain.height(x, z) - d * d / (2 * R_EARTH) * (1 - REFRACTION_K)
        out[i] = np.degrees(np.max(np.arctan2(h - eye_h, d)))
    return out


def photo_skyline(pano, yaws, top_elev=6.0, bottom_elev=-6.0):
    """Bottom-up: from well inside the terrain, walk up until the column turns sky/cloud bright."""
    a = np.asarray(pano.convert("RGB")).astype(np.float64)
    H, W, _ = a.shape
    lum = 0.30 * a[..., 0] + 0.59 * a[..., 1] + 0.11 * a[..., 2]
    out = np.full(len(yaws), np.nan)
    y_top = int((90 - top_elev) / 180 * H)
    y_bot = int((90 - bottom_elev) / 180 * H)
    y_ref0 = int((90 - 4.0) / 180 * H)
    y_ref1 = int((90 - 1.5) / 180 * H)
    for i, yaw in enumerate(yaws):
        x = int(yaw / 360 * W) % W
        col = lum[:, max(0, x - 1):x + 2].mean(axis=1)
        ref = np.median(col[y_ref0:y_ref1])
        thr = 0.88 * ref
        for y in range(y_bot, y_top, -1):
            if (col[y - 4:y] > thr).all():
                out[i] = 90 - (y + 0.5) / H * 180
                break
    return out


def features(pano_path, terrain_dir, lat=36.06464, lon=-112.12202, dx=-20.0, dz=-30.0):
    """North from two features. Camera = GNIS point moved onto the rim edge (dx east, dz south)."""
    terrain = Terrain(terrain_dir)
    ex, ez = to_local(lat, lon)
    ex, ez = ex + dx, ez + dz
    eye_h = float(terrain.height(ex, ez)) + 1.5
    hd = np.arange(0, 360, 0.1)
    sky = dem_skyline(terrain, ex, ez, eye_h, hd)
    dif = np.diff(sky)
    sel = np.where((hd[:-1] >= 265) & (hd[:-1] <= 315))[0]
    wall_heading = hd[sel[np.argmin(dif[sel])] + 1]
    sel2 = (hd >= 5) & (hd <= 45)
    notch_heading = hd[np.where(sel2)[0][np.argmin(sky[sel2])]]
    pano = Image.open(pano_path)
    yw = np.arange(236.0, 250.0, 0.1)
    sw = photo_skyline(pano, yw)
    far = np.nanmedian(sw[(yw >= 243) & (yw <= 246)])
    wall_yaw = float(yw[np.where(sw <= far + 0.08)[0][0]])
    # North Rim sector: slide the DEM profile (with its Bright Angel Canyon dip) along the photo
    yn = np.arange(326.0, 372.0, 0.5)
    sn = photo_skyline(pano, yn % 360)
    best = None
    for north in np.arange(300.0, 321.0, 0.1):
        dem = np.interp((yn - north) % 360, hd, sky, period=360)
        d = sn - dem
        ok = ~np.isnan(d) & (np.abs(d) < 2)  # skip columns where clouds/haze broke the edge
        if ok.sum() < 20:
            continue
        r = float(np.median(np.abs(d[ok] - np.median(d[ok]))))
        if best is None or r < best[0]:
            best = (r, float(north), int(ok.sum()))
    out = {"wall_end": {"dem_heading": round(float(wall_heading), 1), "photo_yaw": round(wall_yaw, 1),
                        "north_yaw": round((wall_yaw - wall_heading) % 360, 1)},
           "north_rim_sector": {"north_yaw": round(best[1], 1), "median_resid_deg": round(best[0], 3),
                                "columns_used": best[2], "dem_notch_heading": round(float(notch_heading), 1)}}
    print(json.dumps(out, indent=1))
    return out


def main(argv):
    if "--features" in argv:
        features(argv[1], argv[2])
        return 0
    pano_path, terrain_dir = argv[1], argv[2]
    lat, lon = (float(argv[3]), float(argv[4])) if len(argv) > 4 and not argv[3].startswith("--") else (36.06464, -112.12202)
    plot = argv[argv.index("--plot") + 1] if "--plot" in argv else None
    terrain = Terrain(terrain_dir)
    pano = Image.open(pano_path)
    yaws = np.arange(236.0, 372.0, 0.25)  # canyon sector of the photo (distant skyline)
    sky_img = photo_skyline(pano, yaws % 360)
    headings = np.arange(0, 360, 0.25)

    best = None
    ex0, ez0 = to_local(lat, lon)
    results = []
    for dxm in range(-200, 201, 25):
        for dzm in range(-200, 201, 25):
            ex, ez = ex0 + dxm, ez0 + dzm
            eye_h = float(terrain.height(ex, ez)) + 1.5
            sky_dem = dem_skyline(terrain, ex, ez, eye_h, headings)
            for north in np.arange(280.0, 345.0, 0.2):
                hd = (yaws - north) % 360
                dem_vals = np.interp(hd, headings, sky_dem, period=360)
                diff = sky_img - dem_vals
                ok = ~np.isnan(diff)
                if ok.sum() < 100:
                    continue
                b = float(np.clip(np.median(diff[ok]), -1.5, 1.5))
                e = np.sort(np.abs(diff[ok] - b))
                err = float(e[: int(len(e) * 0.85)].mean())
                results.append((err, north, b, dxm, dzm, eye_h))
                if best is None or err < best[0]:
                    best = (err, north, b, dxm, dzm, eye_h, sky_dem)
    err, north, b, dxm, dzm, eye_h, sky_dem = best
    results.sort()
    print(json.dumps({
        "north_yaw_deg": round(float(north), 1),
        "median_abs_err_deg": round(float(err), 3),
        "vertical_offset_deg": round(float(b), 2),
        "camera_offset_m": [dxm, dzm],
        "eye_h_m": round(eye_h, 1),
        "top5": [[round(r[0], 3), round(float(r[1]), 1), r[3], r[4]] for r in results[:5]],
        "north_spread_top20": [round(float(min(r[1] for r in results[:20])), 1), round(float(max(r[1] for r in results[:20])), 1)],
    }, indent=1))
    if plot:
        w, h = 1400, 420
        img = Image.new("RGB", (w, h), (20, 20, 24))
        d = ImageDraw.Draw(img)

        def px(yaw, elev):
            return (yaw - 236) / (372 - 236) * (w - 1), h / 2 - elev * 40

        hd = (yaws - north) % 360
        dem_vals = np.interp(hd, headings, sky_dem, period=360) + b
        for i in range(len(yaws) - 1):
            if not np.isnan(sky_img[i]) and not np.isnan(sky_img[i + 1]):
                d.line([px(yaws[i], sky_img[i]), px(yaws[i + 1], sky_img[i + 1])], fill=(255, 220, 0), width=2)
            d.line([px(yaws[i], dem_vals[i]), px(yaws[i + 1], dem_vals[i + 1])], fill=(0, 200, 255), width=1)
        for yv in range(240, 372, 10):
            x, _ = px(yv, 0)
            d.line([(x, h - 14), (x, h)], fill=(200, 200, 200))
            d.text((x + 2, h - 14), str(yv % 360), fill=(200, 200, 200))
        d.text((6, 6), f"yellow: photo skyline, blue: DEM skyline (north_yaw={north:.1f}, err={err:.2f} deg)", fill=(255, 255, 255))
        img.save(plot)
        print("wrote", plot)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
