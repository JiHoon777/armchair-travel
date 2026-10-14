"""Find the sun's centre in an equirectangular panorama (MEDIA agent helper).

Usage: uv run --quiet --with numpy --with pillow python -I tools/media_probe_sun.py <pano.jpg>
Prints the centroid of the brightest saturated blob in the upper half as yaw/elevation degrees.
"""
import sys

import numpy as np
from PIL import Image


def find_sun(path, thresh=250):
    im = np.asarray(Image.open(path).convert("RGB")).astype(np.int16)
    h, w, _ = im.shape
    upper = im[: h // 2]
    mask = (upper.min(axis=2) >= thresh)
    ys, xs = np.nonzero(mask)
    if len(xs) == 0:
        return None
    # keep the densest cluster: take pixels within 3 deg of the brightest-region median
    lum = upper.sum(axis=2)
    yb, xb = np.unravel_index(np.argmax(np.where(mask, lum, 0)), mask.shape)
    r = int(w * 4 / 360)
    sel = (abs(xs - xb) < r) & (abs(ys - yb) < r)
    cx, cy = xs[sel].mean(), ys[sel].mean()
    yaw = (cx + 0.5) / w * 360.0
    elev = 90.0 - (cy + 0.5) / h * 180.0
    return yaw, elev, int(sel.sum())


if __name__ == "__main__":
    for t in (254, 250, 245):
        print(t, find_sun(sys.argv[1], t))
