import { colorMask, haversine, shortestPath, snap, type Graph, type RouteMode } from "./graph";
import { nameMatchScore } from "./names";
import type { OsmElement } from "./osm";
import type { GotRecord } from "./types";

export interface Place {
  name: string;
  lat: number;
  lng: number;
  tags: Record<string, string>;
}

export function toPlaces(elements: OsmElement[]): Place[] {
  const out: Place[] = [];
  for (const el of elements) {
    const name = el.tags?.name;
    const pos = el.type === "node" ? { lat: el.lat, lon: el.lon } : el.center;
    if (!name || !pos || pos.lat === undefined || pos.lon === undefined) continue;
    out.push({ name, lat: pos.lat, lng: pos.lon, tags: el.tags ?? {} });
  }
  return out;
}

export type GeometryStatus =
  | "ok"
  | "detour" // trasa jest dużo dłuższa niż linia prosta — niska pewność
  | "origin-not-found"
  | "destination-not-found"
  | "not-on-network"
  | "no-path";

export interface RecordGeometry {
  id: string;
  status: GeometryStatus;
  distanceKm?: number;
  straightKm?: number;
  /** [lng, lat][] od `origin` do `destination`. */
  coordinates?: [number, number][];
  originPos?: [number, number];
  destinationPos?: [number, number];
}

interface Cand {
  lat: number;
  lng: number;
  score: number;
}

const dist = (a: Cand, b: Cand) => haversine(a.lat, a.lng, b.lat, b.lng);

/** Dobór współrzędnych nazw: kandydaci z OSM + wzajemna bliskość sąsiadów w tabeli. */
export function geocodeNames(records: GotRecord[], places: Place[]) {
  const names = new Set<string>();
  const neighbors = new Map<string, Set<string>>();
  for (const r of records) {
    if (r.kind !== "edge" || !r.origin) continue;
    names.add(r.destination);
    names.add(r.origin);
    (neighbors.get(r.destination) ?? neighbors.set(r.destination, new Set()).get(r.destination)!).add(r.origin);
    (neighbors.get(r.origin) ?? neighbors.set(r.origin, new Set()).get(r.origin)!).add(r.destination);
  }

  const candidates = new Map<string, Cand[]>();
  for (const n of names) {
    const hits: Cand[] = [];
    for (const p of places) {
      const s = nameMatchScore(n, p.name);
      if (s) hits.push({ lat: p.lat, lng: p.lng, score: s });
    }
    // Zostaw tylko najlepszy poziom dopasowania (dokładne wypierają fleksyjne).
    const best = Math.max(0, ...hits.map((h) => h.score));
    candidates.set(n, hits.filter((h) => h.score === best));
  }

  // Relaksacja: wybierz kandydata najbliższego sąsiadom (kilka iteracji).
  const pick = new Map<string, Cand>();
  for (const [n, c] of candidates) if (c.length) pick.set(n, c[0]);
  for (let iter = 0; iter < 4; iter++) {
    for (const [n, c] of candidates) {
      if (c.length < 2) continue;
      const nb = [...(neighbors.get(n) ?? [])];
      let bestC = c[0];
      let bestCost = Infinity;
      for (const cand of c) {
        let cost = 0;
        for (const m of nb) {
          const mc = candidates.get(m) ?? [];
          if (!mc.length) continue;
          const ref = mc.length === 1 ? mc[0] : (pick.get(m) ?? mc[0]);
          cost += Math.min(dist(cand, ref), 30_000);
        }
        if (cost < bestCost) {
          bestCost = cost;
          bestC = cand;
        }
      }
      pick.set(n, bestC);
    }
  }
  return { pick, candidates };
}

export function buildRecordGeometries(
  records: GotRecord[],
  places: Place[],
  graph: Graph,
): { results: RecordGeometry[]; names: Map<string, Cand | undefined> } {
  const { pick } = geocodeNames(records, places);
  const results: RecordGeometry[] = [];

  for (const r of records) {
    if (r.kind !== "edge" || !r.origin) continue;
    const o = pick.get(r.origin);
    const d = pick.get(r.destination);
    if (!o) {
      results.push({ id: r.id, status: "origin-not-found" });
      continue;
    }
    if (!d) {
      results.push({ id: r.id, status: "destination-not-found" });
      continue;
    }
    const mask = colorMask(r.trailColors);
    const mode: RouteMode = mask
      ? { kind: "colored", mask }
      : r.unmarked
        ? { kind: "unmarked" }
        : { kind: "any" };
    const so = snap(graph, o.lat, o.lng, 500, mask) ?? snap(graph, o.lat, o.lng, 500);
    const sd = snap(graph, d.lat, d.lng, 500, mask) ?? snap(graph, d.lat, d.lng, 500);
    const straightKm = haversine(o.lat, o.lng, d.lat, d.lng) / 1000;
    const base = {
      id: r.id,
      straightKm: Math.round(straightKm * 100) / 100,
      originPos: [o.lng, o.lat] as [number, number],
      destinationPos: [d.lng, d.lat] as [number, number],
    };
    if (!so || !sd) {
      results.push({ ...base, status: "not-on-network" });
      continue;
    }
    const path = shortestPath(graph, so.vertex, sd.vertex, mode);
    if (!path) {
      results.push({ ...base, status: "no-path" });
      continue;
    }
    const km = path.lengthM / 1000;
    results.push({
      ...base,
      status: km > Math.max(1.5, straightKm * 3.5) ? "detour" : "ok",
      distanceKm: Math.round(km * 100) / 100,
      coordinates: path.vertices.map((v) => [
        Math.round(graph.lng[v] * 1e5) / 1e5,
        Math.round(graph.lat[v] * 1e5) / 1e5,
      ]),
    });
  }
  return { results, names: pick };
}
