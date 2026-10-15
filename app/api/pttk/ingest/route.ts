import { fetchHikingRoutes, type BBox } from "@/lib/pttk/overpass";
import { linkRecordsToGeometry } from "@/lib/pttk/link-geometry";
import type { PttkNode, RawPttkRecord } from "@/types/pttk";

interface IngestBody {
  records: RawPttkRecord[];
  nodes: PttkNode[];
  bbox: BBox; // [south, west, north, east]
}

export async function POST(request: Request) {
  const body = (await request.json()) as Partial<IngestBody>;
  const { records, nodes, bbox } = body;
  if (!Array.isArray(records) || !Array.isArray(nodes) || bbox?.length !== 4) {
    return Response.json({ error: "Wymagane: records[], nodes[], bbox[4]" }, { status: 400 });
  }
  try {
    const routes = await fetchHikingRoutes(bbox);
    const result = linkRecordsToGeometry(records, nodes, routes);
    return Response.json({ routesFound: routes.length, ...result });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
