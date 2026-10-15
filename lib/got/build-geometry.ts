import { colorMask, haversine, pathEdgeColors, shortestPath, snap, type Graph, type RouteMode } from "./graph";
import { nameMatchScoreAnyOrder as nameMatchScore, nameVariants } from "./names";
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
    const t = el.tags ?? {};
    const pos = el.type === "node" ? { lat: el.lat, lon: el.lon } : el.center;
    if (!pos || pos.lat === undefined || pos.lon === undefined) continue;
    // Warianty nazw: polska (też dla obiektów słowackich), alternatywne, oficjalna.
    const names = new Set(
      [t.name, t["name:pl"], t.alt_name, t["alt_name:pl"], t.official_name, t.int_name]
        .flatMap((v) => (v ? v.split(";") : []))
        .map((v) => v.trim())
        .filter(Boolean),
    );
    for (const name of names) out.push({ name, lat: pos.lat, lng: pos.lon, tags: t });
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
    // Warianty nazwy (alias, bez słów rodzajowych…); im dalszy wariant, tym niższy priorytet.
    nameVariants(n).forEach((variant, rank) => {
      for (const p of places) {
        const s = nameMatchScore(variant, p.name);
        if (s) hits.push({ lat: p.lat, lng: p.lng, score: s * 10 - rank });
      }
    });
    // Zostaw tylko najlepszy poziom dopasowania (dokładne wypierają fleksyjne i wariantowe).
    const best = Math.max(-Infinity, ...hits.map((h) => h.score));
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

/**
 * Obcina dojścia: zostawia fragment od pierwszej do ostatniej krawędzi o kolorze szlaku.
 * Odcinki GOT biegną po znakowanym szlaku, a nazwy punktów (np. dzielnica miasta)
 * geokodują się w środku miejscowości, więc ścieżka zaczyna się od niezaznakowanego dojścia.
 */
export function trimToMarkedTrail(graph: Graph, vertices: number[], mask: number): number[] {
  const colors = pathEdgeColors(graph, vertices);
  const first = colors.findIndex((c) => c & mask);
  if (first === -1) return vertices;
  let last = colors.length - 1;
  while (last > first && !(colors[last] & mask)) last--;
  const trimmed = vertices.slice(first, last + 2);
  // Zbyt agresywne przycięcie (np. szlak o innym kolorze w OSM) — zostaw całość.
  return trimmed.length >= 2 && trimmed.length >= vertices.length * 0.25 ? trimmed : vertices;
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
    let vertices = path.vertices;
    if (mask) vertices = trimToMarkedTrail(graph, vertices, mask);
    let lengthM = 0;
    for (let i = 1; i < vertices.length; i++) {
      lengthM += haversine(graph.lat[vertices[i - 1]], graph.lng[vertices[i - 1]], graph.lat[vertices[i]], graph.lng[vertices[i]]);
    }
    const km = lengthM / 1000;
    results.push({
      ...base,
      status: km > Math.max(1.5, straightKm * 3.5) ? "detour" : "ok",
      distanceKm: Math.round(km * 100) / 100,
      coordinates: vertices.map((v) => [
        Math.round(graph.lng[v] * 1e5) / 1e5,
        Math.round(graph.lat[v] * 1e5) / 1e5,
      ]),
    });
  }
  return { results, names: pick };
}
