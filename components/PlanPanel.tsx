"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui";
import { dateInputToIso, dirPoints, directionLabel, key, todayInput } from "@/lib/booklet";
import { badgeStatus } from "@/lib/badges";
import type { scoreEntries } from "@/lib/badges";
import type { Direction, PlanItem, SegmentRow } from "@/types/pttk";

interface Props {
  plan: PlanItem[];
  segById: ReadonlyMap<string, SegmentRow>;
  currentPoints: number;
  scored: ReturnType<typeof scoreEntries>;
  goal: number;
  onSelect: (segmentId: string) => void;
  onRemove: (segmentId: string, direction: Direction) => void;
  /** Dodaje/usuwa wpis planu (używane do zmiany kierunku). */
  onToggle: (segmentId: string, direction: Direction) => void;
  planMode: boolean;
  onPlanMode: (on: boolean) => void;
  onCompleteAll: (items: { segmentId: string; direction: Direction }[], completedAtIso: string) => void;
}

export default function PlanPanel({ plan, segById, currentPoints, scored, goal, onSelect, onRemove, onToggle, planMode, onPlanMode, onCompleteAll }: Props) {
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
  const gain = items.reduce((a, i) => a + (i.s.geometry ? i.s.elevationGainM : 0), 0);
  const hours = Math.round(((km / 4 + gain / 400) * 10)) / 10; // ok. 4 km/h + 400 m/h w górę
  const badge = badgeStatus(scored.domestic + points, scored.foreign).current;
  const clear = () => items.forEach((i) => onRemove(i.p.segmentId, i.p.direction));

  return (
    <Card title={`Planer tras (${items.length})`}>
      <label className="mb-3 flex cursor-pointer items-center gap-2 rounded-xl bg-purple-50 p-2.5 text-sm text-purple-900 dark:bg-purple-950/40 dark:text-purple-200">
        <input type="checkbox" checked={planMode} onChange={(e) => onPlanMode(e.target.checked)} />
        <span>
          <strong>Tryb planowania</strong> — klikaj odcinki na mapie, aby dodać lub usunąć je z planu
        </span>
      </label>
      {items.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Plan jest pusty. Włącz tryb planowania i kliknij szlaki na mapie albo dodaj odcinek w zakładce „Trasy”.
        </p>
      ) : (
        <>
          <div className="overflow-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-zinc-100 text-left text-[11px] tracking-wide text-zinc-600 uppercase dark:bg-zinc-800 dark:text-zinc-300">
                <tr>
                  <th className="py-2 pl-2.5 font-semibold">Odcinek</th>
                  <th className="px-2 py-2 text-right font-semibold">Km</th>
                  <th className="px-2 py-2 text-right font-semibold">Pkt</th>
                  <th className="w-14" aria-label="Akcje" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {items.map(({ p, s, points: pts }) => (
                  <tr
                    key={key(p.segmentId, p.direction)}
                    className="odd:bg-white even:bg-zinc-50/60 hover:bg-zinc-100 dark:odd:bg-zinc-900 dark:even:bg-zinc-900/60 dark:hover:bg-zinc-800"
                  >
                    <td className="py-2 pl-2.5 align-top">
                      <button className="text-left" onClick={() => onSelect(s.id)}>
                        <span className="block leading-snug font-medium">{directionLabel(s.name, p.direction)}</span>
                        <span className="text-xs text-zinc-500">{s.regionName || s.groupId}</span>
                      </button>
                    </td>
                    <td className="px-2 py-2 text-right align-top whitespace-nowrap text-zinc-600 tabular-nums dark:text-zinc-400">
                      {s.geometry ? s.distanceKm : "—"}
                    </td>
                    <td className="px-2 py-2 text-right align-top font-semibold tabular-nums">{pts}</td>
                    <td className="py-2 pr-2 text-right align-top whitespace-nowrap">
                      <button
                        onClick={() => {
                          onToggle(p.segmentId, p.direction);
                          onToggle(p.segmentId, p.direction === "forward" ? "backward" : "forward");
                        }}
                        title="Zmień kierunek"
                        className="px-1 text-zinc-500 hover:text-green-700"
                      >
                        ⇄
                      </button>
                      <button
                        onClick={() => onRemove(p.segmentId, p.direction)}
                        title="Usuń z planu"
                        className="px-1 text-zinc-400 hover:text-red-600"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

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
            <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
              <span>Przewyższenie / czas (orient.)</span>
              <span>
                {gain > 0 ? `${Math.round(gain)} m · ` : ""}≈ {hours} h
              </span>
            </div>
            <div className="mt-1 flex justify-between border-t border-zinc-200 pt-1 dark:border-zinc-700">
              <span>Razem po realizacji</span>
              <strong>
                {after} pkt{goal > 0 ? ` / ${goal}` : ""}
              </strong>
            </div>
            {badge && (
              <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                Odznaka po realizacji: {badge.icon} {badge.name}
              </div>
            )}
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
              onClick={clear}
              className="rounded-xl border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
            >
              Wyczyść
            </button>
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
