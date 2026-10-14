"""Colour statistics of an image region (FIX, review R01): mean RGB, HSV saturation and value.
  uv run --quiet --with numpy --with pillow python -I tools/measure_color.py IMG [x0 y0 x1 y1] [...more IMG/box]
A box given as fractions (all <= 1) is scaled to the image size."""
import sys
import numpy as np
from PIL import Image


def stats(path, box=None):
    im = Image.open(path).convert("RGB")
    if box:
        if all(v <= 1 for v in box):
            w, h = im.size
            box = (box[0] * w, box[1] * h, box[2] * w, box[3] * h)
        im = im.crop(tuple(int(round(v)) for v in box))
    a = np.asarray(im).astype(np.float32) / 255
    mx = a.max(axis=2)
    mn = a.min(axis=2)
    sat = np.where(mx > 1e-6, (mx - mn) / np.maximum(mx, 1e-6), 0)
    return a.reshape(-1, 3).mean(axis=0) * 255, float(sat.mean()), float(mx.mean())


def main(argv):
    i = 0
    while i < len(argv):
        path = argv[i]
        i += 1
        box = None
        if i + 3 < len(argv) + 0 and all(x.replace('.', '', 1).isdigit() for x in argv[i:i + 4]):
            box = [float(x) for x in argv[i:i + 4]]
            i += 4
        rgb, s, v = stats(path, box)
        print(f"{path.split('/')[-1]:32s} box={box} RGB=({rgb[0]:.0f},{rgb[1]:.0f},{rgb[2]:.0f}) sat={s:.3f} value={v:.3f}")


if __name__ == "__main__":
    main(sys.argv[1:])
