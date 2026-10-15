import "dotenv/config";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";
import type { RecordGeometry } from "../lib/got/build-geometry";
import type { GotRecord } from "../lib/got/types";

/**
 * Importuje WSZYSTKIE odcinki z tabeli PTTK (data/got/records.json) do bazy.
 * Odcinki, dla których policzono przebieg (data/got/geometry/*.json, status "ok"),
 * dostają geometrię i pojawiają się na mapie; pozostałe są na liście bez przebiegu.
 * Domyślnie odrzucamy przebiegi o statusie "detour" (opcja --include-detours).
 */
const ROOT = join(__dirname, "..");
const includeDetours = process.argv.includes("--include-detours");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const hav = (a: [number, number], b: [number, number]) => {
  const R = 6371, r = Math.PI / 180;
  const dLat = (b[1] - a[1]) * r, dLng = (b[0] - a[0]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

/** Przebieg wyraźnie za długi jak na odcinek GOT (zwykle błędnie rozpoznana nazwa punktu). */
const isSuspect = (g: RecordGeometry | undefined) => {
  const c = g?.coordinates;
  if (!c || c.length < 2) return false;
  const km = g.distanceKm ?? 0;
  const straight = hav(c[0] as [number, number], c[c.length - 1] as [number, number]);
  return km > 15 || km / Math.max(straight, 0.3) > 3.5;
};

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

async function main() {
  const records = (JSON.parse(readFileSync(join(ROOT, "data/got/records.json"), "utf8")) as GotRecord[]).filter(
    (r) => r.kind === "edge" && r.origin,
  );

  // Geometrie: ostatni wpis z "ok" wygrywa; plik pełnej grupy ma pierwszeństwo przed próbkami.
  const geoDir = join(ROOT, "data/got/geometry");
  const geo = new Map<string, RecordGeometry>();
  const nodePos = new Map<string, [number, number]>(); // "<grupa>:<nazwa>" -> [lng,lat]
  if (existsSync(geoDir)) {
    const files = readdirSync(geoDir).filter((f) => f.endsWith(".json")).sort();
    for (const f of files) {
      const g = JSON.parse(readFileSync(join(geoDir, f), "utf8")) as {
        groupCode: string;
        places: Record<string, [number, number] | null>;
        results: RecordGeometry[];
      };
      for (const [name, pos] of Object.entries(g.places)) if (pos) nodePos.set(`${g.groupCode}:${name}`, pos);
      for (const r of g.results) {
        const usable = r.coordinates && (r.status === "ok" || (includeDetours && r.status === "detour"));
        if (usable || !geo.has(r.id)) geo.set(r.id, r);
      }
    }
  }

  // Przewyższenia (scripts/add-elevation.ts), jeśli policzone.
  const elevFile = join(ROOT, "data/got/elevation.json");
  const elev: Record<string, number> = existsSync(elevFile) ? JSON.parse(readFileSync(elevFile, "utf8")) : {};

  // Usuń dawne dane przykładowe (T01_001…).
  await pool.query(`DELETE FROM segments WHERE id ~ '^T01_[0-9]+$'`);
  await pool.query(`DELETE FROM nodes WHERE id IN ('kuznice','przel-miedzy-kopami','myslenickie-turnie','kasprowy-wierch')`);

  // Węzły.
  const nodes = new Map<string, { name: string; group: string; lng: number | null; lat: number | null }>();
  for (const r of records) {
    for (const name of [r.origin!, r.destination]) {
      const id = `${r.groupCode}:${slug(name)}`;
      const pos = nodePos.get(`${r.groupCode}:${name}`);
      if (!nodes.has(id) || (pos && nodes.get(id)!.lng === null)) {
        nodes.set(id, { name, group: r.groupCode, lng: pos?.[0] ?? null, lat: pos?.[1] ?? null });
      }
    }
  }
  const nArr = [...nodes];
  await pool.query(
    `INSERT INTO nodes (id, name, group_id, geom)
     SELECT t.id, t.name, t.grp,
            CASE WHEN t.lng IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint(t.lng, t.lat), 4326) END
       FROM unnest($1::text[], $2::text[], $3::text[], $4::float8[], $5::float8[]) AS t(id, name, grp, lng, lat)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, geom = COALESCE(EXCLUDED.geom, nodes.geom)`,
    [
      nArr.map(([id]) => id),
      nArr.map(([, n]) => n.name),
      nArr.map(([, n]) => n.group),
      nArr.map(([, n]) => n.lng),
      nArr.map(([, n]) => n.lat),
    ],
  );

  // Odcinki (partiami, żeby nie przekroczyć limitów parametrów).
  let withGeom = 0;
  const BATCH = 500;
  for (let i = 0; i < records.length; i += BATCH) {
    const part = records.slice(i, i + BATCH);
    const cols: Record<string, unknown[]> = {
      id: [], grp: [], from: [], to: [], name: [], region: [], pf: [], pb: [], km: [], gain: [], color: [], unmarked: [], status: [], geom: [],
    };
    for (const r of part) {
      const g = geo.get(r.id);
      const suspect = isSuspect(g);
      const usable = !!g?.coordinates && !suspect && (g.status === "ok" || (includeDetours && g.status === "detour"));
      if (usable) withGeom++;
      cols.id.push(r.id);
      cols.grp.push(r.groupCode);
      cols.from.push(`${r.groupCode}:${slug(r.origin!)}`);
      cols.to.push(`${r.groupCode}:${slug(r.destination)}`);
      cols.name.push(`${r.origin} – ${r.destination}`);
      cols.region.push(r.regionName);
      cols.pf.push(r.pointsForward ?? 0);
      cols.pb.push(r.pointsBackward ?? r.pointsForward ?? 0);
      cols.km.push(usable ? (g!.distanceKm ?? 0) : 0);
      cols.gain.push(usable ? (elev[r.id] ?? 0) : 0);
      cols.color.push(r.trailColors[0] ?? null);
      cols.unmarked.push(r.unmarked);
      cols.status.push(suspect ? "suspect" : (g?.status ?? "no-geometry-run"));
      cols.geom.push(usable ? JSON.stringify({ type: "LineString", coordinates: g!.coordinates }) : null);
    }
    await pool.query(
      `INSERT INTO segments (id, group_id, from_node_id, to_node_id, name, region_name,
                             got_points_forward, got_points_backward, distance_km,
                             elevation_gain_m, trail_color, unmarked, geom_status, geom)
       SELECT t.id, t.grp, t.f, t.t, t.name, t.region, t.pf, t.pb, t.km, t.gain, t.color, t.unmarked, t.status,
              CASE WHEN t.geom IS NULL THEN NULL ELSE ST_SetSRID(ST_GeomFromGeoJSON(t.geom), 4326) END
         FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[],
                     $7::int[], $8::int[], $9::real[], $10::text[], $11::bool[], $12::text[], $13::text[], $14::int[])
              AS t(id, grp, f, t, name, region, pf, pb, km, color, unmarked, status, geom, gain)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name, region_name = EXCLUDED.region_name,
         got_points_forward = EXCLUDED.got_points_forward, got_points_backward = EXCLUDED.got_points_backward,
         distance_km = EXCLUDED.distance_km, elevation_gain_m = EXCLUDED.elevation_gain_m, trail_color = EXCLUDED.trail_color, unmarked = EXCLUDED.unmarked,
         geom_status = EXCLUDED.geom_status, geom = COALESCE(EXCLUDED.geom, segments.geom)`,
      [cols.id, cols.grp, cols.from, cols.to, cols.name, cols.region, cols.pf, cols.pb, cols.km, cols.color, cols.unmarked, cols.status, cols.geom, cols.gain],
    );
  }
  console.log(`zaimportowano ${records.length} odcinków, w tym ${withGeom} z przebiegiem na mapie`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
