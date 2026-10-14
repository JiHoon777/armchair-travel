"""MEDIA pipeline for the 「지금 거기」 prototype (Grand Canyon).

Downloads every source into tools/cache/media/ (reused when present, sha1-checked where the
publisher gives one), then writes the site files:

  site/data/globe/{day,night}_{4k,2k}.jpg + globe.json        NASA Blue Marble NG (Oct 2004) / Black Marble 2016
  site/data/grand-canyon/pano/pano_{4k,2k}.jpg + pano.json    Grandeur Point 360 photo (Grand Canyon NPS, 2018)
  site/data/grand-canyon/audio/ambient.mp3 + audio.json       180 s seamless loop mixed from NPS public-domain
                                                              recordings + one CC0 canyon wren song
  site/data/grand-canyon/media/{then,now}.jpg + media.json    C. C. Pierce glass plate (1900-1930) / NPS 2011
  site/data/credits/media.json                                one line per source

Run from anywhere (Python 3.11+, ffmpeg on PATH):
  uv run --quiet --with numpy --with pillow python -I tools/fetch_media.py [all|globe|pano|audio|thennow|credits]

Every downloaded file is treated as data: images go through Pillow, sounds through ffmpeg.
All licences were checked on 2026-10-13; see docs/proto/media.md.
"""
import hashlib
import json
import math
import shutil
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = 400_000_000

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "tools" / "cache" / "media"
SITE = ROOT / "site" / "data"
GLOBE_DIR = SITE / "globe"
PLACE_DIR = SITE / "grand-canyon"
PANO_DIR = PLACE_DIR / "pano"
AUDIO_DIR = PLACE_DIR / "audio"
MEDIA_DIR = PLACE_DIR / "media"
CREDITS_DIR = SITE / "credits"
UA = "armchair-proto/0.1 (jihoon@deepintothe.xyz)"
ACCESSED = "2026-10-13"

COMMONS = "https://upload.wikimedia.org/wikipedia/commons/"

# --------------------------------------------------------------------------------------
# Sources (url, cache path, expected sha1 or None). Commons sha1 values come from the API.
# --------------------------------------------------------------------------------------
SRC = {
    "day": dict(
        url="https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73826/world.topo.bathy.200410.3x5400x2700.jpg",
        fallback="https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73909/world.topo.bathy.200412.3x5400x2700.jpg",
        path="globe/world.topo.bathy.200410.3x5400x2700.jpg", sha1=None,
        fallback_path="globe/world.topo.bathy.200412.3x5400x2700.jpg",
        seen="6817e3118ac70d0aeb74d8ea0bb83b95cb5eac62"),
    "night": dict(
        url="https://eoimages.gsfc.nasa.gov/images/imagerecords/144000/144898/BlackMarble_2016_3km.jpg",
        path="globe/BlackMarble_2016_3km.jpg", sha1=None, seen="dea6aa2e38e40965c91a1a8d618224ef3182ebc9"),
    "pano": dict(
        url=COMMONS + "1/1f/Grandeur_Point_-_Grand_Canyon_National_Park_-_R0010513_%2829201417827%29.jpg",
        path="commons/grandeur_pd_2025.jpg", sha1="91bb86daeb8ff563165a5d3f743b91b3ae83eca3"),
    "then": dict(
        url=COMMONS + "c/cd/Panorama_from_Hotel_Point_west_of_Bright_Angel_Trail%2C_looking_northeast%2C_Grand_Canyon%2C_1900-1930_%28CHS-3269%29.jpg",
        path="thennow/CHS-3269.jpg", sha1="688c0e1215c70e34cac2130742de1c9b796c08e9"),
    "now": dict(
        url=COMMONS + "5/51/Grand_Canyon_Nat._Park_Panorama_with_El_Tovar_Hotel_5975_%287974172042%29.jpg",
        path="thennow/now_ba_lodge_pano_2011.jpg", sha1="7501a4ac26b878e15f897e042f71292715cca518"),
    "wind": dict(
        url="https://www.nps.gov/nps-audiovideo/legacy/mp3/imr/avElement/romo-WindAmbientGemLakeROMO52516Final1.mp3",
        path="audio/src/romo_wind_gemlake.mp3", sha1=None, seen="c353754634df9584032d53fd843b6eb102526fbe"),
    "river": dict(
        url="https://www.nps.gov/nps-audiovideo/legacy/mp3/imr/avElement/grca-rapids02.mp3",
        path="audio/src/grca_bass_rapid.mp3", sha1=None, seen="94737c8d20bee88e37f8a0a72c5e74fd98280720"),
    "raven": dict(
        url="https://www.nps.gov/nps-audiovideo/legacy/mp3/imr/avElement/romo-CORAROMO6242015MoraineParkCampground.mp3",
        path="audio/src/romo_raven_moraine.mp3", sha1=None, seen="a3969877f2c6fb4f64582e11f79167b8d243ce6c"),
    "wren": dict(
        url="https://cdn.freesound.org/previews/479/479615_2524442-hq.mp3",
        path="audio/src/fs_craigsmith_canyon_wren_hq.mp3", sha1=None, seen="d942027b059f153ebe5a4a069306bd9151173072"),
}


def log(*a):
    print("[media]", *a, flush=True)


def sha1_of(path):
    h = hashlib.sha1()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def fetch(key):
    """Download SRC[key] into the cache once (curl, our User-Agent); return the local path.
    `sha1` (from the Commons API) must match; `seen` is what we got on 2026-10-13 and only warns."""
    s = SRC[key]
    candidates = [(s["url"], CACHE / s["path"])]
    if s.get("fallback"):
        candidates.append((s["fallback"], CACHE / s["fallback_path"]))

    def check(path):
        got = sha1_of(path)
        if s["sha1"] and got != s["sha1"]:
            raise SystemExit(f"sha1 mismatch for {path}")
        if s.get("seen") and got != s["seen"] and path == CACHE / s["path"]:
            log(f"warning: {key} differs from the 2026-10-13 download (sha1 {got})")

    for url, dest in candidates:  # cached copy first
        if dest.exists() and dest.stat().st_size > 0:
            check(dest)
            if url != s["url"]:
                s["used_fallback"] = url
            return dest
    for url, dest in candidates:
        dest.parent.mkdir(parents=True, exist_ok=True)
        tmp = dest.with_suffix(dest.suffix + ".part")
        log("download", url)
        r = subprocess.run(["curl", "-sS", "-L", "--fail", "--retry", "3", "--max-time", "600",
                            "-A", UA, "-o", str(tmp), url])
        if r.returncode == 0 and tmp.exists() and tmp.stat().st_size > 0:
            tmp.rename(dest)
            check(dest)
            if url != s["url"]:
                s["used_fallback"] = url
            return dest
    raise SystemExit(f"could not download {key}")


def save_jpeg(img, path, quality):
    path.parent.mkdir(parents=True, exist_ok=True)
    img.convert("RGB").save(path, "JPEG", quality=quality, optimize=True, progressive=True,
                            subsampling="4:2:0")
    log("wrote", path.relative_to(ROOT), img.size, f"{path.stat().st_size / 1e6:.2f} MB")


def write_json(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    log("wrote", path.relative_to(ROOT))


# --------------------------------------------------------------------------------------
# Credits (shared by the per-asset json files and data/credits/media.json)
# --------------------------------------------------------------------------------------
NASA_NOTE = ("NASA imagery is generally not subject to copyright in the United States; "
             "credit NASA and do not imply NASA endorsement.")
CREDIT = {
    "day": dict(
        what_ko="지구본 낮 텍스처 (2004년 10월 합성)",
        title="Blue Marble: Next Generation with Topography and Bathymetry, October 2004",
        author="NASA Earth Observatory (Reto Stöckli)",
        license="Public domain (U.S. Government work, NASA)",
        url="https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography-bathymetry/",
        attribution="NASA Earth Observatory, Blue Marble: Next Generation (Reto Stöckli)",
        notes=NASA_NOTE),
    "night": dict(
        what_ko="지구본 밤 불빛 텍스처 (2016년)",
        title="Earth at Night / Black Marble 2016, color, 3 km",
        author="NASA Earth Observatory (Joshua Stevens), Suomi NPP VIIRS data (Miguel Román, NASA GSFC)",
        license="Public domain (U.S. Government work, NASA)",
        url="https://science.nasa.gov/earth/earth-observatory/earth-at-night/maps/",
        attribution="NASA Earth Observatory, Black Marble 2016 (Joshua Stevens; Suomi NPP VIIRS data, Miguel Román, NASA GSFC)",
        notes=NASA_NOTE),
    "pano": dict(
        what_ko="그 자리에 서기: 그랜저 포인트 360 사진 (2018-08-18)",
        title="Grandeur Point - Grand Canyon National Park - R0010513",
        author="Grand Canyon NPS (NPS/M. Quinn)",
        license="CC BY 2.0 (on Flickr); also public domain in the U.S. as an NPS work (PD-USGov-NPS on Commons)",
        license_url="https://creativecommons.org/licenses/by/2.0/",
        url="https://commons.wikimedia.org/wiki/File:Grandeur_Point_-_Grand_Canyon_National_Park_-_R0010513_(29201417827).jpg",
        source_url="https://www.flickr.com/photos/grand_canyon_nps/29201417827/",
        attribution="Grandeur Point, Grand Canyon National Park — Grand Canyon NPS (NPS/M. Quinn), CC BY 2.0",
        modified_ko="4096×2048, 2048×1024로 줄이고 카메라 기울기(약 2°)를 바로잡았습니다. 렌즈에 비친 붉은 빛 한 점을 지웠습니다."),
    "wind": dict(
        what_ko="소리: 바람 (바탕)",
        title="Wind Soundscape from Gem Lake (Rocky Mountain National Park Sound Library)",
        author="National Park Service / J. Job (2016-05-25)",
        license="Public domain (NPS: 'The recordings found here are in the public domain')",
        url="https://www.nps.gov/romo/learn/photosmultimedia/sounds-ambient-soundscapes.htm",
        attribution="National Park Service (Rocky Mountain NP Sound Library, J. Job)",
        modified_ko="그랜드캐니언이 아닌 로키산맥 국립공원 녹음입니다. 저음을 덜고 3분 반복 구간으로 다듬었습니다."),
    "river": dict(
        what_ko="소리: 먼 강물 (콜로라도강 배스 급류)",
        title="Grand Canyon Natural Sound: Bass Rapid",
        author="National Park Service, Grand Canyon National Park",
        license="Public domain (NPS media credited to NPS without a copyright symbol)",
        url="https://www.nps.gov/media/video/view.htm?id=8B2C055B-6036-417E-9233-123283EF8163",
        attribution="National Park Service, Grand Canyon National Park",
        modified_ko="높은 소리를 걸러 멀리서 들리는 강물처럼 낮게 깔았습니다."),
    "raven": dict(
        what_ko="소리: 큰까마귀",
        title="Common Raven (call), Moraine Park Campground (Rocky Mountain National Park Sound Library)",
        author="National Park Service / J. Job (2015-06-24)",
        license="Public domain (NPS: 'The recordings found here are in the public domain')",
        url="https://www.nps.gov/romo/learn/photosmultimedia/sounds-commonraven.htm",
        attribution="National Park Service (Rocky Mountain NP Sound Library, J. Job)",
        modified_ko="그랜드캐니언이 아닌 로키산맥 국립공원 녹음입니다. 울음 두 토막을 잘라 작은 메아리를 더했습니다."),
    "wren": dict(
        what_ko="소리: 협곡굴뚝새 노래",
        title="R30-39-Canyon Wren Sings.wav",
        author="craigsmith (Freesound)",
        license="CC0 1.0",
        license_url="https://creativecommons.org/publicdomain/zero/1.0/",
        url="https://freesound.org/people/craigsmith/sounds/479615/",
        attribution="craigsmith, Freesound #479615 (CC0)",
        modified_ko="앞쪽 녹음 안내 음성을 잘라 내고 노래 두 소절만 썼습니다. 협곡 메아리를 더했습니다."),
    "then": dict(
        what_ko="그때와 지금: 그때 사진 (1900~1930년)",
        title="Panorama from Hotel Point west of Bright Angel Trail, looking northeast, Grand Canyon, 1900-1930 (CHS-3269)",
        author="C. C. Pierce (1861–1946); California Historical Society Collection, USC Libraries",
        license="Public domain (PD-US; photographer died 1946)",
        url="https://commons.wikimedia.org/wiki/File:Panorama_from_Hotel_Point_west_of_Bright_Angel_Trail,_looking_northeast,_Grand_Canyon,_1900-1930_(CHS-3269).jpg",
        source_url="http://digitallibrary.usc.edu/cdm/ref/collection/p15799coll65/id/13652",
        attribution="C. C. Pierce, California Historical Society Collection at the University of Southern California",
        modified_ko="유리 원판 가장자리를 잘라 4:3으로 맞추고 밝기를 고르게 했습니다."),
    "now": dict(
        what_ko="그때와 지금: 지금 사진 (2011년)",
        title="Grand Canyon Nat. Park: Panorama with El Tovar Hotel 5975",
        author="Grand Canyon National Park (NPS photo by Michael Quinn)",
        license="CC BY 2.0 (on Flickr); also public domain in the U.S. as an NPS work",
        license_url="https://creativecommons.org/licenses/by/2.0/",
        url="https://commons.wikimedia.org/wiki/File:Grand_Canyon_Nat._Park_Panorama_with_El_Tovar_Hotel_5975_(7974172042).jpg",
        source_url="https://www.flickr.com/photos/grand_canyon_nps/7974172042/",
        attribution="Grand Canyon National Park, NPS photo by Michael Quinn, CC BY 2.0",
        modified_ko="파노라마에서 브라이트 에인절 협곡 쪽을 4:3으로 잘라 냈습니다."),
}


def credit_obj(key, *extra_keys):
    c = CREDIT[key]
    out = {k: c[k] for k in ("title", "author", "license", "url") if k in c}
    for k in ("license_url", "source_url", "attribution") + extra_keys:
        if k in c:
            out[k] = c[k]
    return out


# --------------------------------------------------------------------------------------
# Globe
# --------------------------------------------------------------------------------------
def step_globe():
    day_src = fetch("day")
    night_src = fetch("night")
    day = Image.open(day_src).convert("RGB")
    night = Image.open(night_src).convert("RGB")
    log("day source", day.size, "night source", night.size)
    assert abs(day.size[0] / day.size[1] - 2) < 1e-3 and abs(night.size[0] / night.size[1] - 2) < 1e-3
    for name, img in (("day", day), ("night", night)):
        for tag, w in (("4k", 4096), ("2k", 2048)):
            save_jpeg(img.resize((w, w // 2), Image.LANCZOS), GLOBE_DIR / f"{name}_{tag}.jpg", 85)
    month = "2004-12" if SRC["day"].get("used_fallback") else "2004-10"
    # keep the regional 500 m patch written by tools/make_globe_region.py
    try:
        region = json.loads((GLOBE_DIR / "globe.json").read_text()).get("region")
    except Exception:
        region = None
    write_json(GLOBE_DIR / "globe.json", {
        "day": {"file": "day_4k.jpg", "mobile": "day_2k.jpg", "month": month},
        "night": {"file": "night_4k.jpg", "mobile": "night_2k.jpg", "year": 2016},
        "projection": "equirectangular",
        "lon_left_deg": -180,
        "lat_top_deg": 90,
        "credit": [credit_obj("day", "notes"), credit_obj("night", "notes")],
        **({"region": region} if region else {}),
    })


# --------------------------------------------------------------------------------------
# 360 panorama
# --------------------------------------------------------------------------------------
# Measured on 2026-10-13 with tools/media_pano_north.py against the TERRAIN agent's DEM:
#   * true north sits at image yaw 310.5 deg (west-wall end 310.7, North Rim profile incl. the
#     Bright Angel Canyon dip 311.6 on the leveled image, sun position at 2018-08-18 15:03:49 MST
#     308.4) -> `media_pano_north.py <pano> <terrain_dir> --features`;
#   * the photo's horizon is tilted ~2.0 deg: too high around image yaw 175.6, too low around 355.6
#     (photo minus DEM skyline went from +0.7 deg at yaw 240 to -2.2 deg at yaw 350).
PANO_NORTH_YAW = 310.5
PANO_TILT_DEG = 2.03
PANO_TILT_TOWARD_YAW = 175.6
PANO_INITIAL_YAW = 300.0  # inner gorge + Tonto Platform + North Rim, heading ~350 (NNW)
# Photo yaws where the canyon fills the view below the horizon (x 0.45-1.0 and 0.0-0.05 of the
# image): the app keeps its automatic turn inside this arc (FIX, review R04).
PANO_AUTO_ARC = [162, 378]
# A small red/magenta lens flare below the canyon view (leveled 5376 px image, yaw ~176 deg):
# search centre x, y and radius for remove_flare (FIX, review R17).
PANO_FLARE = (2642, 1795, 34)
GRANDEUR_POINT = dict(lat=36.06464, lon=-112.12202)  # USGS GNIS 5229 "Grandeur Point" (summit)


def _dirs(yaw_deg, elev_deg):
    y, e = np.broadcast_arrays(np.radians(yaw_deg), np.radians(elev_deg))
    return np.stack([np.cos(e) * np.sin(y), np.sin(e), np.cos(e) * np.cos(y)], axis=-1)


def level_pano(img, tilt_deg, toward_yaw_deg):
    """Rotate an equirectangular image so a horizon that is `tilt_deg` too high at
    `toward_yaw_deg` (and too low opposite) becomes level. Bilinear resampling."""
    src = np.asarray(img.convert("RGB")).astype(np.float32)
    H, W, _ = src.shape
    u = _dirs(np.array(toward_yaw_deg), np.array(0.0))
    up = np.array([0.0, 1.0, 0.0])
    k = np.cross(u, up)
    k /= np.linalg.norm(k)
    t = math.radians(tilt_deg)
    K = np.array([[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]])
    R = np.eye(3) + math.sin(t) * K + (1 - math.cos(t)) * (K @ K)  # true -> photo
    # sanity: the true horizon point at toward_yaw maps to photo elevation +tilt
    v = R @ u
    assert abs(math.degrees(math.asin(v[1])) - tilt_deg) < 1e-6
    out = np.empty_like(src)
    xs = (np.arange(W) + 0.5) / W * 360.0
    for r0 in range(0, H, 256):
        r1 = min(H, r0 + 256)
        es = 90.0 - (np.arange(r0, r1) + 0.5) / H * 180.0
        d = _dirs(xs[None, :], es[:, None])  # (rows, W, 3) true directions
        p = d @ R.T
        ep = np.degrees(np.arcsin(np.clip(p[..., 1], -1, 1)))
        yp = np.degrees(np.arctan2(p[..., 0], p[..., 2])) % 360.0
        fx = yp / 360.0 * W - 0.5
        fy = (90.0 - ep) / 180.0 * H - 0.5
        x0 = np.floor(fx).astype(int)
        y0 = np.floor(fy).astype(int)
        ax = (fx - x0)[..., None]
        ay = (fy - y0)[..., None]
        x0m = x0 % W
        x1m = (x0 + 1) % W
        y0c = np.clip(y0, 0, H - 1)
        y1c = np.clip(y0 + 1, 0, H - 1)
        out[r0:r1] = (src[y0c, x0m] * (1 - ax) * (1 - ay) + src[y0c, x1m] * ax * (1 - ay)
                      + src[y1c, x0m] * (1 - ax) * ay + src[y1c, x1m] * ax * ay)
    return Image.fromarray(np.clip(out + 0.5, 0, 255).astype(np.uint8))


def remove_flare(img, cx, cy, r):
    """Paint out a small lens flare: inside a feathered mask of the pixels much redder or more
    magenta than the surrounding rock, keep the photo's light-and-shade detail but take the colour
    and brightness of the ring around it. Returns the image and the number of masked pixels."""
    from PIL import ImageFilter
    a = np.asarray(img).astype(np.float32)
    y0, y1, x0, x1 = cy - 2 * r, cy + 2 * r, cx - 2 * r, cx + 2 * r
    win = a[y0:y1, x0:x1].copy()
    R, G, B = win[..., 0], win[..., 1], win[..., 2]
    score = np.maximum(R - (G + B) / 2, (R + B) / 2 - G)
    yy, xx = np.mgrid[y0:y1, x0:x1]
    d = np.hypot(xx - cx, yy - cy)
    ring = (d > r) & (d < 2 * r)
    base = float(np.median(score[ring]))
    m = np.clip((score - base - 12) / 30, 0, 1) * (d < r)
    m8 = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.GaussianBlur(4))
    m = np.asarray(m8).astype(np.float32) / 255
    lum = 0.299 * R + 0.587 * G + 0.114 * B
    calm = ring & (score < base + 8)
    ring_rgb = win[calm].mean(axis=0)
    blur = np.asarray(Image.fromarray(np.clip(lum, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(6))).astype(np.float32)
    detail = np.clip(lum / np.maximum(blur, 1.0), 0.6, 1.5)
    fill = ring_rgb[None, None, :] * detail[..., None]
    a[y0:y1, x0:x1] = win * (1 - m[..., None]) + fill * m[..., None]
    return Image.fromarray(np.clip(a + 0.5, 0, 255).astype(np.uint8)), int((m > 0.5).sum())


def step_pano():
    src = fetch("pano")
    img = Image.open(src).convert("RGB")
    log("pano source", img.size)
    assert img.size == (5376, 2688), "expected the 5376x2688 Ricoh Theta S equirectangular"
    level = level_pano(img, PANO_TILT_DEG, PANO_TILT_TOWARD_YAW)
    level, n_flare = remove_flare(level, *PANO_FLARE)
    log("lens flare painted out:", n_flare, "px")
    level_path = CACHE / "work" / "grandeur_level_5376.png"
    level_path.parent.mkdir(parents=True, exist_ok=True)
    level.save(level_path)  # kept for checks (tools/media_pano_north.py)
    save_jpeg(level.resize((4096, 2048), Image.LANCZOS), PANO_DIR / "pano_4k.jpg", 85)
    save_jpeg(level.resize((2048, 1024), Image.LANCZOS), PANO_DIR / "pano_2k.jpg", 85)
    write_json(PANO_DIR / "pano.json", {
        "file": "pano_4k.jpg",
        "file_mobile": "pano_2k.jpg",
        "width": 4096,
        "height": 2048,
        "projection": "equirectangular",
        "yaw_convention": "yaw_deg = x / width * 360 from the left edge; heading = (yaw_deg - north_yaw_deg) mod 360, clockwise from above",
        "initial_yaw_deg": PANO_INITIAL_YAW,
        "auto_arc_deg": PANO_AUTO_ARC,
        "auto_arc_note": "Photo yaws (from the left edge, past 360 wraps) where the canyon fills the view below the horizon: x 0.45-1.0 and 0.0-0.05 of the 2k image. The automatic turn keeps the view centre inside this arc minus half the screen width; dragging still turns all the way round.",
        "initial_heading_deg": round((PANO_INITIAL_YAW - PANO_NORTH_YAW) % 360, 1),
        "north_yaw_deg": PANO_NORTH_YAW,
        "north_method": "DEM skyline match (west-wall end 310.7, North Rim profile 311.6) + sun azimuth at capture time (308.4); about ±1.5 deg",
        "horizon_leveled": {"tilt_deg": PANO_TILT_DEG, "was_high_at_yaw_deg": PANO_TILT_TOWARD_YAW,
                            "method": "photo skyline vs DEM skyline, sinusoid fit"},
        "location": {"name_ko": "그랜저 포인트", "name_en": "Grandeur Point", **GRANDEUR_POINT,
                     "elev_m": 2147, "source": "USGS GNIS 5229 (summit point; the camera stood on the rim edge within ~50 m)"},
        "taken": "2018-08-18",
        "taken_local_time": "15:03 MST",
        "camera": "RICOH THETA S",
        "people_visible": True,
        "credit": credit_obj("pano"),
    })


# --------------------------------------------------------------------------------------
# Ambient audio
# --------------------------------------------------------------------------------------
SR = 44100
LOOP_S = 180.0
XFADE_S = 6.0


def decode(path, start=None, end=None, af=None):
    cmd = ["ffmpeg", "-v", "error"]
    if start is not None:
        cmd += ["-ss", f"{start:.3f}"]
    if end is not None:
        cmd += ["-to", f"{end:.3f}"]
    cmd += ["-i", str(path)]
    if af:
        cmd += ["-af", af]
    cmd += ["-ac", "2", "-ar", str(SR), "-f", "f32le", "-"]
    raw = subprocess.run(cmd, check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).astype(np.float64)


def seam_loop(x, n_loop, n_xf):
    """x has n_loop + n_xf samples; fold the tail into the head with an equal-power crossfade so
    sample n_loop-1 runs straight into sample 0."""
    assert len(x) >= n_loop + n_xf
    out = x[:n_loop].copy()
    t = (np.arange(n_xf) + 0.5) / n_xf
    out[:n_xf] = x[:n_xf] * np.sin(t * np.pi / 2)[:, None] + x[n_loop:n_loop + n_xf] * np.cos(t * np.pi / 2)[:, None]
    return out


def texture(src, n_total, chunk_s, xf_s, seed):
    """Overlap-add random chunks of a short noisy recording into a long bed."""
    rng = np.random.default_rng(seed)
    n_chunk = int(chunk_s * SR)
    n_xf = int(xf_s * SR)
    ramp = np.sin((np.arange(n_xf) + 0.5) / n_xf * np.pi / 2)
    out = np.zeros((n_total, 2))
    pos = 0
    while pos < n_total:
        s = int(rng.integers(0, len(src) - n_chunk))
        seg = src[s:s + n_chunk].copy()
        seg[:n_xf] *= ramp[:, None]
        seg[-n_xf:] *= ramp[::-1][:, None]
        end = min(n_total, pos + n_chunk)
        out[pos:end] += seg[:end - pos]
        pos += n_chunk - n_xf
    return out


def pan_mono(x, pan):
    """Collapse to mono and place it with an equal-power pan (-1 left .. +1 right)."""
    m = x.mean(axis=1)
    a = (pan + 1) * np.pi / 4
    return np.stack([m * math.cos(a), m * math.sin(a)], axis=1)


def db(v):
    return 20 * math.log10(max(v, 1e-12))


def rms(x):
    return float(np.sqrt(np.mean(x ** 2)))


def short_term_max(x, win_s=0.4):
    n = int(win_s * SR)
    m = x.mean(axis=1) if x.ndim == 2 else x
    p = np.convolve(m ** 2, np.ones(n) / n, mode="valid")
    return float(np.sqrt(p.max()))


def write_wav(path, x):
    path.parent.mkdir(parents=True, exist_ok=True)
    pcm = np.clip(np.round(x * 32767), -32768, 32767).astype("<i2")
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def mp3_gapless_info(path):
    """Read the Xing/Info + LAME tag that libmp3lame writes: frame count, encoder delay, padding.
    priming = encoder delay + 529 (decoder delay); trailing padding = padding - 529."""
    d = Path(path).read_bytes()[:4096]
    i = d.find(b"Info")
    if i < 0:
        i = d.find(b"Xing")
    flags = int.from_bytes(d[i + 4:i + 8], "big")
    p = i + 8
    frames = None
    if flags & 1:
        frames = int.from_bytes(d[p:p + 4], "big")
        p += 4
    if flags & 2:
        p += 4
    if flags & 4:
        p += 100
    if flags & 8:
        p += 4
    b = d[p + 21:p + 24]
    delay = (b[0] << 4) | (b[1] >> 4)
    pad = ((b[1] & 0x0F) << 8) | b[2]
    return {"frames": frames, "priming_samples": delay + 529, "padding_samples": pad - 529}


def ebur128(path):
    r = subprocess.run(["ffmpeg", "-nostats", "-hide_banner", "-i", str(path), "-filter_complex",
                        "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True)
    txt = r.stderr[r.stderr.rfind("Summary:"):]
    integ = float(txt.split("I:")[1].split("LUFS")[0])
    lra = float(txt.split("LRA:")[1].split("LU")[0])
    peak = float(txt.split("Peak:")[1].split("dBFS")[0])
    return integ, lra, peak


# Event plan (seconds on the 180 s loop). Nothing within 12 s of the seam.
WREN_SONGS = [(1.80, 6.60), (9.40, 14.20)]           # clip 0.0-1.3 s is a spoken slate: never used
RAVEN_CALLS = [(3.20, 6.90), (64.30, 67.90)]
EVENTS = [
    # (kind, index, start_s, level_db_vs_bed, pan)
    ("wren", 0, 22.0, +4.0, +0.30),
    ("raven", 0, 51.0, +3.0, -0.45),
    ("wren", 1, 88.0, +3.0, -0.25),
    ("raven", 1, 119.0, +1.0, +0.40),
    ("wren", 0, 147.0, +0.5, -0.10),  # same song type again, farther away
]
WREN_AF = "highpass=f=1800,apad=pad_dur=2.0,aecho=0.85:0.6:290|540:0.32|0.18,lowpass=f=9000"
RAVEN_AF = "highpass=f=320,lowpass=f=6000,apad=pad_dur=1.5,aecho=0.9:0.55:430:0.22"
WIND_AF = "highpass=f=140,highpass=f=140,lowpass=f=7500,highshelf=f=3000:g=-4,acompressor=threshold=0.05:ratio=2:attack=300:release=2500:makeup=1"
RIVER_AF = "lowpass=f=480,lowpass=f=480,highpass=f=40"
WIND_START_S = 12.0  # the Gem Lake file fades in over its first ~5 s


def step_audio():
    wind_p, river_p, raven_p, wren_p = (fetch(k) for k in ("wind", "river", "raven", "wren"))
    n_loop = int(LOOP_S * SR)
    n_xf = int(XFADE_S * SR)

    wind = decode(wind_p, WIND_START_S, WIND_START_S + LOOP_S + XFADE_S + 0.5, WIND_AF)
    wind = seam_loop(wind, n_loop, n_xf)
    bed_rms = rms(wind)

    river_src = decode(river_p, 0.3, 17.0, RIVER_AF)
    river = texture(river_src, n_loop + n_xf, chunk_s=9.0, xf_s=3.0, seed=7)
    river = seam_loop(river, n_loop, n_xf)
    river *= (bed_rms / rms(river)) * 10 ** (-11.0 / 20)  # a low rumble 11 dB under the wind

    mix = wind + river
    for kind, idx, t0, level, pan in EVENTS:
        if kind == "wren":
            a, b = WREN_SONGS[idx]
            clip = decode(wren_p, a, b, WREN_AF)
        else:
            a, b = RAVEN_CALLS[idx]
            clip = decode(raven_p, a, b, RAVEN_AF)
        n_f = int(0.03 * SR)
        clip[:n_f] *= np.linspace(0, 1, n_f)[:, None]
        clip[-n_f:] *= np.linspace(1, 0, n_f)[:, None]
        clip = pan_mono(clip, pan)
        g = (bed_rms / short_term_max(clip)) * 10 ** (level / 20)
        s = int(t0 * SR)
        e = min(n_loop, s + len(clip))
        mix[s:e] += clip[:e - s] * g
        log(f"event {kind}{idx} at {t0:.0f}s len {len(clip) / SR:.1f}s gain {db(g):+.1f} dB")

    # loudness: measure, apply one linear gain to -23 LUFS, keep true peak under -2 dBTP
    work = CACHE / "work"
    pre = work / "ambient_pre.wav"
    write_wav(pre, mix / max(1.0, np.abs(mix).max() / 0.5))
    pre_scale = 1.0 / max(1.0, np.abs(mix).max() / 0.5)
    integ, _, _ = ebur128(pre)
    gain = 10 ** ((-23.0 - integ) / 20) * pre_scale
    final = mix * gain
    peak_db = db(float(np.abs(final).max()))
    log(f"pre-gain integrated {integ:.2f} LUFS -> gain {db(gain):+.2f} dB, sample peak {peak_db:.2f} dBFS")
    if peak_db > -2.0:
        raise SystemExit("ambient mix would clip; lower the event levels")
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    mp3 = AUDIO_DIR / "ambient.mp3"
    wav = work / "ambient_final.wav"
    for attempt in range(3):  # MP3's lowpass shaves a little loudness; nudge until within 0.1 LU
        write_wav(wav, final)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(wav), "-map_metadata", "-1",
                        "-c:a", "libmp3lame", "-b:a", "128k", "-ar", str(SR), "-ac", "2",
                        "-metadata", "title=Grand Canyon rim ambience (loop)",
                        "-metadata", "comment=NPS public-domain recordings + CC0 canyon wren; see credits",
                        str(mp3)], check=True)
        got, _, _ = ebur128(mp3)
        log(f"encode {attempt + 1}: {got:.2f} LUFS")
        if abs(got + 23.0) <= 0.1:
            break
        final = final * 10 ** ((-23.0 - got) / 20)
    log("wrote", mp3.relative_to(ROOT), f"{mp3.stat().st_size / 1e6:.2f} MB")

    # verify what a decoder hands back: length, loudness, and the seam
    dec = decode(mp3)
    n_dec = len(dec)
    m_integ, m_lra, m_tp = ebur128(mp3)
    dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of",
                                "default=nw=1:nk=1", str(mp3)], capture_output=True, text=True).stdout)
    step = np.abs(np.diff(dec, axis=0)).mean()
    seam = np.abs(dec[0] - dec[-1]).mean()
    gap = mp3_gapless_info(mp3)
    assert gap["frames"] * 1152 - gap["priming_samples"] - gap["padding_samples"] == n_dec, gap
    log(f"mp3: decoded {n_dec} samples ({n_dec / SR:.3f} s, ffprobe {dur:.3f} s), "
        f"I {m_integ:.1f} LUFS, LRA {m_lra:.1f} LU, true peak {m_tp:.1f} dBFS, "
        f"seam jump {seam:.5f} vs mean step {step:.5f}")
    write_json(AUDIO_DIR / "audio.json", {
        "ambient": {
            "file": "ambient.mp3",
            "duration_s": round(n_dec / SR, 3),
            "loop": True,
            "lufs": round(m_integ, 1),
            "true_peak_dbfs": round(m_tp, 1),
            "sample_rate": SR,
            "samples": n_dec,
            "bitrate_kbps": 128,
            "loop_hint": ("decode with Web Audio and loop the AudioBuffer; the seam is crossfaded. "
                          "If buffer.duration is more than ~10 ms longer than duration_s (the decoder "
                          "ignored the gapless header), set loopStart = mp3_gapless.priming_samples / "
                          "sample_rate (seconds) and loopEnd = loopStart + duration_s."),
            "mp3_gapless": gap,
            "layers_ko": ["바람(바탕)", "먼 강물(낮게)", "협곡굴뚝새 노래 3번", "큰까마귀 울음 2번"],
            "events_s": [{"t": e[2], "what": "canyon wren" if e[0] == "wren" else "common raven"} for e in EVENTS],
            "credit": {
                "title": "그랜드캐니언 가장자리를 떠올린 소리 (여러 곳의 녹음을 섞음)",
                "author": "National Park Service (J. Job; Grand Canyon NP), craigsmith (Freesound)",
                "license": "Public domain (NPS) + CC0 1.0",
                "url": "https://www.nps.gov/romo/learn/photosmultimedia/soundlibrary.htm",
                "attribution": "Sounds: National Park Service (public domain); canyon wren by craigsmith, Freesound #479615 (CC0)",
                "modified_ko": "바람과 큰까마귀는 로키산맥 국립공원, 강물은 그랜드캐니언 배스 급류, 협곡굴뚝새는 Freesound 녹음입니다. 3분 반복 구간으로 섞었습니다.",
                "sources": [credit_obj(k) for k in ("wind", "river", "raven", "wren")],
            },
        }
    })


# --------------------------------------------------------------------------------------
# Then / now
# --------------------------------------------------------------------------------------
THEN_BOX = (0.036, 0.045, 0.964, 0.935)       # inside the glass-plate edge and plate number
NOW_CENTER_X = 4450                            # Bright Angel Canyon in the 10000 px pano
NOW_TOP, NOW_BOTTOM = 895, 2865                # North Rim at ~19% from the top, as in the plate
OUT_W, OUT_H = 1600, 1200


def fit_43(img, box_frac=None):
    w, h = img.size
    if box_frac:
        x0, y0, x1, y1 = box_frac
        img = img.crop((int(x0 * w), int(y0 * h), int(x1 * w), int(y1 * h)))
        w, h = img.size
    if w / h > 4 / 3:
        nw = int(round(h * 4 / 3))
        x0 = (w - nw) // 2
        img = img.crop((x0, 0, x0 + nw, h))
    else:
        nh = int(round(w * 3 / 4))
        y0 = (h - nh) // 2
        img = img.crop((0, y0, w, y0 + nh))
    return img


def autolevel(gray, lo_pct=0.3, hi_pct=99.7):
    a = np.asarray(gray).astype(np.float64)
    lo, hi = np.percentile(a, [lo_pct, hi_pct])
    a = np.clip((a - lo) / max(1.0, hi - lo), 0, 1) * 255
    return Image.fromarray(a.round().astype(np.uint8))


def step_thennow():
    then_src = fetch("then")
    now_src = fetch("now")
    then = Image.open(then_src).convert("L")
    then = fit_43(then, THEN_BOX)
    then = autolevel(then).resize((OUT_W, OUT_H), Image.LANCZOS)
    save_jpeg(then.convert("RGB"), MEDIA_DIR / "then.jpg", 82)

    now = Image.open(now_src).convert("RGB")
    h = NOW_BOTTOM - NOW_TOP
    w = int(round(h * 4 / 3))
    x0 = NOW_CENTER_X - w // 2
    now = now.crop((x0, NOW_TOP, x0 + w, NOW_BOTTOM)).resize((OUT_W, OUT_H), Image.LANCZOS)
    save_jpeg(now, MEDIA_DIR / "now.jpg", 82)

    write_json(MEDIA_DIR / "media.json", {
        "then": {
            "file": "then.jpg",
            "year": 1900,
            "year_label_ko": "1900~1930년 무렵",
            "year_range": [1900, 1930],
            "caption_ko": "1900~1930년 무렵, 브라이트 에인절 트레일 서쪽 가장자리에서 북동쪽을 찍은 유리 원판 사진입니다. 가운데로 브라이트 에인절 협곡이 지나갑니다.",
            "alt_ko": "흑백 사진입니다. 층층이 깎인 봉우리와 골짜기가 멀리 북쪽 가장자리까지 이어집니다.",
            "width": OUT_W, "height": OUT_H,
            "credit": credit_obj("then"),
        },
        "now": {
            "file": "now.jpg",
            "year": 2011,
            "year_label_ko": "2011년",
            "caption_ko": "2011년, 가까운 브라이트 에인절 로지 마당에서 같은 북동쪽을 본 모습입니다. 가운데 깊게 파인 골짜기가 브라이트 에인절 협곡입니다.",
            "alt_ko": "컬러 사진입니다. 붉은 지층의 봉우리들 사이로 브라이트 에인절 협곡이 깊게 패어 있습니다.",
            "width": OUT_W, "height": OUT_H,
            "credit": credit_obj("now"),
        },
        "pair_note_ko": "두 사진은 수백 미터 떨어진 비슷한 자리에서 같은 쪽을 보고 찍었습니다. 겹쳐 맞춘 사진은 아닙니다.",
        "pair_caption_ko": "1900~1930년 무렵과 2011년에 사우스림에서 북동쪽 브라이트 에인절 협곡 쪽을 본 사진입니다. 두 사진은 수백 m 떨어진 자리에서 찍었습니다.",
        "credit_line_ko": "사진: C. C. Pierce(공공 영역) · NPS/M. Quinn(CC BY 2.0)",
    })


# --------------------------------------------------------------------------------------
# Credits
# --------------------------------------------------------------------------------------
def step_credits():
    order = ["day", "night", "pano", "wind", "river", "raven", "wren", "then", "now"]
    rows = []
    for k in order:
        c = CREDIT[k]
        row = {"what_ko": c["what_ko"], "title": c["title"], "author": c["author"],
               "license": c["license"], "url": c["url"], "attribution": c["attribution"]}
        for extra in ("license_url", "source_url", "modified_ko", "notes"):
            if extra in c:
                row[extra] = c[extra]
        row["accessed"] = ACCESSED
        rows.append(row)
    # keep rows written by other tools (tools/make_globe_region.py), after the globe rows
    try:
        old = json.loads((CREDITS_DIR / "media.json").read_text())
    except Exception:
        old = []
    mine = {r["url"] for r in rows}
    extra = [r for r in old if r.get("url") not in mine]
    rows[2:2] = extra
    write_json(CREDITS_DIR / "media.json", rows)


def main(argv):
    if shutil.which("ffmpeg") is None:
        raise SystemExit("ffmpeg is required")
    steps = argv[1:] or ["all"]
    table = {"globe": step_globe, "pano": step_pano, "audio": step_audio,
             "thennow": step_thennow, "credits": step_credits}
    if "all" in steps:
        steps = list(table)
    for s in steps:
        log("== step", s)
        table[s]()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
