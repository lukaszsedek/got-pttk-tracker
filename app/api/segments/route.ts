import type { LineString } from "geojson";
import { getPool } from "@/lib/db";
import type { PttkSegment, TrailColor } from "@/types/pttk";

interface Row {
  id: string;
  group_id: string;
  from_node_id: string;
  to_node_id: string;
  name: string;
  got_points_forward: number;
  got_points_backward: number;
  distance_km: number;
  elevation_gain_m: number;
  trail_color: TrailColor;
  geometry: LineString;
}

export async function GET(request: Request) {
  const group = new URL(request.url).searchParams.get("group") ?? "T.01";
  try {
    const { rows } = await getPool().query<Row>(
      `SELECT id, group_id, from_node_id, to_node_id, name,
              got_points_forward, got_points_backward, distance_km,
              elevation_gain_m, trail_color, ST_AsGeoJSON(geom)::json AS geometry
         FROM segments WHERE group_id = $1 ORDER BY id`,
      [group],
    );
    const segments: PttkSegment[] = rows.map((r) => ({
      id: r.id,
      groupId: r.group_id,
      fromNodeId: r.from_node_id,
      toNodeId: r.to_node_id,
      name: r.name,
      gotPointsForward: r.got_points_forward,
      gotPointsBackward: r.got_points_backward,
      distanceKm: r.distance_km,
      elevationGainM: r.elevation_gain_m,
      trailColor: r.trail_color,
      geometry: r.geometry,
    }));
    return Response.json({ segments });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
