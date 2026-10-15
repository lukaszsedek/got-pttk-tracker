"use client";

import { useMemo } from "react";
import { Card } from "@/components/ui";
import { dirPoints, directionLabel, downloadText, formatDate, plural, toCsv } from "@/lib/booklet";
import type { SegmentRow, UserTrailProgress } from "@/types/pttk";

interface Props {
  progress: UserTrailProgress[];
  segById: ReadonlyMap<string, SegmentRow>;
  goal: number;
  onGoalChange: (n: number) => void;
  onSelect: (segmentId: string) => void;
  onUndo: (segmentId: string, direction: "forward" | "backward") => void;
}

export default function BookletPanel({ progress, segById, goal, onGoalChange, onSelect, onUndo }: Props) {
  const rows = useMemo(
    () =>
      progress
        .map((p) => {
          const s = segById.get(p.segmentId);
          return s ? { p, s, points: dirPoints(s, p.direction) } : null;
        })
        .filter((x): x is NonNullable<typeof x> => x !== null),
    [progress, segById],
  );

  const total = rows.reduce((a, r) => a + r.points, 0);
  const byRegion = useMemo(() => {
    const m = new Map<string, { points: number; n: number }>();
    for (const r of rows) {
      const k = r.s.regionName || r.s.groupId;
      const cur = m.get(k) ?? { points: 0, n: 0 };
      m.set(k, { points: cur.points + r.points, n: cur.n + 1 });
    }
    return [...m].sort((a, b) => b[1].points - a[1].points);
  }, [rows]);

  const pct = goal > 0 ? Math.min(100, (total / goal) * 100) : 0;

  const exportCsv = () => {
    const head = ["Data", "Region", "Odcinek", "Kierunek", "Punkty GOT", "Źródło"];
    const body = [...rows]
      .sort((a, b) => a.p.completedAt.localeCompare(b.p.completedAt))
      .map((r) => [
        formatDate(r.p.completedAt),
        r.s.regionName || r.s.groupId,
        r.s.name,
        directionLabel(r.s.name, r.p.direction),
        r.points,
        r.p.sourceActivityId ? "GPX" : "ręcznie",
      ]);
    downloadText("ksiazeczka-got.csv", toCsv([head, ...body, [], ["", "", "", "Razem", total, ""]]));
  };

  return (
    <div className="flex flex-col gap-4">
      <Card title="Książeczka GOT">
        <div className="flex items-baseline justify-between">
          <span>
            <strong className="text-3xl">{total}</strong>
            <span className="text-zinc-500"> pkt</span>
          </span>
          <span className="text-xs text-zinc-500">
            {rows.length} {plural(rows.length, "wpis", "wpisy", "wpisów")}
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
          <div className="h-full rounded-full bg-green-600 transition-all" style={{ width: `${pct}%` }} />
        </div>
        <label className="mt-3 flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
          Cel punktowy (np. próg odznaki)
          <input
            type="number"
            min={0}
            value={goal}
            onChange={(e) => onGoalChange(Math.max(0, Number(e.target.value) || 0))}
            className="w-20 rounded-lg border border-zinc-300 bg-transparent px-2 py-1 text-sm dark:border-zinc-700"
          />
        </label>
        <p className="mt-1 text-xs text-zinc-500">
          {goal > total ? `Do celu brakuje ${goal - total} pkt.` : goal > 0 ? "Cel osiągnięty 🎉" : ""}
        </p>
        <button
          onClick={exportCsv}
          disabled={!rows.length}
          className="mt-3 w-full rounded-xl border border-zinc-300 py-2 text-sm font-medium disabled:opacity-40 dark:border-zinc-700"
        >
          Eksportuj do CSV (do przepisania do książeczki)
        </button>
      </Card>

      {byRegion.length > 0 && (
        <Card title="Punkty wg regionów">
          <ul className="flex flex-col gap-1.5 text-sm">
            {byRegion.map(([r, v]) => (
              <li key={r} className="flex justify-between gap-2">
                <span className="min-w-0 truncate">{r}</span>
                <span className="shrink-0 font-semibold">
                  {v.points} pkt <span className="font-normal text-zinc-500">({v.n})</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Przebyte trasy">
        {rows.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Brak wpisów. Zaimportuj plik GPX albo zalicz odcinek ręcznie w zakładce „Trasy”.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows.map(({ p, s, points }) => (
              <li key={`${p.segmentId}-${p.direction}`} className="flex items-start gap-2 py-2 text-sm">
                <button className="min-w-0 flex-1 text-left" onClick={() => onSelect(s.id)}>
                  <span className="block leading-snug font-medium">{directionLabel(s.name, p.direction)}</span>
                  <span className="text-xs text-zinc-500">
                    {formatDate(p.completedAt)} · {s.regionName || s.groupId}
                    {p.sourceActivityId ? " · GPX" : ""}
                  </span>
                </button>
                <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800 dark:bg-green-900/50 dark:text-green-300">
                  {points} pkt
                </span>
                <button
                  onClick={() => onUndo(p.segmentId, p.direction)}
                  title="Usuń wpis"
                  className="shrink-0 px-1 text-zinc-400 hover:text-red-600"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
