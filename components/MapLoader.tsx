"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import GpxImport from "@/components/GpxImport";
import type { PttkSegment, UserTrailProgress } from "@/types/pttk";

// MapLibre wymaga `window` — wyłączamy SSR.
const Map = dynamic(() => import("@/components/Map"), {
  ssr: false,
  loading: () => <div className="p-4 text-sm">Ładowanie mapy…</div>,
});

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json as T;
}

export default function MapLoader() {
  const [segments, setSegments] = useState<PttkSegment[] | null>(null);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      getJson<{ segments: PttkSegment[] }>("/api/segments?group=T.01"),
      getJson<{ progress: UserTrailProgress[] }>("/api/progress"),
    ])
      .then(([s, p]) => {
        setSegments(s.segments);
        setCompleted(new Set(p.progress.map((x) => x.segmentId)));
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const confirm = useCallback<React.ComponentProps<typeof GpxImport>["onConfirm"]>(
    async (completions, activityId) => {
      try {
        await getJson("/api/progress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ activityId, completions }),
        });
        setCompleted((prev) => new Set([...prev, ...completions.map((c) => c.segmentId)]));
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [],
  );

  if (error) {
    return (
      <div className="p-4 text-sm text-red-600">
        Błąd: {error}
        <p className="mt-2 text-xs text-gray-500">
          Sprawdź, czy baza działa: npm run db:up, db:migrate, db:seed (patrz README).
        </p>
      </div>
    );
  }
  if (!segments) return <div className="p-4 text-sm">Wczytywanie danych…</div>;

  return (
    <div className="flex h-full flex-col md:flex-row">
      <aside className="shrink-0 overflow-y-auto border-b md:w-80 md:border-r md:border-b-0">
        <GpxImport segments={segments} completedIds={completed} onConfirm={confirm} />
      </aside>
      <div className="min-h-0 flex-1">
        <Map segments={segments} completedIds={completed} />
      </div>
    </div>
  );
}
