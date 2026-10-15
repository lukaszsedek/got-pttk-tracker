#!/usr/bin/env bash
# Buduje geometrię dla wszystkich grup Tatr. Publiczny Overpass bywa przeciążony —
# skrypt ponawia, a ukończone kafelki są w cache (.cache/overpass), więc nic się nie traci.
set -u
cd "$(dirname "$0")/.."
GROUPS_ALL=(T.02 T.01 T.03 SK-tatry-sl-zach SK-tatry-sl-wysokie SK-tatry-sl-bielskie)
for g in "${GROUPS_ALL[@]}"; do
  for attempt in 1 2 3 4 5 6 7 8; do
    echo "=== $g (próba $attempt) ==="
    if npx tsx scripts/build-geometry.ts "$g"; then break; fi
    echo "Błąd — ponawiam za 60 s"; sleep 60
  done
done
echo "GOTOWE"
