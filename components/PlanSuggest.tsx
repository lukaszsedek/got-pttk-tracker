"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui";
import { MAX_PER_DAY } from "@/lib/badges";
import { dirPoints, directionLabel, key } from "@/lib/booklet";
import type { Direction, SegmentRow } from "@/types/pttk";

interface Props {
  segments: SegmentRow[];
  doneKeys: ReadonlySet<string>;
  planKeys: ReadonlySet<string>;
  /** Ile punktów brakuje do następnej odznaki (domyślny cel). */
  missing: number;
  onAdd: (items: { segmentId: string; direction: Direction }[]) => void;
}

interface Pick {
  s: SegmentRow;
  d: Direction;
  pts: number;
}

export default function PlanSuggest({ segments, doneKeys, planKeys, missing, onAdd }: Props) {
  const [region, setRegion] = useState("");
  const [target, setTarget] = useState(Math.max(10, missing || 30));
  const [result, setResult] = useState<Pick[][] | null>(null);

  const regions = useMemo(
    () =>
      [...new Set(segments.filter((s) => s.geometry).map((s) => s.regionName || s.groupId))].sort((a, b) =>
        a.localeCompare(b, "pl"),
      ),
    [segments],
  );

  const suggest = () => {
    // Najlepszy stosunek punktów do kilometrów, tylko niezaliczone i nieplanowane kierunki.
    const cands: (Pick & { ratio: number })[] = [];
    for (const s of segments) {
      if (!s.geometry || s.distanceKm <= 0) continue;
      if (region && (s.regionName || s.groupId) !== region) continue;
      for (const d of ["forward", "backward"] as Direction[]) {
        const k = key(s.id, d);
        const pts = dirPoints(s, d);
        if (pts <= 0 || doneKeys.has(k) || planKeys.has(k)) continue;
        cands.push({ s, d, pts, ratio: pts / Math.max(0.5, s.distanceKm) });
      }
    }
    cands.sort((a, b) => b.ratio - a.ratio || b.pts - a.pts);
    const chosen: Pick[] = [];
    const usedSeg = new Set<string>();
    let sum = 0;
    for (const c of cands) {
      if (sum >= target || chosen.length >= 40) break;
      if (usedSeg.has(c.s.id)) continue; // nie proponuj obu kierunków tego samego odcinka
      chosen.push(c);
      usedSeg.add(c.s.id);
      sum += c.pts;
    }
    // Podział na dni: pierwsze dopasowanie, limit punktów dziennych.
    const days: Pick[][] = [];
    for (const c of chosen) {
      const day = days.find((d) => d.reduce((a, x) => a + x.pts, 0) + c.pts <= MAX_PER_DAY);
      if (day) day.push(c);
      else days.push([c]);
    }
    setResult(days);
  };

  const total = result?.flat().reduce((a, p) => a + p.pts, 0) ?? 0;
  const km = result?.flat().reduce((a, p) => a + p.s.distanceKm, 0) ?? 0;

  return (
    <Card title="Zaproponuj plan">
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">Punkty do zdobycia</span>
          <input
            type="number"
            min={1}
            value={target}
            onChange={(e) => setTarget(Math.max(1, Number(e.target.value) || 1))}
            className="w-24 rounded-lg border px-2 py-1"
          />
        </label>
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-xs text-zinc-500">Region</span>
          <select value={region} onChange={(e) => setRegion(e.target.value)} className="rounded-lg border px-2 py-1">
            <option value="">Wszystkie</option>
            {regions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <button onClick={suggest} className="rounded-xl bg-green-600 px-4 py-2 font-semibold text-white">
          Zaproponuj
        </button>
      </div>
      {missing > 0 && (
        <button onClick={() => setTarget(missing)} className="mt-2 text-xs text-green-700 underline dark:text-green-400">
          Ustaw cel na brakujące {missing} pkt do następnej odznaki
        </button>
      )}

      {result && (
        <div className="mt-3">
          {result.length === 0 ? (
            <p className="text-sm text-zinc-500">Brak niezaliczonych odcinków dla tych kryteriów.</p>
          ) : (
            <>
              <p className="text-sm">
                <strong>{total} pkt</strong> w {result.length} {result.length === 1 ? "dniu" : "dniach"} · ok.{" "}
                {Math.round(km)} km
              </p>
              {result.map((day, i) => (
                <div key={i} className="mt-2 rounded-xl border border-zinc-200 p-2 dark:border-zinc-800">
                  <div className="mb-1 flex justify-between text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                    <span>Dzień {i + 1}</span>
                    <span>{day.reduce((a, p) => a + p.pts, 0)} pkt</span>
                  </div>
                  <ul className="text-sm">
                    {day.map((p) => (
                      <li key={key(p.s.id, p.d)} className="flex justify-between gap-2 py-0.5">
                        <span className="min-w-0 truncate">{directionLabel(p.s.name, p.d)}</span>
                        <span className="shrink-0 text-zinc-500 tabular-nums">
                          {p.pts} pkt · {p.s.distanceKm} km
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <button
                onClick={() => {
                  onAdd(result.flat().map((p) => ({ segmentId: p.s.id, direction: p.d })));
                  setResult(null);
                }}
                className="mt-3 w-full rounded-xl bg-green-600 py-2 text-sm font-semibold text-white"
              >
                Dodaj wszystko do planu
              </button>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
