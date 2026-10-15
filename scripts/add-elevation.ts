/**
 * Wylicza przewyższenie (suma podejść) każdego odcinka z przebiegiem.
 * Wysokości: Open-Meteo Elevation API (model Copernicus DEM, 90 m) — darmowe, bez klucza.
 * Wynik: data/got/elevation.json { [recordId]: gainM } — używany przez db:import-got.
 * Użycie: npx tsx scripts/add-elevation.ts [grupa ...]
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const GEO = join(ROOT, "data/got/geometry");
const OUT = join(ROOT, "data/got/elevation.json");
const wanted = process.argv.slice(2);

const hav = (a: [number, number], b: [number, number]) => {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (b[1] - a[1]) * r, dLng = (b[0] - a[0]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

/** Próbkuje linię co ~stepM metrów, maksymalnie maxPts punktów. */
function sample(coords: [number, number][], stepM = 120, maxPts = 40): [number, number][] {
  const out: [number, number][] = [coords[0]];
  let acc = 0;
  for (let i = 1; i < coords.length; i++) {
    acc += hav(coords[i - 1], coords[i]);
    if (acc >= stepM) {
      out.push(coords[i]);
      acc = 0;
    }
  }
  out.push(coords[coords.length - 1]);
  if (out.length <= maxPts) return out;
  const k = (out.length - 1) / (maxPts - 1);
  return Array.from({ length: maxPts }, (_, i) => out[Math.round(i * k)]);
}

async function elevations(pts: [number, number][]): Promise<number[]> {
  const url =
    "https://api.open-meteo.com/v1/elevation?latitude=" +
    pts.map((p) => p[1].toFixed(5)).join(",") +
    "&longitude=" +
    pts.map((p) => p[0].toFixed(5)).join(",");
  for (let attempt = 0; attempt < 30; attempt++) {
    const res = await fetch(url);
    if (res.ok) return ((await res.json()) as { elevation: number[] }).elevation;
    // 429: limit minutowy — czekamy minutę i ponawiamy.
    await new Promise((r) => setTimeout(r, res.status === 429 ? 65_000 : 3000));
  }
  throw new Error("Open-Meteo niedostępne");
}

/** Suma podejść z histerezą (ignoruje wahania < 8 m, bo DEM ma 90 m rozdzielczości). */
function gain(el: number[], hysteresis = 8): number {
  let total = 0;
  let ref = el[0];
  for (const e of el) {
    if (e - ref >= hysteresis) {
      total += e - ref;
      ref = e;
    } else if (ref - e >= hysteresis) ref = e;
  }
  return Math.round(total);
}

async function main() {
  const out: Record<string, number> = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
  const files = readdirSync(GEO).filter((f) => f.endsWith(".json") && (!wanted.length || wanted.includes(f.replace(/\.json$/, ""))));
  for (const f of files) {
    const g = JSON.parse(readFileSync(join(GEO, f), "utf8")) as {
      results: { id: string; status: string; coordinates?: [number, number][] }[];
    };
    let n = 0;
    for (const r of g.results) {
      if (r.status !== "ok" || !r.coordinates || out[r.id] !== undefined) continue;
      out[r.id] = gain(await elevations(sample(r.coordinates)));
      n++;
      if (n % 25 === 0) writeFileSync(OUT, JSON.stringify(out) + "\n");
      await new Promise((r) => setTimeout(r, 150));
    }
    console.log(`${f}: policzono ${n}`);
    writeFileSync(OUT, JSON.stringify(out) + "\n");
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
