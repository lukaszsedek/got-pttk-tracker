"use client";

import { useMemo } from "react";
import { Card } from "@/components/ui";
import { BADGES, badgeStatus } from "@/lib/badges";
import { dirPoints } from "@/lib/booklet";
import type { SegmentRow, UserTrailProgress } from "@/types/pttk";

interface Props {
  progress: UserTrailProgress[];
  segById: ReadonlyMap<string, SegmentRow>;
  onSetGoal: (n: number) => void;
}

export default function BadgesPanel({ progress, segById, onSetGoal }: Props) {
  const { total, km, byRegion } = useMemo(() => {
    let total = 0;
    let km = 0;
    const m = new Map<string, number>();
    for (const p of progress) {
      const s = segById.get(p.segmentId);
      if (!s) continue;
      const pts = dirPoints(s, p.direction);
      total += pts;
      km += s.geometry ? s.distanceKm : 0;
      const k = s.regionName || s.groupId;
      m.set(k, (m.get(k) ?? 0) + pts);
    }
    return { total, km, byRegion: [...m].sort((a, b) => b[1] - a[1]) };
  }, [progress, segById]);

  const { earned, current, next, pct } = badgeStatus(total);
  const maxRegion = byRegion[0]?.[1] ?? 1;

  return (
    <div className="flex flex-col gap-4">
      <Card title="Zdobyte punkty">
        <div className="flex items-end justify-between">
          <div>
            <strong className="text-4xl">{total}</strong>
            <span className="text-zinc-500"> pkt GOT</span>
          </div>
          <div className="text-right text-xs text-zinc-500">
            {progress.length} wpisów
            <br />≈ {Math.round(km)} km
          </div>
        </div>
        <p className="mt-2 text-sm">
          {current ? (
            <>
              Aktualna odznaka: <strong>{current.icon} {current.name}</strong>
            </>
          ) : (
            "Jeszcze bez odznaki — pierwsza już od 15 pkt."
          )}
        </p>
        {next && (
          <div className="mt-3">
            <div className="flex justify-between text-xs text-zinc-600 dark:text-zinc-400">
              <span>Następna: {next.name}</span>
              <span>brakuje {next.points - total} pkt</span>
            </div>
            <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
              <div className="h-full rounded-full bg-green-600 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <button
              onClick={() => onSetGoal(next.points)}
              className="mt-2 text-xs font-medium text-green-700 underline dark:text-green-400"
            >
              Ustaw jako cel ({next.points} pkt)
            </button>
          </div>
        )}
      </Card>

      <Card title="Odznaki">
        <ul className="grid grid-cols-2 gap-2">
          {BADGES.map((b) => {
            const ok = earned.includes(b);
            return (
              <li
                key={b.id}
                className={`rounded-xl border p-3 text-center ${
                  ok
                    ? "border-green-500 bg-green-50 dark:bg-green-950/30"
                    : "border-zinc-200 opacity-60 dark:border-zinc-800"
                }`}
              >
                <div
                  className="mx-auto grid h-12 w-12 place-items-center rounded-full text-2xl"
                  style={{ background: ok ? b.color : "#d4d4d8", filter: ok ? undefined : "grayscale(1)" }}
                >
                  {b.icon}
                </div>
                <div className="mt-1 text-sm font-semibold">{b.name}</div>
                <div className="text-xs text-zinc-500">{ok ? "zdobyta ✓" : `${b.points} pkt`}</div>
              </li>
            );
          })}
        </ul>
      </Card>

      {byRegion.length > 0 && (
        <Card title="Punkty wg regionów">
          <ul className="flex flex-col gap-2 text-sm">
            {byRegion.map(([r, v]) => (
              <li key={r}>
                <div className="flex justify-between gap-2">
                  <span className="min-w-0 truncate">{r}</span>
                  <strong>{v}</strong>
                </div>
                <div className="mt-0.5 h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-800">
                  <div className="h-full rounded-full bg-green-600" style={{ width: `${(v / maxRegion) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
