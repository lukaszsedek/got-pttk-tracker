import type { GpxActivity, GpxPoint } from "@/types/pttk";

const GAP_MS = 6 * 3600_000; // przerwa > 6 h = nowy dzień/wycieczka

/**
 * Dzieli aktywność na wycieczki: po przerwie w zapisie > 6 h albo zmianie daty (czas lokalny śladu = UTC+1/2
 * nieznany, więc używamy przerwy). Bez znaczników czasu zwraca całość.
 */
export function splitActivityByDay(activity: GpxActivity): GpxActivity[] {
  const pts = activity.points;
  if (!pts.length || !pts.every((p) => p.time)) return [activity];
  const sorted = [...pts].sort((a, b) => Date.parse(a.time!) - Date.parse(b.time!));
  const groups: GpxPoint[][] = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i++) {
    const gap = Date.parse(sorted[i].time!) - Date.parse(sorted[i - 1].time!);
    if (gap > GAP_MS) groups.push([]);
    groups[groups.length - 1].push(sorted[i]);
  }
  if (groups.length === 1) return [activity];
  return groups
    .filter((g) => g.length > 1)
    .map((g, i) => ({ ...activity, id: `${activity.id}#${i + 1}`, points: g, startedAt: g[0].time }));
}
