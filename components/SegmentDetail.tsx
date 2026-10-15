"use client";

import { useState } from "react";
import { Card } from "@/components/ui";
import { dateInputToIso, directionLabel, formatDate, todayInput, dirPoints, key } from "@/lib/booklet";
import type { Direction, PlanItem, SegmentRow, UserTrailProgress } from "@/types/pttk";

interface Props {
  segment: SegmentRow;
  progress: UserTrailProgress[];
  plan: PlanItem[];
  onComplete: (direction: Direction, completedAtIso: string) => void;
  /** Zalicza oba kierunki naraz (wejście i zejście tą samą trasą). */
  onCompleteBoth: (completedAtIso: string) => void;
  onPlanBoth: () => void;
  onUndo: (direction: Direction) => void;
  onTogglePlan: (direction: Direction) => void;
  onClose: () => void;
  /** Uruchamia ręczne rysowanie przebiegu na mapie. */
  onDraw: () => void;
  /** Usuwa ręcznie narysowany przebieg. */
  onClearDrawn: () => void;
}

const DIRS: Direction[] = ["forward", "backward"];

export default function SegmentDetail({ segment, progress, plan, onComplete, onCompleteBoth, onPlanBoth, onUndo, onTogglePlan, onClose, onDraw, onClearDrawn }: Props) {
  const [date, setDate] = useState(todayInput());
  const done = new Map(progress.filter((p) => p.segmentId === segment.id).map((p) => [key(p.segmentId, p.direction), p]));
  const planned = new Set(plan.map((p) => key(p.segmentId, p.direction)));

  return (
    <Card
      title="Szczegóły odcinka"
      action={
        <button onClick={onClose} className="text-xs text-zinc-500 hover:underline">
          zamknij
        </button>
      }
    >
      <h3 className="leading-snug font-semibold">{segment.name}</h3>
      <p className="mt-0.5 text-xs text-zinc-500">
        {segment.regionName || segment.groupId}
        {segment.trailColor ? ` · szlak ${segment.trailColor}` : segment.unmarked ? " · bez znakowania" : ""}
        {segment.geometry ? ` · ${segment.distanceKm} km` : " · brak przebiegu na mapie"}
      </p>

      {!segment.geometry ? (
        <button
          onClick={onDraw}
          className="mt-3 w-full rounded-xl border border-dashed border-rose-400 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 dark:bg-rose-950/30 dark:text-rose-300"
        >
          ✏️ Wskaż przebieg na mapie
        </button>
      ) : segment.geomStatus === "manual" ? (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:bg-rose-950/30 dark:text-rose-200">
          <span>Przebieg narysowany ręcznie</span>
          <span className="flex gap-3">
            <button onClick={onDraw} className="underline">
              narysuj ponownie
            </button>
            <button onClick={onClearDrawn} className="underline">
              usuń
            </button>
          </span>
        </div>
      ) : null}

      <label className="mt-3 flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
        Data przejścia
        <input
          type="date"
          value={date}
          max={todayInput()}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-zinc-300 bg-transparent px-2 py-1 text-sm dark:border-zinc-700"
        />
      </label>

      {DIRS.some((d) => !done.has(key(segment.id, d))) && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => onCompleteBoth(dateInputToIso(date))}
            className="flex-1 rounded-xl bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700"
          >
            ⇄ Zalicz w obie strony (+{DIRS.filter((d) => !done.has(key(segment.id, d))).reduce((a, d) => a + dirPoints(segment, d), 0)} pkt)
          </button>
          <button
            onClick={onPlanBoth}
            className="rounded-xl border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
          >
            Plan: obie strony
          </button>
        </div>
      )}

      <ul className="mt-3 flex flex-col gap-2">
        {DIRS.map((d) => {
          const k = key(segment.id, d);
          const p = done.get(k);
          return (
            <li key={d} className="rounded-xl border border-zinc-200 p-3 text-sm dark:border-zinc-800">
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium">{directionLabel(segment.name, d)}</span>
                <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold dark:bg-zinc-800">
                  {dirPoints(segment, d)} pkt
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {p ? (
                  <>
                    <span className="text-xs font-medium text-green-700 dark:text-green-400">
                      ✓ zaliczony {formatDate(p.completedAt)}
                    </span>
                    <button
                      onClick={() => onUndo(d)}
                      className="rounded-lg border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700"
                    >
                      cofnij
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => onComplete(d, dateInputToIso(date))}
                      className="rounded-lg bg-green-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-green-700"
                    >
                      Zalicz
                    </button>
                    <button
                      onClick={() => onTogglePlan(d)}
                      className={`rounded-lg border px-2.5 py-1 text-xs ${
                        planned.has(k)
                          ? "border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
                          : "border-zinc-300 dark:border-zinc-700"
                      }`}
                    >
                      {planned.has(k) ? "w planie ✓" : "Dodaj do planu"}
                    </button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
