import type { GpxActivity, GpxPoint } from "@/types/pttk";

const attr = (s: string, name: string) =>
  s.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`))?.[1];
const tag = (s: string, name: string) =>
  s.match(new RegExp(`<${name}[^>]*>\\s*([^<]*?)\\s*</${name}>`))?.[1];

/** Parser GPX 1.0/1.1 (trkpt; gdy brak tras — rtept). Działa w przeglądarce i w Node. */
export function parseGpx(xml: string, fileName?: string): GpxActivity {
  const re = /<(trkpt|rtept)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/g;
  const all: { kind: string; p: GpxPoint }[] = [];
  for (const m of xml.matchAll(re)) {
    const lat = Number(attr(m[2], "lat"));
    const lng = Number(attr(m[2], "lon"));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const body = m[3] ?? "";
    const ele = tag(body, "ele");
    all.push({
      kind: m[1],
      p: { lat, lng, ele: ele ? Number(ele) : undefined, time: tag(body, "time") },
    });
  }
  const hasTrk = all.some((x) => x.kind === "trkpt");
  const points = all.filter((x) => x.kind === (hasTrk ? "trkpt" : "rtept")).map((x) => x.p);
  if (points.length < 2) throw new Error("Plik GPX nie zawiera śladu (min. 2 punkty).");

  const name = tag(xml.replace(/<trkpt[\s\S]*$/, ""), "name");
  const startedAt = points.find((p) => p.time)?.time;
  return {
    id: `${fileName ?? "activity"}:${startedAt ?? points.length}`,
    name: name ?? fileName,
    startedAt,
    points,
  };
}
