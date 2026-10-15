import type { TrailColor } from "@/types/pttk";
import type { OsmElement } from "./osm";

export const COLOR_BIT: Record<TrailColor, number> = {
  Red: 1,
  Blue: 2,
  Green: 4,
  Yellow: 8,
  Black: 16,
};

const OSM_COLOR: Record<string, TrailColor> = {
  red: "Red",
  blue: "Blue",
  green: "Green",
  yellow: "Yellow",
  black: "Black",
};

export const colorMask = (cs: TrailColor[]) => cs.reduce((m, c) => m | COLOR_BIT[c], 0);

function relationColor(tags: Record<string, string> = {}): TrailColor | undefined {
  const raw = tags.colour ?? tags.color ?? tags["osmc:symbol"]?.split(":")[0] ?? "";
  return OSM_COLOR[raw.toLowerCase().trim()];
}

export interface Edge {
  to: number;
  len: number; // metry
  colors: number; // maska kolorów szlaków
  major: boolean; // droga o dużym natężeniu ruchu
}

export interface Graph {
  lng: Float64Array;
  lat: Float64Array;
  adj: Edge[][];
  grid: Map<string, number[]>;
}

const CELL = 0.003; // ~330 m
const cellKey = (lng: number, lat: number) => `${Math.floor(lng / CELL)}:${Math.floor(lat / CELL)}`;

export function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const MAJOR = new Set(["primary", "secondary", "tertiary", "road"]);

/** Buduje graf z dróg/ścieżek OSM i przypisuje im kolory z relacji szlaków. */
export function buildGraph(highways: OsmElement[], routes: OsmElement[]): Graph {
  // wayId -> maska kolorów (z relacji hiking)
  const wayColors = new Map<number, number>();
  const extraWays = new Map<number, { lat: number; lon: number }[]>();
  for (const rel of routes) {
    const color = relationColor(rel.tags);
    for (const m of rel.members ?? []) {
      if (m.type !== "way") continue;
      if (color) wayColors.set(m.ref, (wayColors.get(m.ref) ?? 0) | COLOR_BIT[color]);
      if (m.geometry?.length) extraWays.set(m.ref, m.geometry);
    }
  }

  const index = new Map<string, number>();
  const lngs: number[] = [];
  const lats: number[] = [];
  const adj: Edge[][] = [];
  const vertex = (lat: number, lon: number) => {
    const key = `${lat.toFixed(7)},${lon.toFixed(7)}`;
    let i = index.get(key);
    if (i === undefined) {
      i = lngs.length;
      index.set(key, i);
      lngs.push(lon);
      lats.push(lat);
      adj.push([]);
    }
    return i;
  };

  const addWay = (geom: { lat: number; lon: number }[], colors: number, major: boolean) => {
    for (let i = 1; i < geom.length; i++) {
      const a = vertex(geom[i - 1].lat, geom[i - 1].lon);
      const b = vertex(geom[i].lat, geom[i].lon);
      if (a === b) continue;
      const len = haversine(geom[i - 1].lat, geom[i - 1].lon, geom[i].lat, geom[i].lon);
      adj[a].push({ to: b, len, colors, major });
      adj[b].push({ to: a, len, colors, major });
    }
  };

  const seen = new Set<number>();
  for (const w of highways) {
    if (!w.geometry?.length) continue;
    seen.add(w.id);
    addWay(w.geometry, wayColors.get(w.id) ?? 0, MAJOR.has(w.tags?.highway ?? ""));
  }
  // Odcinki szlaków, których nie było w zapytaniu o drogi (np. inne typy highway).
  for (const [id, geom] of extraWays) {
    if (!seen.has(id)) addWay(geom, wayColors.get(id) ?? 0, false);
  }

  const grid = new Map<string, number[]>();
  for (let i = 0; i < lngs.length; i++) {
    const k = cellKey(lngs[i], lats[i]);
    (grid.get(k) ?? grid.set(k, []).get(k)!).push(i);
  }
  return { lng: Float64Array.from(lngs), lat: Float64Array.from(lats), adj, grid };
}

/** Najbliższy wierzchołek w promieniu `maxM` metrów (opcjonalnie tylko z krawędzią o danym kolorze). */
export function snap(
  g: Graph,
  lat: number,
  lng: number,
  maxM = 400,
  mask = 0,
): { vertex: number; distM: number } | null {
  const cx = Math.floor(lng / CELL);
  const cy = Math.floor(lat / CELL);
  const r = Math.ceil(maxM / 330) + 1;
  let best: { vertex: number; distM: number } | null = null;
  for (let dx = -r; dx <= r; dx++) {
    for (let dy = -r; dy <= r; dy++) {
      for (const v of g.grid.get(`${cx + dx}:${cy + dy}`) ?? []) {
        if (mask && !g.adj[v].some((e) => e.colors & mask)) continue;
        const d = haversine(lat, lng, g.lat[v], g.lng[v]);
        if (d <= maxM && (!best || d < best.distM)) best = { vertex: v, distM: d };
      }
    }
  }
  return best;
}

class MinHeap {
  private k: number[] = [];
  private v: number[] = [];
  get size() {
    return this.k.length;
  }
  push(key: number, val: number) {
    let i = this.k.length;
    this.k.push(key);
    this.v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.k[p] <= this.k[i]) break;
      [this.k[p], this.k[i]] = [this.k[i], this.k[p]];
      [this.v[p], this.v[i]] = [this.v[i], this.v[p]];
      i = p;
    }
  }
  pop(): [number, number] {
    const top: [number, number] = [this.k[0], this.v[0]];
    const lk = this.k.pop()!;
    const lv = this.v.pop()!;
    if (this.k.length) {
      this.k[0] = lk;
      this.v[0] = lv;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.k.length && this.k[l] < this.k[m]) m = l;
        if (r < this.k.length && this.k[r] < this.k[m]) m = r;
        if (m === i) break;
        [this.k[m], this.k[i]] = [this.k[i], this.k[m]];
        [this.v[m], this.v[i]] = [this.v[i], this.v[m]];
        i = m;
      }
    }
    return top;
  }
}

export type RouteMode = { kind: "colored"; mask: number } | { kind: "unmarked" } | { kind: "any" };

/** Mnożnik kosztu krawędzi — preferuje szlak o właściwym kolorze. */
function factor(e: Edge, mode: RouteMode): number {
  let f: number;
  if (mode.kind === "colored") {
    f = e.colors & mode.mask ? 1 : e.colors ? 2.5 : 4;
  } else if (mode.kind === "unmarked") {
    f = e.colors ? 1.2 : 1;
  } else {
    f = e.colors ? 0.8 : 1;
  }
  return e.major ? f * 3 : f;
}

export interface PathResult {
  vertices: number[];
  lengthM: number;
  cost: number;
}

/** Dijkstra z limitem kosztu (domyślnie ok. 12 km efektywnych) i odcięciem po dojściu do celu. */
export function shortestPath(
  g: Graph,
  from: number,
  to: number,
  mode: RouteMode,
  maxCostM = 40_000,
): PathResult | null {
  const dist = new Map<number, number>([[from, 0]]);
  const prev = new Map<number, number>();
  const h = new MinHeap();
  h.push(0, from);
  while (h.size) {
    const [d, u] = h.pop();
    if (u === to) break;
    if (d > (dist.get(u) ?? Infinity)) continue;
    if (d > maxCostM) break;
    for (const e of g.adj[u]) {
      const nd = d + e.len * factor(e, mode);
      if (nd < (dist.get(e.to) ?? Infinity)) {
        dist.set(e.to, nd);
        prev.set(e.to, u);
        h.push(nd, e.to);
      }
    }
  }
  if (!dist.has(to)) return null;
  const vertices = [to];
  while (vertices[0] !== from) vertices.unshift(prev.get(vertices[0])!);
  let lengthM = 0;
  for (let i = 1; i < vertices.length; i++) {
    lengthM += haversine(g.lat[vertices[i - 1]], g.lng[vertices[i - 1]], g.lat[vertices[i]], g.lng[vertices[i]]);
  }
  return { vertices, lengthM, cost: dist.get(to)! };
}

/** Maski kolorów kolejnych krawędzi ścieżki (długość = vertices.length - 1). */
export function pathEdgeColors(g: Graph, vertices: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < vertices.length; i++) {
    const e = g.adj[vertices[i - 1]].find((x) => x.to === vertices[i]);
    out.push(e?.colors ?? 0);
  }
  return out;
}
