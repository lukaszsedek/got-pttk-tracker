import type { Feature, LineString } from "geojson";
import type { TrailColor } from "@/types/pttk";

/** [south, west, north, east] */
export type BBox = [number, number, number, number];

/** Trasa turystyczna z OSM jako jedna ciągła (o ile się dało) linia. */
export interface OsmRoute {
  osmId: number;
  name?: string;
  ref?: string;
  trailColor?: TrailColor;
  geometry: LineString;
}

interface OverpassMember {
  type: string;
  role: string;
  geometry?: { lat: number; lon: number }[];
}
interface OverpassRelation {
  type: "relation";
  id: number;
  tags?: Record<string, string>;
  members?: OverpassMember[];
}

const ENDPOINT = "https://overpass-api.de/api/interpreter";

export function buildHikingQuery([s, w, n, e]: BBox): string {
  return `[out:json][timeout:60];
relation["route"="hiking"]["type"="route"](${s},${w},${n},${e});
out geom;`;
}

const COLORS: Record<string, TrailColor> = {
  red: "Red",
  blue: "Blue",
  green: "Green",
  yellow: "Yellow",
  black: "Black",
};

function colorFromTags(tags: Record<string, string> = {}): TrailColor | undefined {
  const raw = (tags.colour ?? tags["osmc:symbol"] ?? "").split(/[:\s]/)[0].toLowerCase();
  return COLORS[raw];
}

type Coord = [number, number]; // [lng, lat]

const same = (a: Coord, b: Coord) => a[0] === b[0] && a[1] === b[1];

/** Zszywa nieuporządkowane way'e relacji w jedną linię (zachłannie po końcach). */
export function stitchWays(ways: Coord[][]): Coord[] {
  const rest = ways.filter((w) => w.length > 1).map((w) => [...w]);
  if (!rest.length) return [];
  let line = rest.shift()!;
  while (rest.length) {
    const head = line[0];
    const tail = line[line.length - 1];
    const i = rest.findIndex(
      (w) => same(w[0], tail) || same(w[w.length - 1], tail) || same(w[0], head) || same(w[w.length - 1], head),
    );
    if (i === -1) {
      // Rozłączny fragment — dołącz tak jak jest (zachowaj długość, nie gubimy danych).
      line = line.concat(rest.shift()!);
      continue;
    }
    const w = rest.splice(i, 1)[0];
    if (same(w[0], tail)) line = line.concat(w.slice(1));
    else if (same(w[w.length - 1], tail)) line = line.concat([...w].reverse().slice(1));
    else if (same(w[w.length - 1], head)) line = w.concat(line.slice(1));
    else line = [...w].reverse().concat(line.slice(1));
  }
  return line;
}

export function relationToRoute(rel: OverpassRelation): OsmRoute | null {
  const ways = (rel.members ?? [])
    .filter((m) => m.type === "way" && m.geometry?.length)
    .map((m) => m.geometry!.map((p): Coord => [p.lon, p.lat]));
  const coords = stitchWays(ways);
  if (coords.length < 2) return null;
  return {
    osmId: rel.id,
    name: rel.tags?.name,
    ref: rel.tags?.ref,
    trailColor: colorFromTags(rel.tags),
    geometry: { type: "LineString", coordinates: coords },
  };
}

export async function fetchHikingRoutes(bbox: BBox, signal?: AbortSignal): Promise<OsmRoute[]> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    // Overpass odrzuca (406) zapytania bez User-Agent.
    headers: { "User-Agent": "got-pttk-tracker/0.1 (+https://github.com/lukaszsedek/got-pttk-tracker)" },
    body: new URLSearchParams({ data: buildHikingQuery(bbox) }),
    signal,
  });
  if (!res.ok) throw new Error(`Overpass API: HTTP ${res.status}`);
  const json = (await res.json()) as { elements: OverpassRelation[] };
  return json.elements
    .filter((el) => el.type === "relation")
    .map(relationToRoute)
    .filter((r): r is OsmRoute => r !== null);
}

export const routeToFeature = (r: OsmRoute): Feature<LineString> => ({
  type: "Feature",
  geometry: r.geometry,
  properties: { osmId: r.osmId, name: r.name, ref: r.ref, trailColor: r.trailColor },
});
