import "dotenv/config";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";
import { SAMPLE_NODES, SAMPLE_SEGMENTS } from "../data/sample-t01";

const cmd = process.argv[2];
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  const dir = join(__dirname, "../db/migrations");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await pool.query(readFileSync(join(dir, f), "utf8"));
    console.log("migrated", f);
  }
}

async function seed() {
  for (const n of SAMPLE_NODES) {
    await pool.query(
      `INSERT INTO nodes (id, name, group_id, geom)
       VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326))
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, geom = EXCLUDED.geom`,
      [n.id, n.name, n.groupId, n.coordinates.lng, n.coordinates.lat],
    );
  }
  for (const s of SAMPLE_SEGMENTS) {
    await pool.query(
      `INSERT INTO segments (id, group_id, from_node_id, to_node_id, name,
         got_points_forward, got_points_backward, distance_km, elevation_gain_m,
         trail_color, geom)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, ST_SetSRID(ST_GeomFromGeoJSON($11), 4326))
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name, got_points_forward = EXCLUDED.got_points_forward,
         got_points_backward = EXCLUDED.got_points_backward, distance_km = EXCLUDED.distance_km,
         elevation_gain_m = EXCLUDED.elevation_gain_m, trail_color = EXCLUDED.trail_color,
         geom = EXCLUDED.geom`,
      [
        s.id, s.groupId, s.fromNodeId, s.toNodeId, s.name, s.gotPointsForward,
        s.gotPointsBackward, s.distanceKm, s.elevationGainM, s.trailColor,
        JSON.stringify(s.geometry),
      ],
    );
  }
  console.log(`seeded ${SAMPLE_NODES.length} nodes, ${SAMPLE_SEGMENTS.length} segments`);
}

async function main() {
  if (cmd === "migrate") await migrate();
  else if (cmd === "seed") await seed();
  else throw new Error("Użycie: tsx scripts/db.ts migrate|seed");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
