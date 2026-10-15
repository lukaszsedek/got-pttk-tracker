#!/usr/bin/env bash
# Ponownie liczy przebiegi dla wszystkich grup poza Tatrami z już pobranych wyciągów (.cache/extract).
set -eu
cd "$(dirname "$0")/.."
run() { e=$1; shift; NODE_OPTIONS=--max-old-space-size=8192 npx tsx scripts/build-geometry.ts --extract=".cache/extract/$e.json" "$@"; }
run beskidy-zach BZ.01 BZ.02 BZ.03 BZ.04 BZ.05 BZ.06 BZ.07 BZ.08 BZ.09 BZ.10 BZ.11 BZ.12
run beskidy-wsch BW.01 BW.02 BW.03 BW.04 BW.05
run swietokrzyskie Ł.01 Ł.02 Ł.03 Ł.04 Ł.05
run sudety S.01 S.02 S.03 S.04 S.05 S.06 S.07 S.08 S.09 S.10 S.11 S.12 S.13 S.14 S.15 S.16 S.17 S.18 S.19 S.20 S.21
echo GOTOWE
