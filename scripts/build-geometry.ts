import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildRecordGeometries, toPlaces } from "../lib/got/build-geometry";
import { buildGraph } from "../lib/got/graph";
import { featuresQuery, highwaysQuery, overpassTiled, routesQuery } from "../lib/got/osm";
import type { GotRecord } from "../lib/got/types";
import { REGION_BBOX } from "../data/got/bboxes";

const ROOT = join(__dirname, "..");
const CACHE = join(ROOT, ".cache/overpass");
const OUT = join(ROOT, "data/got/geometry");

async function main() {
  const args = process.argv.slice(2);
  const opt = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
  const wanted = args.filter((a) => !a.startsWith("--"));
  const bboxOverride = opt("bbox")?.split(",").map(Number) as
    | [number, number, number, number]
    | undefined;
  const suffix = opt("suffix");
  const all = JSON.parse(readFileSync(join(ROOT, "data/got/records.json"), "utf8")) as GotRecord[];
  const regions = wanted.length ? wanted : Object.keys(REGION_BBOX);
  mkdirSync(OUT, { recursive: true });

  for (const code of regions) {
    const bbox = bboxOverride ?? REGION_BBOX[code];
    if (!bbox) {
      console.warn(`Brak bbox dla ${code} — pomijam (dodaj w data/got/bboxes.ts)`);
      continue;
    }
    const records = all.filter((r) => r.groupCode === code && r.kind === "edge");
    console.log(`\n== ${code}: ${records.length} odcinków, bbox ${bbox.join(",")}`);
    const prog = (label: string) => (d: number, t: number) => process.stdout.write(`\r   ${label} ${d}/${t}   `);
    const feat = await overpassTiled(featuresQuery, bbox, CACHE, prog("obiekty"));
    const routes = await overpassTiled(routesQuery, bbox, CACHE, prog("trasy  "));
    const hw = await overpassTiled(highwaysQuery, bbox, CACHE, prog("drogi  "));
    process.stdout.write("\n");
    console.log(`   OSM: ${feat.length} nazwanych obiektów, ${routes.length} tras, ${hw.length} dróg/ścieżek`);

    const graph = buildGraph(hw, routes);
    const { results, names } = buildRecordGeometries(records, toPlaces(feat), graph);

    const stat: Record<string, number> = {};
    for (const r of results) stat[r.status] = (stat[r.status] ?? 0) + 1;
    console.log("   wynik:", stat);

    const placesOut = Object.fromEntries(
      [...names].map(([n, c]) => [n, c ? [Math.round(c.lng * 1e5) / 1e5, Math.round(c.lat * 1e5) / 1e5] : null]),
    );
    writeFileSync(join(OUT, `${code}${suffix ? `-${suffix}` : ""}.json`), JSON.stringify({ groupCode: code, places: placesOut, results }) + "\n");
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
