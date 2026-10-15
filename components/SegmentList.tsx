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
          className="rounded-lg border border-zinc-300 bg-transparent px-3 py-1.5 text-sm dark:border-zinc-700"
        />
        <select
          value={region}
          onChange={(e) => {
            setRegion(e.target.value);
            setLimit(PAGE);
          }}
          className="rounded-lg border border-zinc-300 bg-transparent px-2 py-1.5 text-sm dark:border-zinc-700"
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
            className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-transparent px-2 py-1.5 text-sm dark:border-zinc-700"
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
            className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-transparent px-2 py-1.5 text-sm dark:border-zinc-700"
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

      <ul className="flex flex-col gap-1">
        {filtered.slice(0, limit).map((s) => {
          const done = completedIds.has(s.id);
          const active = s.id === selectedId;
          return (
            <li key={s.id}>
              <button
                onClick={() => onSelect(active ? null : s.id)}
                disabled={!s.geometry}
                className={`flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm transition-colors disabled:cursor-default ${
                  active
                    ? "bg-amber-50 ring-1 ring-amber-400 dark:bg-amber-950/30"
                    : "hover:bg-zinc-100 disabled:hover:bg-transparent dark:hover:bg-zinc-800"
                }`}
              >
                <span className="mt-1">
                  {s.trailColor ? (
                    <TrailDot color={s.trailColor} />
                  ) : (
                    <span className="inline-block h-3 w-3 rounded-full border border-zinc-400" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block leading-snug font-medium">{s.name}</span>
                  <span className="text-xs text-zinc-500">
                    {s.regionName || s.groupId} · {s.gotPointsForward}/{s.gotPointsBackward} pkt
                    {s.geometry ? ` · ${s.distanceKm} km` : " · brak przebiegu na mapie"}
                  </span>
                </span>
                {!done && plannedIds.has(s.id) && (
                  <span className="mt-0.5 shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                    w planie
                  </span>
                )}
                {done && (
                  <span className="mt-0.5 shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800 dark:bg-green-900/50 dark:text-green-300">
                    zaliczony
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
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
