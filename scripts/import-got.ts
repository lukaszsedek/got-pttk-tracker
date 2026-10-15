import "dotenv/config";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";
import type { RecordGeometry } from "../lib/got/build-geometry";
import type { GotRecord } from "../lib/got/types";

/**
 * Wczytuje zescrapowane rekordy GOT + wyznaczone geometrie do bazy.
 * Importowane są tylko odcinki ze statusem "ok" (lub "detour" z flagą --include-detours).
 */
const ROOT = join(__dirname, "..");
const includeDetours = process.argv.includes("--include-detours");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

async function main() {
  const records = new Map(
    (JSON.parse(readFileSync(join(ROOT, "data/got/records.json"), "utf8")) as GotRecord[]).map((r) => [r.id, r]),
  );
  const dir = join(ROOT, "data/got/geometry");
  let nodes = 0;
  let segs = 0;
  let skipped = 0;

  for (const f of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const g = JSON.parse(readFileSync(join(dir, f), "utf8")) as {
      groupCode: string;
      results: RecordGeometry[];
    };
    for (const res of g.results) {
      const r = records.get(res.id);
      const ok = res.status === "ok" || (includeDetours && res.status === "detour");
      if (!r || !ok || !res.coordinates || res.coordinates.length < 2 || !r.origin) {
        skipped++;
        continue;
      }
      const fromId = `${g.groupCode}:${slug(r.origin)}`;
      const toId = `${g.groupCode}:${slug(r.destination)}`;
      const [oLng, oLat] = res.originPos!;
      const [dLng, dLat] = res.destinationPos!;
      for (const [id, name, lng, lat] of [
        [fromId, r.origin, oLng, oLat],
        [toId, r.destination, dLng, dLat],
      ] as const) {
        await pool.query(
          `INSERT INTO nodes (id, name, group_id, geom)
           VALUES ($1,$2,$3, ST_SetSRID(ST_MakePoint($4,$5),4326))
           ON CONFLICT (id) DO UPDATE SET geom = EXCLUDED.geom`,
          [id, name, g.groupCode, lng, lat],
        );
        nodes++;
      }
      const color = r.trailColors[0] ?? "Black"; // brak koloru (BZ) → neutralny
      await pool.query(
        `INSERT INTO segments (id, group_id, from_node_id, to_node_id, name,
           got_points_forward, got_points_backward, distance_km, elevation_gain_m, trail_color, geom)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,$9, ST_SetSRID(ST_GeomFromGeoJSON($10),4326))
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name, got_points_forward = EXCLUDED.got_points_forward,
           got_points_backward = EXCLUDED.got_points_backward, distance_km = EXCLUDED.distance_km,
           trail_color = EXCLUDED.trail_color, geom = EXCLUDED.geom`,
        [
          r.id,
          g.groupCode,
          fromId,
          toId,
          `${r.origin} – ${r.destination}`,
          r.pointsForward ?? 0,
          r.pointsBackward ?? r.pointsForward ?? 0,
          res.distanceKm ?? 0,
          color,
          JSON.stringify({ type: "LineString", coordinates: res.coordinates }),
        ],
      );
      segs++;
    }
  }
  console.log(`zaimportowano ${segs} odcinków (${nodes} zapisów węzłów), pominięto ${skipped}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
