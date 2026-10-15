"use client";

import { useState } from "react";
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

const DIR_LABEL = { forward: "tam", backward: "z powrotem" } as const;

export default function GpxImport({ segments, completedIds, onConfirm }: Props) {
  const [summary, setSummary] = useState<MatchSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File | undefined) {
    setError(null);
    setSummary(null);
    if (!file) return;
    try {
      const activity = parseGpx(await file.text(), file.name);
      setSummary(matchActivity(activity, segments, completedIds));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const names = new Map(segments.map((s) => [s.id, s.name]));
  const fresh = summary?.matches.filter((m) => !m.alreadyCompleted) ?? [];

  return (
    <section className="flex flex-col gap-3 p-4 text-sm">
      <h2 className="font-semibold">Import GPX</h2>
      <input
        type="file"
        accept=".gpx,application/gpx+xml"
        onChange={(e) => onFile(e.target.files?.[0])}
        className="text-xs"
      />
      {error && <p className="text-red-600">{error}</p>}

      {summary && (
        <div className="flex flex-col gap-2">
          {summary.matches.length === 0 ? (
            <div className="flex flex-col gap-1">
              <p>Nie wykryto żadnych odcinków PTTK w tym śladzie.</p>
              {summary.diagnostics && (
                <p className="text-xs text-gray-500">
                  Ślad: {summary.diagnostics.trackPoints} pkt, {summary.diagnostics.trackLengthKm} km.
                  Pokrycie odcinków (wymagane ≥ 85%):{" "}
                  {summary.diagnostics.coverage
                    .map((c) => `${names.get(c.segmentId) ?? c.segmentId} ${Math.round(c.coverage * 100)}%`)
                    .join("; ")}
                </p>
              )}
            </div>
          ) : (
            <>
              <p className="font-medium">
                Wykryto {summary.newSegments} nowych odcinków. Łącznie:{" "}
                {summary.totalGotPoints} pkt GOT
              </p>
              <ul className="flex flex-col gap-1">
                {summary.matches.map((m) => (
                  <li
                    key={`${m.segmentId}-${m.direction}`}
                    className={m.alreadyCompleted ? "opacity-50" : ""}
                  >
                    {names.get(m.segmentId)} — {DIR_LABEL[m.direction]},{" "}
                    {m.gotPoints} pkt
                    {m.alreadyCompleted && " (już zaliczony)"}
                  </li>
                ))}
              </ul>
              {fresh.length > 0 && (
                <button
                  className="rounded bg-green-600 px-3 py-1.5 text-white"
                  onClick={() => {
                    void onConfirm(
                      fresh.map((m) => ({ segmentId: m.segmentId, direction: m.direction })),
                      summary.activityId,
                    );
                    setSummary(null);
                  }}
                >
                  Zatwierdź i dodaj do książeczki
                </button>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
