import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { BBox } from "@/lib/pttk/overpass";

const UA = "got-pttk-tracker/0.1 (+https://github.com/lukaszsedek/got-pttk-tracker)";
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface OsmElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
  members?: { type: string; ref: number; role: string; geometry?: { lat: number; lon: number }[] }[];
}

/** Zapytanie Overpass z cache na dysku, ponawianiem i rotacją serwerów. */
export async function overpass(query: string, cacheDir: string): Promise<OsmElement[]> {
  mkdirSync(cacheDir, { recursive: true });
  const file = join(cacheDir, createHash("sha1").update(query).digest("hex") + ".json");
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")).elements;

  let lastErr = "";
  for (let attempt = 0; attempt < 12; attempt++) {
    const url = ENDPOINTS[attempt % ENDPOINTS.length];
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "User-Agent": UA, Accept: "application/json" },
        body: new URLSearchParams({ data: query }),
      });
      if (res.ok) {
        const text = await res.text();
        const json = JSON.parse(text);
        writeFileSync(file, text);
        return json.elements;
      }
      lastErr = `${url} HTTP ${res.status}`;
    } catch (e) {
      lastErr = `${url} ${(e as Error).message}`;
    }
    await sleep(Math.min(60_000, 4000 * (attempt + 1) ** 1.5));
  }
  throw new Error(`Overpass niedostępny: ${lastErr}`);
}

/** Dzieli bbox na kafelki (stopnie), żeby zapytania mieściły się w limitach Overpass. */
export function tiles([s, w, n, e]: BBox, step = 0.1): BBox[] {
  const out: BBox[] = [];
  for (let la = s; la < n - 1e-9; la += step) {
    for (let lo = w; lo < e - 1e-9; lo += step) {
      out.push([la, lo, Math.min(la + step, n), Math.min(lo + step, e)].map((x) => +x.toFixed(5)) as BBox);
    }
  }
  return out;
}

/** Pobiera dane kafelkami i łączy wyniki (deduplikacja po typie i id). */
export async function overpassTiled(
  build: (b: BBox) => string,
  bbox: BBox,
  cacheDir: string,
  onProgress?: (done: number, total: number) => void,
): Promise<OsmElement[]> {
  const ts = tiles(bbox);
  const seen = new Map<string, OsmElement>();
  let done = 0;
  for (const t of ts) {
    for (const el of await overpass(build(t), cacheDir)) seen.set(`${el.type}/${el.id}`, el);
    onProgress?.(++done, ts.length);
    await sleep(500);
  }
  return [...seen.values()];
}

const bb = ([s, w, n, e]: BBox) => `${s},${w},${n},${e}`;

export const featuresQuery = (b: BBox) => `[out:json][timeout:180];
(
  node["name"]["natural"](${bb(b)});
  node["name"]["tourism"~"^(alpine_hut|wilderness_hut|viewpoint|camp_site|information|attraction|hostel|hotel|guest_house|museum)$"](${bb(b)});
  node["name"]["place"](${bb(b)});
  node["name"]["mountain_pass"](${bb(b)});
  node["name"]["railway"~"^(station|halt)$"](${bb(b)});
  node["name"]["amenity"~"^(shelter|parking|restaurant|bus_station|cafe|place_of_worship)$"](${bb(b)});
  node["name"]["highway"~"^(bus_stop|trailhead)$"](${bb(b)});
  node["name"]["historic"](${bb(b)});
  node["name"]["waterway"~"^(waterfall|dam)$"](${bb(b)});
  way["name"]["natural"](${bb(b)});
  way["name"]["landuse"~"^(meadow|grass|recreation_ground|farmland|forest|cemetery)$"](${bb(b)});
  way["name"]["place"](${bb(b)});
  way["name"]["tourism"~"^(alpine_hut|camp_site|attraction|viewpoint)$"](${bb(b)});
  way["name"]["leisure"~"^(park|nature_reserve)$"](${bb(b)});
  relation["name"]["natural"~"^(valley|ridge|peak|water)$"](${bb(b)});
);
out center tags;`;

export const routesQuery = (b: BBox) => `[out:json][timeout:180];
relation["route"~"^(hiking|foot)$"]["type"="route"](${bb(b)});
out geom tags;`;

export const highwaysQuery = (b: BBox) => `[out:json][timeout:180];
way["highway"~"^(path|track|footway|steps|bridleway|cycleway|pedestrian|service|living_street|residential|unclassified|tertiary|secondary|primary|road|via_ferrata)$"](${bb(b)});
out geom tags;`;
