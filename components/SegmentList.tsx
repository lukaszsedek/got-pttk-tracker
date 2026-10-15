"use client";

import { useMemo, useState } from "react";
import { Card, TrailDot } from "@/components/ui";
import type { SegmentRow } from "@/types/pttk";

interface Props {
  segments: SegmentRow[];
  completedIds: ReadonlySet<string>;
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

export default function SegmentList({ segments, completedIds, selectedId, onSelect }: Props) {
  const [q, setQ] = useState("");
  const [region, setRegion] = useState("");
  const [onlyMapped, setOnlyMapped] = useState(true);
  const [limit, setLimit] = useState(PAGE);

  const regions = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of segments) m.set(s.regionName || s.groupId, (m.get(s.regionName || s.groupId) ?? 0) + 1);
    return [...m].sort((a, b) => a[0].localeCompare(b[0], "pl"));
  }, [segments]);

  const filtered = useMemo(() => {
    const nq = norm(q.trim());
    return segments.filter(
      (s) =>
        (!onlyMapped || s.geometry) &&
        (!region || (s.regionName || s.groupId) === region) &&
        (!nq || norm(`${s.name} ${s.regionName}`).includes(nq)),
    );
  }, [segments, q, region, onlyMapped]);

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
