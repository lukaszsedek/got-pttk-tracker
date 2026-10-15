import type { GpxPoint } from "@/types/pttk";
import { haversineM, makeProjector, pointToSeg, type XY } from "./geo";

export interface CleanOptions {
  /** Punkty bliższe niż to od poprzedniego są pomijane (postój/szum). */
  minStepM?: number;
  /** Maks. prędkość pieszą; szybsze skoki uznajemy za błąd GPS. */
  maxSpeedMs?: number;
  /** Tolerancja Douglasa-Peuckera w metrach. */
  simplifyToleranceM?: number;
}

/** Usuwa duplikaty i skoki GPS. Zachowuje kolejność oraz znaczniki czasu. */
export function denoise(points: GpxPoint[], { minStepM = 2, maxSpeedMs = 8 }: CleanOptions = {}): GpxPoint[] {
  const out: GpxPoint[] = [];
  for (const p of points) {
    const prev = out[out.length - 1];
    if (!prev) {
      out.push(p);
      continue;
    }
    const d = haversineM(prev, p);
    if (d < minStepM) continue;
    if (prev.time && p.time) {
      const dt = (Date.parse(p.time) - Date.parse(prev.time)) / 1000;
      if (dt > 0 && d / dt > maxSpeedMs) continue; // skok GPS
    }
    out.push(p);
  }
  return out;
}

/** Douglas–Peucker (iteracyjny) w metrach; zwraca oryginalne punkty (z czasem). */
export function simplifyTrack(points: GpxPoint[], toleranceM = 3): GpxPoint[] {
  if (points.length < 3) return points;
  const proj = makeProjector(points[0].lat, points[0].lng);
  const xy: XY[] = points.map((p) => proj(p.lat, p.lng));
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let maxD = 0;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const { dist } = pointToSeg(xy[i], xy[s], xy[e]);
      if (dist > maxD) {
        maxD = dist;
        idx = i;
      }
    }
    if (idx !== -1 && maxD > toleranceM) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return points.filter((_, i) => keep[i]);
}
