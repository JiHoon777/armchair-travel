"""Look at downloaded media before using it (MEDIA agent helper).

Usage (from anywhere):
  uv run --quiet --with numpy --with pillow python -I tools/media_probe.py exif  <image>
  uv run --quiet --with numpy --with pillow python -I tools/media_probe.py preview <image> <out.jpg> [width] [x0_frac x1_frac]
  uv run --quiet --with numpy --with pillow python -I tools/media_probe.py grid <image> <out.jpg> [width]

- exif: prints size, mode, ICC presence and EXIF tags (GPS decoded to decimal degrees).
- preview: writes a downscaled copy (optionally a horizontal slice x0..x1 as width fractions).
- grid: like preview, but draws vertical lines every 30 degrees (labelled 0..330) so a
  360 panorama's yaw can be read off by eye.
The input files are treated as data only; nothing in them is executed.
"""
import sys

from PIL import Image, ImageDraw, ExifTags

Image.MAX_IMAGE_PIXELS = 400_000_000


def _ratio(v):
    try:
        return float(v)
    except TypeError:
        return v[0] / v[1]


def gps_decimal(gps):
    def conv(dms, ref):
        d, m, s = (_ratio(x) for x in dms)
        val = d + m / 60 + s / 3600
        return -val if ref in ("S", "W") else val

    out = {}
    if 2 in gps and 1 in gps:
        out["lat"] = conv(gps[2], gps[1])
    if 4 in gps and 3 in gps:
        out["lon"] = conv(gps[4], gps[3])
    if 6 in gps:
        out["alt_m"] = _ratio(gps[6])
    if 17 in gps:
        out["img_direction"] = _ratio(gps[17])
        out["img_direction_ref"] = gps.get(16)
    return out


def cmd_exif(path):
    im = Image.open(path)
    print("size", im.size, "mode", im.mode, "format", im.format)
    print("icc_profile", "yes" if im.info.get("icc_profile") else "no")
    exif = im.getexif()
    for k, v in exif.items():
        name = ExifTags.TAGS.get(k, k)
        s = repr(v)
        print(f"  {name}: {s[:200]}")
    try:
        ifd = exif.get_ifd(0x8769)
        for k, v in ifd.items():
            name = ExifTags.TAGS.get(k, k)
            print(f"  exif.{name}: {repr(v)[:200]}")
    except Exception as e:  # noqa: BLE001
        print("  (no exif ifd)", e)
    try:
        gps = exif.get_ifd(0x8825)
        if gps:
            print("  GPS raw:", {ExifTags.GPSTAGS.get(k, k): v for k, v in gps.items()})
            print("  GPS decimal:", gps_decimal(gps))
    except Exception as e:  # noqa: BLE001
        print("  (no gps)", e)
    xmp = im.info.get("xmp")
    if xmp:
        text = xmp.decode("utf-8", "replace") if isinstance(xmp, bytes) else str(xmp)
        print("  XMP:", text[:3000])


def cmd_preview(path, out, width=1600, x0=None, x1=None, grid=False):
    im = Image.open(path).convert("RGB")
    w, h = im.size
    if x0 is not None:
        im = im.crop((int(x0 * w), 0, int(x1 * w), h))
    width = int(width)
    scale = width / im.size[0]
    im = im.resize((width, max(1, round(im.size[1] * scale))), Image.LANCZOS)
    if grid:
        d = ImageDraw.Draw(im)
        for deg in range(0, 360, 30):
            x = round(deg / 360 * im.size[0])
            d.line([(x, 0), (x, im.size[1])], fill=(255, 0, 0), width=1)
            d.text((x + 3, 3), str(deg), fill=(255, 255, 0))
        for frac in (0.25, 0.5, 0.75):
            y = round(frac * im.size[1])
            d.line([(0, y), (im.size[0], y)], fill=(0, 255, 255), width=1)
    im.save(out, quality=85)
    print("wrote", out, im.size)


def main(argv):
    if len(argv) < 2:
        print(__doc__)
        return 2
    cmd = argv[1]
    if cmd == "exif":
        cmd_exif(argv[2])
    elif cmd in ("crop", "yawcrop"):
        # crop    <image> <out.jpg> x0 x1 y0 y1 [width]  (fractions of the image size)
        # yawcrop <image> <out.jpg> yaw0 yaw1 elev_top elev_bottom [width]  (degrees; ticks every 1 deg)
        im = Image.open(argv[2]).convert("RGB")
        w, h = im.size
        a0, a1, b0, b1 = (float(a) for a in argv[4:8])
        if cmd == "yawcrop":
            x0, x1 = a0 / 360, a1 / 360
            y0, y1 = (90 - b0) / 180, (90 - b1) / 180
        else:
            x0, x1, y0, y1 = a0, a1, b0, b1
        px0, px1 = int(x0 * w), int(x1 * w)
        im = im.crop((px0, int(y0 * h), px1, int(y1 * h)))
        scale = 1.0
        if len(argv) > 8:
            nw = int(argv[8])
            scale = nw / im.size[0]
            im = im.resize((nw, max(1, round(im.size[1] * scale))), Image.LANCZOS)
        if cmd == "yawcrop":
            d = ImageDraw.Draw(im)
            deg = int(a0)
            while deg <= a1:
                x = round(((deg / 360) * w - px0) * scale)
                major = deg % 5 == 0
                d.line([(x, 0), (x, 14 if major else 6)], fill=(255, 0, 0), width=1)
                if major:
                    d.text((x + 2, 14), str(deg), fill=(255, 255, 0))
                deg += 1
            yh = round(((0.5 - y0) * h) * scale)
            d.line([(0, yh), (im.size[0], yh)], fill=(0, 255, 255), width=1)
        im.save(argv[3], quality=90)
        print("wrote", argv[3], im.size)
    elif cmd in ("preview", "grid"):
        width = int(argv[4]) if len(argv) > 4 else 1600
        x0 = float(argv[5]) if len(argv) > 6 else None
        x1 = float(argv[6]) if len(argv) > 6 else None
        cmd_preview(argv[2], argv[3], width, x0, x1, grid=(cmd == "grid"))
    else:
        print(__doc__)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
