import { getPool } from "@/lib/db";

/** Ręcznie narysowany przebieg odcinka (np. gdy nie udało się go wyznaczyć z OSM). */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json()) as { coordinates?: unknown };
  const c = body.coordinates;
  const valid =
    Array.isArray(c) &&
    c.length >= 2 &&
    c.length <= 5000 &&
    c.every(
      (p) =>
        Array.isArray(p) &&
        p.length >= 2 &&
        Number.isFinite(p[0]) &&
        Number.isFinite(p[1]) &&
        Math.abs(p[0]) <= 180 &&
        Math.abs(p[1]) <= 90,
    );
  if (!valid) return Response.json({ error: "Wymagane: coordinates [[lng,lat], ...] (min. 2 punkty)" }, { status: 400 });
  const geojson = JSON.stringify({
    type: "LineString",
    coordinates: (c as number[][]).map((p) => [p[0], p[1]]),
  });
  try {
    const { rows } = await getPool().query(
      `UPDATE segments
          SET geom = ST_SetSRID(ST_GeomFromGeoJSON($2), 4326),
              distance_km = round((ST_Length(ST_SetSRID(ST_GeomFromGeoJSON($2), 4326)::geography) / 1000)::numeric, 2),
              geom_status = 'manual'
        WHERE id = $1
        RETURNING distance_km`,
      [id, geojson],
    );
    if (!rows.length) return Response.json({ error: "Nie ma takiego odcinka" }, { status: 404 });
    return Response.json({ ok: true, distanceKm: Number(rows[0].distance_km) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** Usuwa ręcznie narysowany przebieg (przebiegi z OSM zostają). */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const { rowCount } = await getPool().query(
      `UPDATE segments SET geom = NULL, distance_km = 0, geom_status = 'no-geometry-run'
        WHERE id = $1 AND geom_status = 'manual'`,
      [id],
    );
    return Response.json({ deleted: rowCount });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
