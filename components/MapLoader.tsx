"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import GpxImport from "@/components/GpxImport";
import SegmentList from "@/components/SegmentList";
import { Card } from "@/components/ui";
import type { Direction, PttkSegment, UserTrailProgress } from "@/types/pttk";

// MapLibre wymaga `window` — wyłączamy SSR.
const Map = dynamic(() => import("@/components/Map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-zinc-500">
      Ładowanie mapy…
    </div>
  ),
});

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json as T;
}

type Done = { segmentId: string; direction: Direction };

export default function MapLoader() {
  const [segments, setSegments] = useState<PttkSegment[] | null>(null);
  const [done, setDone] = useState<Done[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<{ id: string; segments: number }[]>([]);
  const [group, setGroup] = useState("T.01");

  // Lista grup i postęp — raz.
  useEffect(() => {
    Promise.all([
      getJson<{ groups: { id: string; segments: number }[] }>("/api/groups"),
      getJson<{ progress: UserTrailProgress[] }>("/api/progress"),
    ])
      .then(([g, p]) => {
        setGroups(g.groups);
        if (g.groups.length && !g.groups.some((x) => x.id === "T.01")) setGroup(g.groups[0].id);
        setDone(p.progress.map((x) => ({ segmentId: x.segmentId, direction: x.direction })));
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  // Odcinki wybranej grupy.
  useEffect(() => {
    getJson<{ segments: PttkSegment[] }>(`/api/segments?group=${encodeURIComponent(group)}`)
      .then((s) => setSegments(s.segments))
      .catch((e: Error) => setError(e.message));
  }, [group]);

  const completedIds = useMemo(() => new Set(done.map((d) => d.segmentId)), [done]);

  const confirm = useCallback(
    async (completions: Done[], activityId: string) => {
      try {
        await getJson("/api/progress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ activityId, completions }),
        });
        setDone((prev) => [...prev, ...completions]);
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [],
  );

  const stats = useMemo(() => {
    if (!segments) return null;
    const byId = new globalThis.Map(segments.map((s) => [s.id, s]));
    const points = done.reduce((sum, d) => {
      const s = byId.get(d.segmentId);
      if (!s) return sum;
      return sum + (d.direction === "forward" ? s.gotPointsForward : s.gotPointsBackward);
    }, 0);
    const km = segments.filter((s) => completedIds.has(s.id)).reduce((a, s) => a + s.distanceKm, 0);
    return { points, km: Math.round(km * 10) / 10 };
  }, [segments, done, completedIds]);

  return (
    <div className="flex h-dvh flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 bg-white px-5 py-3 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-green-600 text-xl text-white">
            ⛰
          </span>
          <div>
            <h1 className="text-lg leading-tight font-bold">GOT PTTK Tracker</h1>
            <p className="text-xs text-zinc-500">Grupa {group}</p>
          </div>
          {groups.length > 1 && (
            <select
              value={group}
              onChange={(e) => {
                setSelectedId(null);
                setGroup(e.target.value);
              }}
              className="ml-2 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              aria-label="Grupa GOT"
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.id} ({g.segments})
                </option>
              ))}
            </select>
          )}
        </div>
        {stats && segments && (
          <dl className="flex gap-2 text-center">
            <Stat label="Odcinki" value={`${completedIds.size}/${segments.length}`} />
            <Stat label="Punkty GOT" value={String(stats.points)} />
            <Stat label="Dystans" value={`${stats.km} km`} />
          </dl>
        )}
      </header>

      {error ? (
        <div className="m-5 rounded-2xl bg-red-50 p-5 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          <p className="font-semibold">Błąd: {error}</p>
          <p className="mt-1 text-xs opacity-80">
            Sprawdź, czy baza działa i ma dane: <code>docker compose run --rm tools npm run db:seed</code>
          </p>
        </div>
      ) : !segments ? (
        <div className="p-6 text-sm text-zinc-500">Wczytywanie danych…</div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 md:flex-row md:overflow-hidden">
          <main className="relative order-1 h-[55vh] shrink-0 overflow-hidden rounded-2xl border border-zinc-200 shadow-sm md:order-2 md:h-auto md:min-w-0 md:flex-1 dark:border-zinc-800">
            <Map segments={segments} completedIds={completedIds} selectedId={selectedId} />
            <Legend />
          </main>
          <aside className="order-2 flex shrink-0 flex-col gap-4 md:order-1 md:w-96 md:overflow-y-auto md:pr-1">
            {stats && segments && (
              <Card title="Postęp">
                <div className="mb-2 flex items-baseline justify-between text-sm">
                  <span>
                    <strong className="text-2xl">{completedIds.size}</strong>
                    <span className="text-zinc-500"> / {segments.length} odcinków</span>
                  </span>
                  <span className="font-semibold text-green-700 dark:text-green-400">
                    {stats.points} pkt
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-green-600 transition-all"
                    style={{
                      width: `${segments.length ? (completedIds.size / segments.length) * 100 : 0}%`,
                    }}
                  />
                </div>
              </Card>
            )}
            <GpxImport segments={segments} completedIds={completedIds} onConfirm={confirm} />
            <SegmentList
              segments={segments}
              completedIds={completedIds}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </aside>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-zinc-100 px-3 py-1.5 dark:bg-zinc-800">
      <dt className="text-[10px] tracking-wide text-zinc-500 uppercase">{label}</dt>
      <dd className="text-sm font-bold">{value}</dd>
    </div>
  );
}

function Legend() {
  return (
    <div className="pointer-events-none absolute bottom-4 left-4 flex flex-col gap-1.5 rounded-xl bg-white/90 px-3 py-2 text-xs shadow-md backdrop-blur dark:bg-zinc-900/90">
      <span className="flex items-center gap-2">
        <span className="h-1.5 w-6 rounded-full bg-green-600" /> zaliczony
      </span>
      <span className="flex items-center gap-2">
        <span className="h-1.5 w-6 rounded-full bg-zinc-500/60" /> do zrobienia
      </span>
      <span className="flex items-center gap-2">
        <span className="h-1.5 w-6 rounded-full bg-amber-500" /> wybrany
      </span>
    </div>
  );
}
