#!/usr/bin/env python3
"""
Przewyższenia odcinków z kafelków wysokości AWS Terrain Tiles (format Terrarium, bez klucza, bez limitów).
Wynik: data/got/elevation.json { recordId: sumaPodejść[m] } — używany przez db:import-got.
Wymaga: pip install pillow
Użycie: python3 scripts/elevation_tiles.py [grupa ...]
"""
import json
import math
import os
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO

from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), "..")
GEO = os.path.join(ROOT, "data/got/geometry")
OUT = os.path.join(ROOT, "data/got/elevation.json")
CACHE = os.path.join(ROOT, ".cache/terrarium")
Z = 12
STEP_M = 60
HYST = 6  # m — szum DEM ~30 m rozdzielczości

os.makedirs(CACHE, exist_ok=True)
_tiles = {}


def tile_xy(lat, lng):
    n = 2**Z
    x = (lng + 180) / 360 * n
    y = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
    return x, y


def get_tile(tx, ty):
    key = (tx, ty)
    if key in _tiles:
        return _tiles[key]
    path = os.path.join(CACHE, f"{Z}_{tx}_{ty}.png")
    if not os.path.exists(path):
        url = f"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{Z}/{tx}/{ty}.png"
        for attempt in range(4):
            try:
                with urllib.request.urlopen(url, timeout=30) as r:
                    data = r.read()
                with open(path, "wb") as f:
                    f.write(data)
                break
            except Exception:
                if attempt == 3:
                    raise
    img = Image.open(path).convert("RGB")
    _tiles[key] = img
    return img


def elevation(lat, lng):
    x, y = tile_xy(lat, lng)
    tx, ty = int(x), int(y)
    px = (x - tx) * 256
    py = (y - ty) * 256
    img = get_tile(tx, ty)
    x0, y0 = min(255, int(px)), min(255, int(py))
    x1, y1 = min(255, x0 + 1), min(255, y0 + 1)
    fx, fy = px - x0, py - y0

    def h(ix, iy):
        r, g, b = img.getpixel((ix, iy))
        return r * 256 + g + b / 256 - 32768

    return (
        h(x0, y0) * (1 - fx) * (1 - fy)
        + h(x1, y0) * fx * (1 - fy)
        + h(x0, y1) * (1 - fx) * fy
        + h(x1, y1) * fx * fy
    )


def hav(a, b):
    R = 6371000
    p1, p2 = math.radians(a[1]), math.radians(b[1])
    dl = math.radians(b[0] - a[0])
    dp = p2 - p1
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def sample(coords):
    out = [coords[0]]
    acc = 0.0
    for i in range(1, len(coords)):
        acc += hav(coords[i - 1], coords[i])
        if acc >= STEP_M:
            out.append(coords[i])
            acc = 0.0
    out.append(coords[-1])
    return out


def gain(el):
    total, ref = 0.0, el[0]
    for e in el:
        if e - ref >= HYST:
            total += e - ref
            ref = e
        elif ref - e >= HYST:
            ref = e
    return round(total)


def tiles_for(coords):
    s = set()
    for lng, lat in coords:
        x, y = tile_xy(lat, lng)
        s.add((int(x), int(y)))
    return s


def main():
    wanted = set(sys.argv[1:])
    out = {}
    jobs = []
    for f in sorted(os.listdir(GEO)):
        if not f.endswith(".json"):
            continue
        g = json.load(open(os.path.join(GEO, f)))
        if wanted and g["groupCode"] not in wanted:
            continue
        for r in g["results"]:
            if r.get("status") == "ok" and r.get("coordinates"):
                jobs.append((r["id"], r["coordinates"]))
    print(f"odcinków: {len(jobs)}")
    needed = set()
    for _, c in jobs:
        needed |= tiles_for(c)
    print(f"kafelków: {len(needed)}")
    with ThreadPoolExecutor(8) as ex:
        list(ex.map(lambda t: get_tile(*t), sorted(needed)))
    for i, (rid, coords) in enumerate(jobs):
        pts = sample(coords)
        out[rid] = gain([elevation(lat, lng) for lng, lat in pts])
        if i % 500 == 0:
            print(i, flush=True)
    existing = json.load(open(OUT)) if os.path.exists(OUT) else {}
    existing.update(out)
    json.dump(existing, open(OUT, "w"))
    print("zapisano", len(existing))


main()
