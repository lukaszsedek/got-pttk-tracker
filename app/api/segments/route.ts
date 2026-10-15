import type { LineString } from "geojson";
import { getPool } from "@/lib/db";
import type { SegmentRow, TrailColor } from "@/types/pttk";

interface Row {
  id: string;
  group_id: string;
  from_node_id: string;
  to_node_id: string;
  name: string;
  region_name: string;
  got_points_forward: number;
  got_points_backward: number;
  distance_km: number;
  elevation_gain_m: number;
  trail_color: TrailColor | null;
  unmarked: boolean;
  geom_status: string;
  geometry: LineString | null;
}

/** Wszystkie odcinki (z przebiegiem na mapie lub bez). Bez wyboru grupy. */
export async function GET() {
  try {
    const { rows } = await getPool().query<Row>(
      `SELECT id, group_id, from_node_id, to_node_id, name, region_name,
              got_points_forward, got_points_backward, distance_km,
              elevation_gain_m, trail_color, unmarked, geom_status,
              ST_AsGeoJSON(geom, 5)::json AS geometry
         FROM segments
        ORDER BY (geom IS NULL), group_id, name`,
    );
    const segments: SegmentRow[] = rows.map((r) => ({
      id: r.id,
      groupId: r.group_id,
      fromNodeId: r.from_node_id,
      toNodeId: r.to_node_id,
      name: r.name,
      regionName: r.region_name,
      gotPointsForward: r.got_points_forward,
      gotPointsBackward: r.got_points_backward,
      distanceKm: r.distance_km,
      elevationGainM: r.elevation_gain_m,
      trailColor: r.trail_color,
      unmarked: r.unmarked,
      geomStatus: r.geom_status,
      geometry: r.geometry,
    }));
    return Response.json({ segments });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
