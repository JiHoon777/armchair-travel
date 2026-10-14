"""Look at sound files as pictures (MEDIA agent helper).

Usage:
  uv run --quiet --with numpy --with pillow python -I tools/media_probe_audio.py <out.png> <file1> [file2 ...]

For each file: decodes with ffmpeg to mono 22.05 kHz, draws a log-frequency spectrogram
(50 Hz .. 11 kHz) with a short-term loudness strip (RMS dBFS per 0.4 s) underneath, and
stacks all files into one PNG with labels. Prints duration, peak and RMS per file.
Only ffmpeg reads the files; nothing in them is executed.
"""
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw

SR = 22050


def decode(path, sr=SR):
    out = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"],
        check=True, capture_output=True,
    ).stdout
    return np.frombuffer(out, dtype=np.float32)


def spectrogram(x, width=1400, height=220, n_fft=2048):
    hop = max(1, (len(x) - n_fft) // width) if len(x) > n_fft else 1
    win = np.hanning(n_fft).astype(np.float32)
    cols = []
    for i in range(width):
        s = i * hop
        seg = x[s:s + n_fft]
        if len(seg) < n_fft:
            seg = np.pad(seg, (0, n_fft - len(seg)))
        cols.append(np.abs(np.fft.rfft(seg * win)))
    S = np.array(cols).T  # freq x time
    freqs = np.fft.rfftfreq(n_fft, 1 / SR)
    # log frequency axis 50 Hz .. 11 kHz
    edges = np.geomspace(50, 11000, height + 1)
    img = np.zeros((height, width), dtype=np.float32)
    for r in range(height):
        lo, hi = edges[r], edges[r + 1]
        m = (freqs >= lo) & (freqs < hi)
        if not m.any():
            k = np.argmin(np.abs(freqs - (lo + hi) / 2))
            img[height - 1 - r] = S[k]
        else:
            img[height - 1 - r] = S[m].mean(axis=0)
    db = 20 * np.log10(img + 1e-9)
    top = np.percentile(db, 99.5)
    db = np.clip((db - (top - 70)) / 70, 0, 1)
    return db


def colorize(v):
    # simple dark-blue -> yellow ramp
    r = np.clip(v * 2.2 - 0.6, 0, 1)
    g = np.clip(v * 1.6 - 0.2, 0, 1)
    b = np.clip(0.35 + v * 0.9 - v * v * 1.2, 0, 1)
    return (np.stack([r, g, b], axis=-1) * 255).astype(np.uint8)


def loudness_strip(x, width=1400, height=60):
    n = max(1, len(x) // width)
    rms = np.array([np.sqrt(np.mean(x[i * n:(i + 1) * n] ** 2) + 1e-12) for i in range(width)])
    db = 20 * np.log10(rms)
    img = Image.new("RGB", (width, height), (20, 20, 20))
    d = ImageDraw.Draw(img)
    for i, v in enumerate(db):
        h = int(np.clip((v + 60) / 60, 0, 1) * (height - 1))
        d.line([(i, height - 1), (i, height - 1 - h)], fill=(120, 200, 120))
    for ref in (-20, -40):
        y = height - 1 - int((ref + 60) / 60 * (height - 1))
        d.line([(0, y), (width, y)], fill=(90, 90, 160))
    return img, db


def main(argv):
    if len(argv) < 3:
        print(__doc__)
        return 2
    out = argv[1]
    panels = []
    for path in argv[2:]:
        x = decode(path)
        dur = len(x) / SR
        peak = 20 * np.log10(np.max(np.abs(x)) + 1e-12)
        rms = 20 * np.log10(np.sqrt(np.mean(x ** 2)) + 1e-12)
        print(f"{path}: {dur:.2f}s peak {peak:.1f} dBFS rms {rms:.1f} dBFS")
        spec = Image.fromarray(colorize(spectrogram(x)))
        strip, _ = loudness_strip(x)
        label = Image.new("RGB", (1400, 18), (0, 0, 0))
        ImageDraw.Draw(label).text((4, 3), f"{path.split('/')[-1]}  {dur:.1f}s  peak {peak:.1f}  rms {rms:.1f} dBFS  (freq log 50..11k Hz; ticks 10 s)", fill=(255, 255, 255))
        d = ImageDraw.Draw(spec)
        for t in range(0, int(dur) + 1, 10):
            xpix = int(t / dur * 1399) if dur > 0 else 0
            d.line([(xpix, 0), (xpix, 6)], fill=(255, 255, 255))
        # 1 kHz and 4 kHz guide lines
        edges = np.geomspace(50, 11000, 221)
        for f in (1000, 4000):
            r = 219 - int(np.searchsorted(edges, f))
            d.line([(0, r), (12, r)], fill=(255, 80, 80))
        panel = Image.new("RGB", (1400, 18 + 220 + 60), (0, 0, 0))
        panel.paste(label, (0, 0))
        panel.paste(spec, (0, 18))
        panel.paste(strip, (0, 238))
        panels.append(panel)
    H = sum(p.size[1] + 4 for p in panels)
    sheet = Image.new("RGB", (1400, H), (40, 40, 40))
    y = 0
    for p in panels:
        sheet.paste(p, (0, y))
        y += p.size[1] + 4
    sheet.save(out)
    print("wrote", out, sheet.size)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
