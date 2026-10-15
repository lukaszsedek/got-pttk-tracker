#!/usr/bin/env python3
"""
Wycina z wyciągu OSM (.osm.pbf) dane potrzebne do wyznaczania przebiegów odcinków GOT:
  features  — nazwane obiekty (szczyty, przełęcze, schroniska, polany, miejscowości…)
  routes    — relacje route=hiking|foot z geometrią członków
  highways  — drogi i ścieżki (graf do wyznaczania tras)
Wynik ma ten sam kształt co odpowiedzi Overpass (out geom / out center), więc używa go ten sam kod.

Użycie: python3 scripts/osm_extract.py <plik.pbf> <wyjście.json> <S,W,N,E>
Wymaga: pip install osmium
"""
import json
import sys

import osmium
from osmium.filter import KeyFilter

src, out, bbox_arg = sys.argv[1], sys.argv[2], sys.argv[3]
S, W, N, E = map(float, bbox_arg.split(","))

HIGHWAYS = {
    "path", "track", "footway", "steps", "bridleway", "cycleway", "pedestrian", "service",
    "living_street", "residential", "unclassified", "tertiary", "secondary", "primary", "road", "via_ferrata",
}
FEATURE_KEYS = ("natural", "tourism", "place", "mountain_pass", "railway", "amenity", "historic", "waterway", "man_made", "leisure")
AREA_KEYS = ("natural", "landuse", "place", "tourism", "leisure")


def inside(lat, lon):
    return S <= lat <= N and W <= lon <= E


def tags_of(o):
    return {t.k: t.v for t in o.tags}


features, highways, routes = [], {}, []

# 1) nazwane węzły
for o in osmium.FileProcessor(src, osmium.osm.NODE).with_filter(KeyFilter("name")):
    if not o.location.valid():
        continue
    lat, lon = o.location.lat, o.location.lon
    if not inside(lat, lon):
        continue
    t = tags_of(o)
    if any(k in t for k in FEATURE_KEYS) or t.get("highway") in ("bus_stop", "trailhead"):
        features.append({"type": "node", "id": o.id, "lat": lat, "lon": lon, "tags": t})
print(f"nazwane węzły: {len(features)}", file=sys.stderr)

# 2) drogi/ścieżki + nazwane obszary
for o in osmium.FileProcessor(src, osmium.osm.NODE | osmium.osm.WAY).with_locations().with_filter(KeyFilter("highway", "name")):
    if not o.is_way():
        continue
    t = tags_of(o)
    is_hw = t.get("highway") in HIGHWAYS
    is_area = "name" in t and any(k in t for k in AREA_KEYS)
    if not (is_hw or is_area):
        continue
    pts = []
    ok = True
    for n in o.nodes:
        if not n.location.valid():
            ok = False
            break
        pts.append((n.location.lat, n.location.lon))
    if not ok or not pts:
        continue
    if not any(inside(la, lo) for la, lo in pts):
        continue
    if is_hw:
        highways[o.id] = {
            "type": "way", "id": o.id, "tags": t,
            "geometry": [{"lat": la, "lon": lo} for la, lo in pts],
        }
    if is_area:
        la = sum(p[0] for p in pts) / len(pts)
        lo = sum(p[1] for p in pts) / len(pts)
        features.append({"type": "way", "id": o.id, "tags": t, "center": {"lat": la, "lon": lo}})
print(f"drogi: {len(highways)}, obiekty razem: {len(features)}", file=sys.stderr)

# 3) relacje szlaków
for o in osmium.FileProcessor(src, osmium.osm.RELATION).with_filter(KeyFilter("route")):
    t = tags_of(o)
    if t.get("route") not in ("hiking", "foot") or t.get("type") != "route":
        continue
    members = []
    for m in o.members:
        if m.type == "w" and m.ref in highways:
            members.append({"type": "way", "ref": m.ref, "role": m.role, "geometry": highways[m.ref]["geometry"]})
    if members:
        routes.append({"type": "relation", "id": o.id, "tags": t, "members": members})
print(f"trasy: {len(routes)}", file=sys.stderr)

with open(out, "w") as f:
    json.dump({"features": features, "routes": routes, "highways": list(highways.values())}, f)
print("OK", file=sys.stderr)
