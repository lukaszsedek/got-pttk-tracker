"use client";

import { useMemo, useState } from "react";
import { TrailDot } from "@/components/ui";
import { dateInputToIso, dirPoints, directionLabel, key, todayInput } from "@/lib/booklet";
import type { Direction, SegmentRow, UserTrailProgress } from "@/types/pttk";

interface Props {
  segments: SegmentRow[];
  progress: UserTrailProgress[];
  onSetDate: (segmentId: string, direction: Direction, isoDate: string) => Promise<void> | void;
  onSetDates: (items: { segmentId: string; direction: Direction }[], isoDate: string) => Promise<void> | void;
  onUndo: (segmentId: string, direction: Direction) => void;
  onClose: () => void;
}

const PAGE = 150;
const norm = (s: string) =>
  s.toLowerCase().replace(/ł/g, "l").normalize("NFD").replace(/[̀-ͯ]/g, "");

export default function RouteEditor({ segments, progress, onSetDate, onSetDates, onUndo, onClose }: Props) {
  const [q, setQ] = useState("");
  const [region, setRegion] = useState("");
  const [status, setStatus] = useState<"all" | "done" | "todo">("all");
  const [onlyMapped, setOnlyMapped] = useState(true);
  const [limit, setLimit] = useState(PAGE);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulkDate, setBulkDate] = useState(todayInput());

  const done = useMemo(() => new Map(progress.map((p) => [key(p.segmentId, p.direction), p])), [progress]);
  const regions = useMemo(
    () => [...new Set(segments.map((s) => s.regionName || s.groupId))].sort((a, b) => a.localeCompare(b, "pl")),
    [segments],
  );

  const rows = useMemo(() => {
    const nq = norm(q.trim());
    const out: { s: SegmentRow; d: Direction; k: string }[] = [];
    for (const s of segments) {
      if (onlyMapped && !s.geometry) continue;
      if (region && (s.regionName || s.groupId) !== region) continue;
      if (nq && !norm(`${s.name} ${s.regionName}`).includes(nq)) continue;
      for (const d of ["forward", "backward"] as Direction[]) {
        const k = key(s.id, d);
        const isDone = done.has(k);
        if (status === "done" && !isDone) continue;
        if (status === "todo" && isDone) continue;
        out.push({ s, d, k });
      }
    }
    return out;
  }, [segments, q, region, status, onlyMapped, done]);

  const shown = rows.slice(0, limit);
  const toggle = (k: string) =>
    setPicked((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const pickedRows = rows.filter((r) => picked.has(r.k));
  const allShownPicked = shown.length > 0 && shown.every((r) => picked.has(r.k));

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="flex flex-wrap items-center gap-3 border-b border-zinc-200 bg-white px-5 py-3 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-bold">Edytor tras</h2>
        <span className="text-sm text-zinc-500">
          {rows.length} pozycji · zaliczone: {progress.length}
        </span>
        <button
          onClick={onClose}
          className="ml-auto rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          ← Wróć do mapy
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-white px-5 py-2 dark:border-zinc-800 dark:bg-zinc-900">
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setLimit(PAGE);
          }}
          placeholder="Szukaj odcinka…"
          className="w-64 rounded-lg border px-3 py-1.5 text-sm"
        />
        <select
          value={region}
          onChange={(e) => {
            setRegion(e.target.value);
            setLimit(PAGE);
          }}
          className="rounded-lg border px-2 py-1.5 text-sm"
        >
          <option value="">Wszystkie regiony</option>
          {regions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          className="rounded-lg border px-2 py-1.5 text-sm"
        >
          <option value="all">Wszystkie</option>
          <option value="done">Zaliczone</option>
          <option value="todo">Niezaliczone</option>
        </select>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={onlyMapped} onChange={(e) => setOnlyMapped(e.target.checked)} />
          tylko z przebiegiem
        </label>

        <div className="ml-auto flex items-center gap-2 text-sm">
          <span className="text-zinc-500">Zaznaczone: {pickedRows.length}</span>
          <input
            type="date"
            value={bulkDate}
            max={todayInput()}
            onChange={(e) => setBulkDate(e.target.value)}
            className="rounded-lg border px-2 py-1 text-sm"
          />
          <button
            disabled={!pickedRows.length}
            onClick={async () => {
              await onSetDates(pickedRows.map((r) => ({ segmentId: r.s.id, direction: r.d })), dateInputToIso(bulkDate));
              setPicked(new Set());
            }}
            className="rounded-lg bg-green-600 px-3 py-1.5 font-semibold text-white disabled:opacity-40"
          >
            Ustaw datę zaznaczonym
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-5 py-3">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-zinc-100 text-left text-[11px] tracking-wide text-zinc-600 uppercase dark:bg-zinc-800 dark:text-zinc-300">
            <tr>
              <th className="w-9 py-2.5 pl-3">
                <input
                  type="checkbox"
                  checked={allShownPicked}
                  onChange={() =>
                    setPicked((prev) => {
                      const n = new Set(prev);
                      for (const r of shown) {
                        if (allShownPicked) n.delete(r.k);
                        else n.add(r.k);
                      }
                      return n;
                    })
                  }
                  aria-label="Zaznacz widoczne"
                />
              </th>
              <th className="w-6" />
              <th className="px-2 py-2.5 font-semibold">Region</th>
              <th className="px-2 py-2.5 font-semibold">Odcinek / kierunek</th>
              <th className="px-2 py-2.5 text-right font-semibold">Pkt</th>
              <th className="px-2 py-2.5 text-right font-semibold">Km</th>
              <th className="px-2 py-2.5 font-semibold">Data przejścia</th>
              <th className="px-2 py-2.5 font-semibold">Źródło</th>
              <th className="w-20 py-2.5 pr-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {shown.map(({ s, d, k }) => {
              const p = done.get(k);
              return (
                <tr
                  key={k}
                  className={`${picked.has(k) ? "bg-amber-50 dark:bg-amber-950/20" : "odd:bg-white even:bg-zinc-50/60 dark:odd:bg-zinc-900 dark:even:bg-zinc-900/60"} hover:bg-zinc-100 dark:hover:bg-zinc-800`}
                >
                  <td className="py-2 pl-3">
                    <input type="checkbox" checked={picked.has(k)} onChange={() => toggle(k)} />
                  </td>
                  <td>{s.trailColor ? <TrailDot color={s.trailColor} /> : null}</td>
                  <td className="px-2 py-2 text-zinc-600 dark:text-zinc-400">{s.regionName || s.groupId}</td>
                  <td className="px-2 py-2 font-medium">{directionLabel(s.name, d)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{dirPoints(s, d)}</td>
                  <td className="px-2 py-2 text-right text-zinc-600 tabular-nums dark:text-zinc-400">
                    {s.geometry ? s.distanceKm : "—"}
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="date"
                      max={todayInput()}
                      value={p ? p.completedAt.slice(0, 10) : ""}
                      onChange={(e) => e.target.value && onSetDate(s.id, d, dateInputToIso(e.target.value))}
                      className={`rounded-lg border px-2 py-1 text-sm ${p ? "border-green-500" : ""}`}
                    />
                  </td>
                  <td className="px-2 py-2 text-xs text-zinc-500">
                    {p ? (p.sourceActivityId ? "GPX" : "ręcznie") : ""}
                  </td>
                  <td className="py-2 pr-3 text-right whitespace-nowrap">
                    {p ? (
                      <button onClick={() => onUndo(s.id, d)} className="text-xs text-red-600 hover:underline">
                        usuń
                      </button>
                    ) : (
                      <button
                        onClick={() => onSetDate(s.id, d, dateInputToIso(todayInput()))}
                        className="text-xs font-semibold text-green-700 hover:underline dark:text-green-400"
                      >
                        zalicz dziś
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="py-10 text-center text-zinc-500">
                  Brak pozycji dla wybranych filtrów.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {rows.length > limit && (
          <button
            onClick={() => setLimit((l) => l + PAGE)}
            className="mt-3 w-full rounded-lg bg-zinc-200 py-2 text-sm font-medium dark:bg-zinc-800"
          >
            Pokaż więcej ({rows.length - limit})
          </button>
        )}
      </div>
    </div>
  );
}
