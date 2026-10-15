"use client";

import { useState } from "react";
import { Card } from "@/components/ui";
import { parseGpx } from "@/lib/gpx/parse-gpx";
import { matchActivity } from "@/lib/gpx/map-match";
import type { Direction, MatchSummary, PttkSegment } from "@/types/pttk";

interface Props {
  segments: PttkSegment[];
  completedIds: ReadonlySet<string>;
  onConfirm: (
    completions: { segmentId: string; direction: Direction }[],
    activityId: string,
  ) => void | Promise<void>;
}

const DIR_LABEL = { forward: "tam →", backward: "← z powrotem" } as const;

export default function GpxImport({ segments, completedIds, onConfirm }: Props) {
  const [summary, setSummary] = useState<MatchSummary | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [accepted, setAccepted] = useState<Set<string>>(new Set());

  async function handle(file: File | undefined) {
    setError(null);
    setSummary(null);
    setAccepted(new Set());
    if (!file) return;
    setFileName(file.name);
    try {
      const activity = parseGpx(await file.text(), file.name);
      setSummary(matchActivity(activity, segments, completedIds));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const names = new Map(segments.map((s) => [s.id, s.name]));
  const key = (m: { segmentId: string; direction: string }) => `${m.segmentId}|${m.direction}`;
  const full = summary?.matches.filter((m) => !m.partial) ?? [];
  const partials = summary?.matches.filter((m) => m.partial && !m.alreadyCompleted) ?? [];
  const fresh = [
    ...full.filter((m) => !m.alreadyCompleted),
    ...partials.filter((m) => accepted.has(key(m))),
  ];
  const extraPoints = partials.filter((m) => accepted.has(key(m))).reduce((s, m) => s + m.gotPoints, 0);

  return (
    <Card title="Import GPX">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handle(e.dataTransfer.files[0]);
        }}
        className={`flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed px-4 py-6 text-center text-sm transition-colors ${
          dragging
            ? "border-green-500 bg-green-50 dark:bg-green-950/40"
            : "border-zinc-300 hover:border-green-500 dark:border-zinc-700"
        }`}
      >
        <span className="text-2xl">📍</span>
        <span className="font-medium">Przeciągnij plik .gpx lub kliknij</span>
        <span className="text-xs text-zinc-500">Garmin, Suunto, mapa-turystyczna.pl…</span>
        <input
          type="file"
          accept=".gpx,application/gpx+xml"
          className="sr-only"
          onChange={(e) => {
            void handle(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>

      {fileName && <p className="mt-2 truncate text-xs text-zinc-500">Plik: {fileName}</p>}
      {error && (
        <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      {summary && summary.matches.length === 0 && (
        <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="font-medium">Nie wykryto żadnych odcinków PTTK.</p>
          {summary.diagnostics && (
            <p className="mt-1 text-xs opacity-80">
              Ślad: {summary.diagnostics.trackPoints} pkt, {summary.diagnostics.trackLengthKm} km.
              Pokrycie (wymagane ≥ 85%):{" "}
              {summary.diagnostics.coverage
                .map((c) => `${names.get(c.segmentId) ?? c.segmentId} ${Math.round(c.coverage * 100)}%`)
                .join("; ")}
            </p>
          )}
        </div>
      )}

      {summary && summary.matches.length > 0 && (
        <div className="mt-3 flex flex-col gap-3">
          <div className="rounded-lg bg-green-50 p-3 text-sm dark:bg-green-950/40">
            <p className="font-semibold text-green-800 dark:text-green-300">
              {summary.newSegments + accepted.size} nowych odcinków ·{" "}
              {summary.totalGotPoints + extraPoints} pkt GOT
            </p>
          </div>
          <ul className="flex flex-col gap-1.5 text-sm">
            {full.map((m) => (
              <li
                key={`${m.segmentId}-${m.direction}`}
                className={`flex items-start justify-between gap-2 ${m.alreadyCompleted ? "opacity-50" : ""}`}
              >
                <span>
                  {names.get(m.segmentId)}
                  <span className="block text-xs text-zinc-500">
                    {DIR_LABEL[m.direction]}
                    {m.alreadyCompleted && " · już zaliczony"}
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold dark:bg-zinc-800">
                  {m.gotPoints} pkt
                </span>
              </li>
            ))}
          </ul>
          {partials.length > 0 && (
            <div className="rounded-lg bg-amber-50 p-3 text-sm dark:bg-amber-950/40">
              <p className="mb-2 font-medium text-amber-800 dark:text-amber-200">
                Częściowe dopasowania — potwierdź, jeśli przeszedłeś cały odcinek
              </p>
              <ul className="flex flex-col gap-1.5">
                {partials.map((m) => (
                  <li key={key(m)}>
                    <label className="flex cursor-pointer items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={accepted.has(key(m))}
                        onChange={(e) =>
                          setAccepted((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(key(m));
                            else next.delete(key(m));
                            return next;
                          })
                        }
                      />
                      <span>
                        {names.get(m.segmentId)} — {DIR_LABEL[m.direction]}
                        <span className="block text-xs text-zinc-500">
                          pokrycie {Math.round(m.coverage * 100)}% · {m.gotPoints} pkt
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {fresh.length > 0 && (
            <button
              className="rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-700"
              onClick={() => {
                void onConfirm(
                  fresh.map((m) => ({ segmentId: m.segmentId, direction: m.direction })),
                  summary.activityId,
                );
                setSummary(null);
                setFileName(null);
              }}
            >
              Zatwierdź i dodaj do książeczki
            </button>
          )}
        </div>
      )}
    </Card>
  );
}
