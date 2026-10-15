import type {
  Direction,
  GpxActivity,
  MatchableSegment,
  MatchSummary,
  SegmentMatch,
} from "@/types/pttk";
import { denoise, simplifyTrack, type CleanOptions } from "./clean";
import { makeProjector, Polyline, type XY } from "./geo";

export interface MatchOptions extends CleanOptions {
  /** Bufor tolerancji dopasowania do szlaku (m). */
  bufferM?: number;
  /** Minimalny odsetek długości odcinka, który ślad musi pokryć. */
  minCoverage?: number;
  /** Dolna granica „dopasowań częściowych” do ręcznego potwierdzenia. */
  partialCoverage?: number;
}

interface Traversal {
  dir: Direction;
  span: number;
}

/** Dzieli ciąg pozycji wzdłuż odcinka na przejścia monotoniczne (tam / z powrotem). */
function splitTraversals(alongs: number[], turnM = 30, startM = 15): Traversal[] {
  const res: Traversal[] = [];
  if (!alongs.length) return res;
  let dir = 0;
  let start = alongs[0];
  let ext = alongs[0];
  const close = () => {
    if (dir !== 0) res.push({ dir: dir > 0 ? "forward" : "backward", span: Math.abs(ext - start) });
  };
  for (const a of alongs.slice(1)) {
    if (dir === 0) {
      if (Math.abs(a - start) >= startM) {
        dir = Math.sign(a - start);
        ext = a;
      }
    } else if (dir > 0) {
      if (a > ext) ext = a;
      else if (ext - a > turnM) {
        close();
        start = ext;
        ext = a;
        dir = -1;
      }
    } else {
      if (a < ext) ext = a;
      else if (a - ext > turnM) {
        close();
        start = ext;
        ext = a;
        dir = 1;
      }
    }
  }
  close();
  return res;
}

/**
 * Map matching: dopasowuje ślad GPX do odcinków PTTK.
 * 1) czyszczenie + Douglas–Peucker, 2) pokrycie odcinka w buforze,
 * 3) kierunek z kolejności punktów (czasu), 4) punkty GOT.
 */
export function matchActivity(
  activity: GpxActivity,
  segments: MatchableSegment[],
  completedIds: ReadonlySet<string>,
  { bufferM = 25, minCoverage = 0.85, partialCoverage = 0.5, ...clean }: MatchOptions = {},
): MatchSummary {
  // Kolejność wg czasu, jeśli dostępny.
  let pts = activity.points;
  if (pts.every((p) => p.time)) {
    pts = [...pts].sort((a, b) => Date.parse(a.time!) - Date.parse(b.time!));
  }
  const track = simplifyTrack(denoise(pts, clean), clean.simplifyToleranceM ?? 3);
  const matches: SegmentMatch[] = [];
  const coverages: { segmentId: string; coverage: number }[] = [];
  if (track.length < 2) return { activityId: activity.id, startedAt: activity.startedAt, matches, newSegments: 0, totalGotPoints: 0 };

  const proj = makeProjector(track[0].lat, track[0].lng);
  const trackXY: XY[] = track.map((p) => proj(p.lat, p.lng));
  const trackLine = new Polyline(trackXY);

  // Wstępny filtr: odcinki, których ramka nie dotyka ramki śladu (z zapasem na bufor).
  const pad = 0.0015; // ~150 m
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const p of track) {
    minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng); maxLng = Math.max(maxLng, p.lng);
  }

  for (const seg of segments) {
    let sMinLat = Infinity, sMaxLat = -Infinity, sMinLng = Infinity, sMaxLng = -Infinity;
    for (const [lng, lat] of seg.geometry.coordinates) {
      sMinLat = Math.min(sMinLat, lat); sMaxLat = Math.max(sMaxLat, lat);
      sMinLng = Math.min(sMinLng, lng); sMaxLng = Math.max(sMaxLng, lng);
    }
    if (sMaxLat < minLat - pad || sMinLat > maxLat + pad || sMaxLng < minLng - pad || sMinLng > maxLng + pad) {
      continue;
    }
    const line = new Polyline(
      seg.geometry.coordinates.map(([lng, lat]) => proj(lat, lng)),
    );
    if (line.length < 1) continue;

    // Pokrycie: jaka część odcinka leży w buforze wokół śladu.
    const samples = line.sample(10);
    const covered = samples.filter((s) => trackLine.project(s).dist <= bufferM).length;
    const coverage = covered / samples.length;
    coverages.push({ segmentId: seg.id, coverage: Math.round(coverage * 100) / 100 });
    if (coverage < partialCoverage) continue;
    const partial = coverage < minCoverage;

    // Kolejność punktów śladu w buforze → pozycje wzdłuż odcinka. Przerwa w buforze zamyka przebieg.
    const runs: number[][] = [];
    let cur: number[] = [];
    for (const p of trackXY) {
      const { dist, along } = line.project(p);
      if (dist <= bufferM) cur.push(along);
      else if (cur.length) {
        runs.push(cur);
        cur = [];
      }
    }
    if (cur.length) runs.push(cur);

    const dirs = new Set<Direction>();
    for (const run of runs) {
      for (const t of splitTraversals(run)) {
        if (t.span >= 0.7 * line.length) dirs.add(t.dir);
      }
    }
    if (!dirs.size) {
      // Ślad z przerwami — kierunek wg pierwszego i ostatniego punktu w buforze.
      const flat = runs.flat();
      if (flat.length >= 2) dirs.add(flat[flat.length - 1] >= flat[0] ? "forward" : "backward");
    }

    for (const direction of dirs) {
      matches.push({
        segmentId: seg.id,
        direction,
        coverage: Math.round(coverage * 100) / 100,
        gotPoints: direction === "forward" ? seg.gotPointsForward : seg.gotPointsBackward,
        alreadyCompleted: completedIds.has(seg.id),
        ...(partial ? { partial: true } : {}),
      });
    }
  }

  const fresh = matches.filter((m) => !m.alreadyCompleted && !m.partial);
  return {
    activityId: activity.id,
    startedAt: activity.startedAt,
    matches,
    newSegments: new Set(fresh.map((m) => m.segmentId)).size,
    totalGotPoints: fresh.reduce((s, m) => s + m.gotPoints, 0),
    diagnostics: {
      trackPoints: track.length,
      trackLengthKm: Math.round((trackLine.length / 1000) * 10) / 10,
      coverage: coverages.sort((a, b) => b.coverage - a.coverage),
    },
  };
}
