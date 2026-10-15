import type { GpxPoint } from "@/types/pttk";

export type XY = [number, number]; // metry w lokalnym układzie

/** Rzut równoprostokątny wokół punktu odniesienia — wystarczający na skali kilkunastu km. */
export function makeProjector(lat0: number, lng0: number) {
  const kx = Math.cos((lat0 * Math.PI) / 180) * 111_320;
  const ky = 110_540;
  return (lat: number, lng: number): XY => [(lng - lng0) * kx, (lat - lat0) * ky];
}

export function haversineM(a: GpxPoint, b: GpxPoint): number {
  const R = 6_371_000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Odległość punktu od odcinka + parametr t∈[0,1] rzutu. */
export function pointToSeg(p: XY, a: XY, b: XY): { dist: number; t: number } {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return { dist: Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)), t };
}

/** Polilinia z długościami skumulowanymi. */
export class Polyline {
  readonly cum: number[] = [0];
  constructor(readonly pts: XY[]) {
    for (let i = 1; i < pts.length; i++) {
      this.cum.push(this.cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    }
  }
  get length() {
    return this.cum[this.cum.length - 1];
  }
  /** Najbliższy punkt polilinii: odległość i pozycja wzdłuż linii (m). */
  project(p: XY): { dist: number; along: number } {
    let best = { dist: Infinity, along: 0 };
    for (let i = 1; i < this.pts.length; i++) {
      const { dist, t } = pointToSeg(p, this.pts[i - 1], this.pts[i]);
      if (dist < best.dist) best = { dist, along: this.cum[i - 1] + t * (this.cum[i] - this.cum[i - 1]) };
    }
    return best;
  }
  /** Punkty rozmieszczone co `stepM` metrów (z końcami). */
  sample(stepM: number): XY[] {
    const out: XY[] = [this.pts[0]];
    let next = stepM;
    for (let i = 1; i < this.pts.length; i++) {
      while (next < this.cum[i]) {
        const t = (next - this.cum[i - 1]) / (this.cum[i] - this.cum[i - 1]);
        out.push([
          this.pts[i - 1][0] + t * (this.pts[i][0] - this.pts[i - 1][0]),
          this.pts[i - 1][1] + t * (this.pts[i][1] - this.pts[i - 1][1]),
        ]);
        next += stepM;
      }
    }
    out.push(this.pts[this.pts.length - 1]);
    return out;
  }
}
