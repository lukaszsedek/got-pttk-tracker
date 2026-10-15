"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui";
import { dateInputToIso, dirPoints, directionLabel, key, todayInput } from "@/lib/booklet";
import type { Direction, PlanItem, SegmentRow } from "@/types/pttk";

interface Props {
  plan: PlanItem[];
  segById: ReadonlyMap<string, SegmentRow>;
  currentPoints: number;
  goal: number;
  onSelect: (segmentId: string) => void;
  onRemove: (segmentId: string, direction: Direction) => void;
  onCompleteAll: (items: { segmentId: string; direction: Direction }[], completedAtIso: string) => void;
}

export default function PlanPanel({ plan, segById, currentPoints, goal, onSelect, onRemove, onCompleteAll }: Props) {
  const [date, setDate] = useState(todayInput());

  const items = useMemo(
    () =>
      plan
        .map((p) => {
          const s = segById.get(p.segmentId);
          return s ? { p, s, points: dirPoints(s, p.direction) } : null;
        })
        .filter((x): x is NonNullable<typeof x> => x !== null),
    [plan, segById],
  );
  const points = items.reduce((a, i) => a + i.points, 0);
  const km = items.reduce((a, i) => a + (i.s.geometry ? i.s.distanceKm : 0), 0);
  const unknownKm = items.some((i) => !i.s.geometry);
  const after = currentPoints + points;

  return (
    <Card title={`Plan (${items.length})`}>
      {items.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Plan jest pusty. W zakładce „Trasy” wybierz odcinek i kliknij „Dodaj do planu”.
        </p>
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-zinc-100 dark:divide-zinc-800">
            {items.map(({ p, s, points: pts }) => (
              <li key={key(p.segmentId, p.direction)} className="flex items-start gap-2 py-2 text-sm">
                <button className="min-w-0 flex-1 text-left" onClick={() => onSelect(s.id)}>
                  <span className="block leading-snug font-medium">{directionLabel(s.name, p.direction)}</span>
                  <span className="text-xs text-zinc-500">
                    {s.regionName || s.groupId}
                    {s.geometry ? ` · ${s.distanceKm} km` : ""}
                  </span>
                </button>
                <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold dark:bg-zinc-800">
                  {pts} pkt
                </span>
                <button
                  onClick={() => onRemove(p.segmentId, p.direction)}
                  title="Usuń z planu"
                  className="shrink-0 px-1 text-zinc-400 hover:text-red-600"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-3 rounded-xl bg-zinc-50 p-3 text-sm dark:bg-zinc-800/60">
            <div className="flex justify-between">
              <span>Punkty z planu</span>
              <strong>{points} pkt</strong>
            </div>
            <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
              <span>Dystans (odcinki z przebiegiem)</span>
              <span>
                {Math.round(km * 10) / 10} km{unknownKm ? "+" : ""}
              </span>
            </div>
            <div className="mt-1 flex justify-between border-t border-zinc-200 pt-1 dark:border-zinc-700">
              <span>Razem po realizacji</span>
              <strong>
                {after} pkt{goal > 0 ? ` / ${goal}` : ""}
              </strong>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={date}
              max={todayInput()}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-lg border border-zinc-300 bg-transparent px-2 py-1 text-sm dark:border-zinc-700"
            />
            <button
              onClick={() =>
                onCompleteAll(
                  items.map((i) => ({ segmentId: i.p.segmentId, direction: i.p.direction })),
                  dateInputToIso(date),
                )
              }
              className="flex-1 rounded-xl bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700"
            >
              Zalicz cały plan
            </button>
          </div>
        </>
      )}
    </Card>
  );
}
