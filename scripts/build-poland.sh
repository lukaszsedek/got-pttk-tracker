#!/usr/bin/env bash
# Buduje przebiegi odcinków GOT poza Tatrami z lokalnych wyciągów Geofabrik.
# Wymaga: python3 z `pip install osmium` (PYTHON=/ścieżka/do/python), node/tsx.
# Użycie: bash scripts/build-poland.sh [beskidy-zach beskidy-wsch sudety swietokrzyskie]
set -eu
cd "$(dirname "$0")/.."
PY="${PYTHON:-python3}"
PBF=.cache/pbf
EX=.cache/extract
mkdir -p "$PBF" "$EX"

fetch() { # <nazwa-województwa>
  [ -s "$PBF/$1.osm.pbf" ] || curl -fL -o "$PBF/$1.osm.pbf" "https://download.geofabrik.de/europe/poland/$1-latest.osm.pbf"
}
# extract <wyjście> <S,W,N,E> <województwa...>
extract() {
  out=$1; bbox=$2; shift 2
  [ -s "$EX/$out.json" ] && return 0
  parts=()
  for v in "$@"; do
    fetch "$v"
    [ -s "$EX/$out.$v.json" ] || $PY scripts/osm_extract.py "$PBF/$v.osm.pbf" "$EX/$out.$v.json" "$bbox"
    parts+=("$EX/$out.$v.json")
  done
  node -e '
    const fs=require("fs");const [out,...p]=process.argv.slice(1);
    const m={features:[],routes:[],highways:[]};
    for(const f of p){const j=JSON.parse(fs.readFileSync(f,"utf8"));for(const k in m)for(const x of j[k])m[k].push(x);fs.unlinkSync(f);}
    fs.writeFileSync(out,JSON.stringify(m));' "$EX/$out.json" "${parts[@]}"
}
build() { # <extract> <grupy...>
  e=$1; shift
  NODE_OPTIONS=--max-old-space-size=8192 npx tsx scripts/build-geometry.ts --extract="$EX/$e.json" "$@"
}

target="${1:-all}"
if [ "$target" = all ] || [ "$target" = beskidy-zach ]; then
  extract beskidy-zach 49.2,18.6,50.1,20.9 slaskie malopolskie
  build beskidy-zach BZ.01 BZ.02 BZ.03 BZ.04 BZ.05 BZ.06 BZ.07 BZ.08 BZ.09 BZ.10 BZ.11 BZ.12
fi
if [ "$target" = all ] || [ "$target" = beskidy-wsch ]; then
  extract beskidy-wsch 49.0,20.7,50.3,23.1 podkarpackie malopolskie
  build beskidy-wsch BW.01 BW.02 BW.03 BW.04 BW.05
fi
if [ "$target" = all ] || [ "$target" = sudety ]; then
  extract sudety 50.0,15.2,51.1,17.7 dolnoslaskie opolskie
  build sudety S.01 S.02 S.03 S.04 S.05 S.06 S.07 S.08 S.09 S.10 S.11 S.12 S.13 S.14 S.15 S.16 S.17 S.18 S.19 S.20 S.21
fi
if [ "$target" = all ] || [ "$target" = swietokrzyskie ]; then
  extract swietokrzyskie 50.4,20.2,51.4,21.6 swietokrzyskie
  build swietokrzyskie Ł.01 Ł.02 Ł.03 Ł.04 Ł.05
fi
echo GOTOWE
