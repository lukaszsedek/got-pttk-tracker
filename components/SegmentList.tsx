"use client";

import { useMemo, useState } from "react";
import { Card, TrailDot } from "@/components/ui";
import type { SegmentRow } from "@/types/pttk";

interface Props {
  segments: SegmentRow[];
  completedIds: ReadonlySet<string>;
  plannedIds: ReadonlySet<string>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

const PAGE = 80;

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

export default function SegmentList({ segments, completedIds, plannedIds, selectedId, onSelect }: Props) {
  const [q, setQ] = useState("");
  const [region, setRegion] = useState("");
  const [onlyMapped, setOnlyMapped] = useState(true);
  const [status, setStatus] = useState<"all" | "todo" | "done" | "planned">("all");
  const [sort, setSort] = useState<"default" | "points" | "km">("default");
  const [limit, setLimit] = useState(PAGE);

  const regions = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of segments) m.set(s.regionName || s.groupId, (m.get(s.regionName || s.groupId) ?? 0) + 1);
    return [...m].sort((a, b) => a[0].localeCompare(b[0], "pl"));
  }, [segments]);

  const filtered = useMemo(() => {
    const nq = norm(q.trim());
    const list = segments.filter(
      (s) =>
        (!onlyMapped || s.geometry) &&
        (!region || (s.regionName || s.groupId) === region) &&
        (status === "all" ||
          (status === "done" && completedIds.has(s.id)) ||
          (status === "todo" && !completedIds.has(s.id)) ||
          (status === "planned" && plannedIds.has(s.id))) &&
        (!nq || norm(`${s.name} ${s.regionName}`).includes(nq)),
    );
    if (sort === "points") {
      list.sort((a, b) => Math.max(b.gotPointsForward, b.gotPointsBackward) - Math.max(a.gotPointsForward, a.gotPointsBackward));
    } else if (sort === "km") {
      list.sort((a, b) => b.distanceKm - a.distanceKm);
    }
    return list;
  }, [segments, q, region, onlyMapped, status, sort, completedIds, plannedIds]);

  const mapped = segments.filter((s) => s.geometry).length;

  return (
    <Card title={`Odcinki (${filtered.length})`}>
      <p className="mb-2 text-xs text-zinc-500">
        {mapped} z {segments.length} odcinków ma wyznaczony przebieg na mapie.
      </p>
      <div className="mb-3 flex flex-col gap-2">
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setLimit(PAGE);
          }}
          placeholder="Szukaj: np. Nosal, Kasprowy, Boczań…"
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
        />
        <select
          value={region}
          onChange={(e) => {
            setRegion(e.target.value);
            setLimit(PAGE);
          }}
          className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700"
          aria-label="Region (tylko do przeglądania)"
        >
          <option value="">Wszystkie regiony</option>
          {regions.map(([r, n]) => (
            <option key={r} value={r}>
              {r} ({n})
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as typeof status);
              setLimit(PAGE);
            }}
            className="min-w-0 flex-1 rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700"
            aria-label="Status"
          >
            <option value="all">Wszystkie</option>
            <option value="todo">Do zrobienia</option>
            <option value="done">Zaliczone</option>
            <option value="planned">W planie</option>
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
            className="min-w-0 flex-1 rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700"
            aria-label="Sortowanie"
          >
            <option value="default">Sortuj: region</option>
            <option value="points">Sortuj: punkty ↓</option>
            <option value="km">Sortuj: dystans ↓</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
          <input type="checkbox" checked={onlyMapped} onChange={(e) => setOnlyMapped(e.target.checked)} />
          tylko odcinki z przebiegiem na mapie
        </label>
      </div>

      <div className="max-h-[60vh] overflow-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-zinc-100 text-left text-[11px] tracking-wide text-zinc-600 uppercase dark:bg-zinc-800 dark:text-zinc-300">
            <tr>
              <th className="w-7 py-2 pl-2.5" aria-label="Kolor szlaku" />
              <th className="py-2 pr-2 font-semibold">Odcinek</th>
              <th className="px-2 py-2 text-right font-semibold" title="Punkty tam / z powrotem">
                Pkt
              </th>
              <th className="px-2 py-2 text-right font-semibold">Km</th>
              <th className="py-2 pr-2.5 text-center font-semibold" aria-label="Status" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {filtered.slice(0, limit).map((s) => {
              const done = completedIds.has(s.id);
              const active = s.id === selectedId;
              return (
                <tr
                  key={s.id}
                  onClick={() => s.geometry && onSelect(active ? null : s.id)}
                  className={`${s.geometry ? "cursor-pointer" : "opacity-60"} transition-colors ${
                    active
                      ? "bg-amber-50 dark:bg-amber-950/30"
                      : "odd:bg-white even:bg-zinc-50/60 hover:bg-zinc-100 dark:odd:bg-zinc-900 dark:even:bg-zinc-900/60 dark:hover:bg-zinc-800"
                  }`}
                >
                  <td className="py-2 pl-2.5 align-top">
                    <span className="mt-0.5 inline-block">
                      {s.trailColor ? (
                        <TrailDot color={s.trailColor} />
                      ) : (
                        <span className="inline-block h-3 w-3 rounded-full border border-zinc-400" />
                      )}
                    </span>
                  </td>
                  <td className="py-2 pr-2 align-top">
                    <div className="leading-snug font-medium">{s.name}</div>
                    <div className="text-xs text-zinc-500">
                      {s.regionName || s.groupId}
                      {!s.geometry && " · brak przebiegu"}
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right align-top whitespace-nowrap tabular-nums">
                    {s.gotPointsForward}
                    <span className="text-zinc-400"> / </span>
                    {s.gotPointsBackward}
                  </td>
                  <td className="px-2 py-2 text-right align-top whitespace-nowrap text-zinc-600 tabular-nums dark:text-zinc-400">
                    {s.geometry ? s.distanceKm : "—"}
                  </td>
                  <td className="py-2 pr-2.5 text-center align-top">
                    {done ? (
                      <span title="zaliczony" className="font-bold text-green-600">✓</span>
                    ) : plannedIds.has(s.id) ? (
                      <span title="w planie" className="font-bold text-purple-600">●</span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-sm text-zinc-500">
                  Brak odcinków dla wybranych filtrów.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {filtered.length > limit && (
        <button
          onClick={() => setLimit((l) => l + PAGE)}
          className="mt-2 w-full rounded-lg bg-zinc-100 py-2 text-sm font-medium dark:bg-zinc-800"
        >
          Pokaż więcej ({filtered.length - limit})
        </button>
      )}
    </Card>
  );
}
