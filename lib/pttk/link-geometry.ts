import { distance, length, point } from "@turf/turf";
import type { LineString } from "geojson";
import type { PttkNode, PttkSegment, RawPttkRecord, TrailColor } from "@/types/pttk";
import { normalizeName, parseRawRecord, type ParsedRecord } from "./parse-record";
import type { OsmRoute } from "./overpass";

export interface LinkOptions {
  /** Maks. odległość końca trasy OSM od węzła PTTK, w metrach. */
  maxEndpointDistanceM?: number;
}

export type LinkFailure =
  | { raw: string; reason: "parse" }
  | { raw: string; reason: "node-not-found"; missing: string[] }
  | { raw: string; reason: "no-geometry"; bestScoreM?: number };

export interface LinkResult {
  segments: PttkSegment[];
  failures: LinkFailure[];
}

const m = (a: [number, number], b: [number, number]) =>
  distance(point(a), point(b), { units: "meters" });

function findNode(nodes: PttkNode[], name: string, groupId: string): PttkNode | undefined {
  const n = normalizeName(name);
  const inGroup = nodes.filter((x) => x.groupId === groupId);
  return (
    inGroup.find((x) => normalizeName(x.name) === n) ??
    inGroup.find((x) => normalizeName(x.name).includes(n) || n.includes(normalizeName(x.name)))
  );
}

/** Ocena trasy: suma odległości końców od węzłów; zwraca też, czy trzeba odwrócić. */
function scoreRoute(route: OsmRoute, from: PttkNode, to: PttkNode, via?: string) {
  const c = route.geometry.coordinates as [number, number][];
  const f: [number, number] = [from.coordinates.lng, from.coordinates.lat];
  const t: [number, number] = [to.coordinates.lng, to.coordinates.lat];
  const direct = m(c[0], f) + m(c[c.length - 1], t);
  const reversed = m(c[c.length - 1], f) + m(c[0], t);
  // Delikatny bonus, gdy nazwa trasy zawiera punkt pośredni ("przez Boczań").
  const bonus = via && route.name && normalizeName(route.name).includes(normalizeName(via)) ? 0.8 : 1;
  const reverse = reversed < direct;
  return { score: Math.min(direct, reversed) * bonus, reverse };
}

function toSegment(
  rec: ParsedRecord,
  idx: number,
  from: PttkNode,
  to: PttkNode,
  route: OsmRoute,
  reverse: boolean,
): PttkSegment {
  const coords = [...route.geometry.coordinates] as [number, number][];
  const geometry: LineString = { type: "LineString", coordinates: reverse ? coords.reverse() : coords };
  const color: TrailColor = route.trailColor ?? "Red";
  return {
    id: `${rec.groupId.replace(".", "")}_${String(idx + 1).padStart(3, "0")}`,
    groupId: rec.groupId,
    fromNodeId: from.id,
    toNodeId: to.id,
    name: rec.raw.split("|")[0].trim(),
    gotPointsForward: rec.gotPointsForward,
    gotPointsBackward: rec.gotPointsBackward,
    distanceKm: Math.round(length({ type: "Feature", properties: {}, geometry }, { units: "kilometers" }) * 10) / 10,
    // Przewyższenia brak w Overpass (bez DEM) — do uzupełnienia osobnym krokiem.
    elevationGainM: 0,
    trailColor: color,
    geometry,
  };
}

/** Łączy surowe rekordy tabeli PTTK z geometrią tras OSM. */
export function linkRecordsToGeometry(
  records: RawPttkRecord[],
  nodes: PttkNode[],
  routes: OsmRoute[],
  { maxEndpointDistanceM = 400 }: LinkOptions = {},
): LinkResult {
  const segments: PttkSegment[] = [];
  const failures: LinkFailure[] = [];

  records.forEach((r, i) => {
    const rec = parseRawRecord(r);
    if (!rec) return failures.push({ raw: r.raw, reason: "parse" });

    const from = findNode(nodes, rec.fromName, rec.groupId);
    const to = findNode(nodes, rec.toName, rec.groupId);
    if (!from || !to) {
      const missing = [!from && rec.fromName, !to && rec.toName].filter(Boolean) as string[];
      return failures.push({ raw: r.raw, reason: "node-not-found", missing });
    }

    let best: { route: OsmRoute; score: number; reverse: boolean } | undefined;
    for (const route of routes) {
      const s = scoreRoute(route, from, to, rec.via);
      if (!best || s.score < best.score) best = { route, ...s };
    }
    if (!best || best.score > maxEndpointDistanceM * 2) {
      return failures.push({ raw: r.raw, reason: "no-geometry", bestScoreM: best && Math.round(best.score) });
    }
    segments.push(toSegment(rec, i, from, to, best.route, best.reverse));
  });

  return { segments, failures };
}
