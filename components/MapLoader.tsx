"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import BadgesPanel from "@/components/BadgesPanel";
import BookletPanel from "@/components/BookletPanel";
import GpxImport from "@/components/GpxImport";
import PlanPanel from "@/components/PlanPanel";
import SegmentDetail from "@/components/SegmentDetail";
import SegmentList from "@/components/SegmentList";
import { Card } from "@/components/ui";
import type { MapSegment } from "@/components/Map";
import { badgeStatus, scoreEntries } from "@/lib/badges";
import { dirPoints, key } from "@/lib/booklet";
import type { Direction, PlanItem, SegmentRow, UserTrailProgress } from "@/types/pttk";

// MapLibre wymaga `window` — wyłączamy SSR.
const Map = dynamic(() => import("@/components/Map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-zinc-500">Ładowanie mapy…</div>
  ),
});

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json as T;
}
const send = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

type Tab = "trasy" | "ksiazeczka" | "plan" | "odznaki" | "import";
type Completion = { segmentId: string; direction: Direction; completedAt?: string };

function readGoal(): number {
  try {
    const v = Number(localStorage.getItem("got.goal"));
    return Number.isFinite(v) && v > 0 ? v : 30;
  } catch {
    return 30;
  }
}

export default function MapLoader() {
  const [segments, setSegments] = useState<SegmentRow[] | null>(null);
  const [progress, setProgress] = useState<UserTrailProgress[]>([]);
  const [plan, setPlan] = useState<PlanItem[]>([]);
  const [track, setTrack] = useState<[number, number][] | null>(null);
  const [preview, setPreview] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("trasy");
  const [goal, setGoal] = useState<number>(readGoal);
  const [showDone, setShowDone] = useState(true);
  const [showTodo, setShowTodo] = useState(true);
  const [showTrack, setShowTrack] = useState(true);
  const [planMode, setPlanMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api<{ segments: SegmentRow[] }>("/api/segments"),
      api<{ progress: UserTrailProgress[] }>("/api/progress"),
      api<{ plan: PlanItem[] }>("/api/plan"),
    ])
      .then(([s, p, pl]) => {
        setSegments(s.segments);
        setProgress(p.progress);
        setPlan(pl.plan);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const fail = (e: unknown) => setNotice((e as Error).message);

  const changeGoal = (n: number) => {
    setGoal(n);
    try {
      localStorage.setItem("got.goal", String(n));
    } catch {
      /* ignoruj: tryb prywatny */
    }
  };

  const complete = useCallback(async (items: Completion[], activityId?: string) => {
    try {
      await api("/api/progress", send("POST", { activityId, completions: items }));
      const p = await api<{ progress: UserTrailProgress[] }>("/api/progress");
      setProgress(p.progress);
      // Zaliczone odcinki znikają z planu.
      const done = new Set(items.map((i) => key(i.segmentId, i.direction)));
      setPlan((prev) => prev.filter((x) => !done.has(key(x.segmentId, x.direction))));
      await Promise.all(
        items.map((i) => api("/api/plan", send("DELETE", { segmentId: i.segmentId, direction: i.direction }))),
      );
    } catch (e) {
      fail(e);
    }
  }, []);

  const undo = useCallback(async (segmentId: string, direction: Direction) => {
    try {
      await api("/api/progress", send("DELETE", { segmentId, direction }));
      setProgress((prev) => prev.filter((p) => !(p.segmentId === segmentId && p.direction === direction)));
    } catch (e) {
      fail(e);
    }
  }, []);

  const togglePlan = useCallback(
    async (segmentId: string, direction: Direction) => {
      const exists = plan.some((p) => p.segmentId === segmentId && p.direction === direction);
      try {
        await api("/api/plan", send(exists ? "DELETE" : "POST", { segmentId, direction }));
        setPlan((prev) =>
          exists
            ? prev.filter((p) => !(p.segmentId === segmentId && p.direction === direction))
            : [...prev, { segmentId, direction, addedAt: new Date().toISOString() }],
        );
      } catch (e) {
        fail(e);
      }
    },
    [plan],
  );

  const segById = useMemo(
    () => new globalThis.Map((segments ?? []).map((s) => [s.id, s])),
    [segments],
  );
  const completedIds = useMemo(() => new Set(progress.map((p) => p.segmentId)), [progress]);
  const plannedIds = useMemo(() => new Set(plan.map((p) => p.segmentId)), [plan]);
  const mapped = useMemo(
    () => (segments ?? []).filter((s): s is MapSegment => s.geometry !== null),
    [segments],
  );
  const highlight = useMemo(() => new Set(preview), [preview]);

  const points = useMemo(
    () =>
      progress.reduce((sum, p) => {
        const s = segById.get(p.segmentId);
        return s ? sum + dirPoints(s, p.direction) : sum;
      }, 0),
    [progress, segById],
  );
  const selected = selectedId ? (segById.get(selectedId) ?? null) : null;

  const select = (id: string | null) => {
    setSelectedId(id);
    if (id) setTab("trasy");
  };

  // W trybie planowania klik na mapie dodaje/usuwa odcinek z planu
  // (kierunek z większą liczbą punktów, o ile nie jest już zaliczony).
  const mapSelect = (id: string) => {
    if (!(planMode && tab === "plan")) return select(id);
    const s = segById.get(id);
    if (!s) return;
    const existing = plan.find((p) => p.segmentId === id);
    if (existing) return void togglePlan(id, existing.direction);
    const done = new Set(progress.filter((p) => p.segmentId === id).map((p) => p.direction));
    const order: Direction[] =
      s.gotPointsForward >= s.gotPointsBackward ? ["forward", "backward"] : ["backward", "forward"];
    void togglePlan(id, order.find((d) => !done.has(d)) ?? order[0]);
  };
  const planIds = plannedIds;
  const scored = useMemo(
    () =>
      scoreEntries(
        progress.flatMap((p) => {
          const s = segById.get(p.segmentId);
          return s
            ? [{ day: p.completedAt.slice(0, 10), points: dirPoints(s, p.direction), foreign: s.groupId.startsWith("SK-") }]
            : [];
        }),
      ),
    [progress, segById],
  );
  const badge = badgeStatus(scored.domestic, scored.foreign).current;

  const tabs: [Tab, string][] = [
    ["trasy", "Trasy"],
    ["ksiazeczka", `Książeczka (${progress.length})`],
    ["plan", `Plan (${plan.length})`],
    ["odznaki", "Odznaki"],
    ["import", "Import GPX"],
  ];

  return (
    <div className="flex h-dvh flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 bg-white px-5 py-3 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-green-600 text-xl text-white">⛰</span>
          <div>
            <h1 className="text-lg leading-tight font-bold">GOT PTTK Tracker</h1>
            <p className="text-xs text-zinc-500">Planuj, przeglądaj i uzupełniaj książeczkę GOT</p>
          </div>
        </div>
        {segments && (
          <dl className="flex gap-2 text-center">
            <Stat label="Punkty GOT" value={String(points)} />
            <Stat label="Odznaka" value={badge ? `${badge.icon} ${badge.name}` : "—"} />
            <Stat label="Zaliczone odcinki" value={`${completedIds.size}/${segments.length}`} />
            <Stat label="W planie" value={String(plan.length)} />
          </dl>
        )}
      </header>

      {notice && (
        <div className="flex items-center justify-between bg-red-50 px-5 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="text-xs underline">
            zamknij
          </button>
        </div>
      )}

      {error ? (
        <div className="m-5 rounded-2xl bg-red-50 p-5 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          <p className="font-semibold">Błąd: {error}</p>
          <p className="mt-1 text-xs opacity-80">
            Sprawdź, czy baza działa i ma dane: <code>docker compose run --rm tools npm run db:migrate</code> i{" "}
            <code>npm run db:import-got</code>
          </p>
        </div>
      ) : !segments ? (
        <div className="p-6 text-sm text-zinc-500">Wczytywanie danych…</div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 md:flex-row md:overflow-hidden">
          <main className="relative order-1 h-[55vh] shrink-0 overflow-hidden rounded-2xl border border-zinc-200 shadow-sm md:order-2 md:h-auto md:min-w-0 md:flex-1 dark:border-zinc-800">
            <Map
              segments={mapped}
              completedIds={completedIds}
              selectedId={selectedId}
              highlightIds={highlight}
              planIds={planIds}
              showDone={showDone}
              showTodo={showTodo}
              showTrack={showTrack}
              track={track}
              onSelect={mapSelect}
            />
            <Legend
              showDone={showDone}
              showTodo={showTodo}
              showTrack={showTrack}
              onDone={setShowDone}
              onTodo={setShowTodo}
              onTrack={setShowTrack}
              hasTrack={!!track}
            />
          </main>

          <aside className="order-2 flex shrink-0 flex-col gap-4 md:order-1 md:w-[26rem] md:overflow-y-auto md:pr-1">
            <nav className="grid grid-cols-3 gap-1 rounded-xl bg-zinc-200/70 p-1 text-sm font-medium dark:bg-zinc-800">
              {tabs.map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`rounded-lg px-2 py-1.5 transition-colors ${
                    tab === id
                      ? "bg-white shadow-sm dark:bg-zinc-900"
                      : "text-zinc-600 hover:bg-white/60 dark:text-zinc-400 dark:hover:bg-zinc-700/60"
                  }`}
                >
                  {label}
                </button>
              ))}
            </nav>

            {tab === "trasy" && (
              <>
                {selected && (
                  <SegmentDetail
                    segment={selected}
                    progress={progress}
                    plan={plan}
                    onComplete={(d, at) => complete([{ segmentId: selected.id, direction: d, completedAt: at }])}
                    onCompleteBoth={(at) =>
                      complete(
                        (["forward", "backward"] as Direction[])
                          .filter((d) => !progress.some((p) => p.segmentId === selected.id && p.direction === d))
                          .map((d) => ({ segmentId: selected.id, direction: d, completedAt: at })),
                      )
                    }
                    onPlanBoth={() =>
                      (["forward", "backward"] as Direction[])
                        .filter((d) => !plan.some((p) => p.segmentId === selected.id && p.direction === d))
                        .forEach((d) => void togglePlan(selected.id, d))
                    }
                    onUndo={(d) => undo(selected.id, d)}
                    onTogglePlan={(d) => togglePlan(selected.id, d)}
                    onClose={() => setSelectedId(null)}
                  />
                )}
                <SegmentList
                  segments={segments}
                  completedIds={completedIds}
                  plannedIds={plannedIds}
                  selectedId={selectedId}
                  onSelect={select}
                />
              </>
            )}

            {tab === "ksiazeczka" && (
              <BookletPanel
                progress={progress}
                segById={segById}
                goal={goal}
                onGoalChange={changeGoal}
                onSelect={select}
                onUndo={undo}
              />
            )}

            {tab === "plan" && (
              <PlanPanel
                plan={plan}
                segById={segById}
                currentPoints={points}
                scored={scored}
                goal={goal}
                onSelect={select}
                onRemove={togglePlan}
                onToggle={togglePlan}
                planMode={planMode}
                onPlanMode={setPlanMode}
                onCompleteAll={(items, at) =>
                  complete(items.map((i) => ({ ...i, completedAt: at })))
                }
              />
            )}

            {tab === "odznaki" && (
              <BadgesPanel scored={scored} onSetGoal={changeGoal} />
            )}

            {tab === "import" && (
              <Card title="Import z zegarka">
                <GpxImport
                  segments={mapped}
                  completedIds={completedIds}
                  onConfirm={(items, activityId) => complete(items, activityId)}
                  onTrack={setTrack}
                  onPreview={setPreview}
                  embedded
                />
              </Card>
            )}
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

function Legend(props: {
  showDone: boolean;
  showTodo: boolean;
  showTrack: boolean;
  hasTrack: boolean;
  onDone: (v: boolean) => void;
  onTodo: (v: boolean) => void;
  onTrack: (v: boolean) => void;
}) {
  const row = (checked: boolean, on: (v: boolean) => void, swatch: string, label: string) => (
    <label className="flex cursor-pointer items-center gap-2">
      <input type="checkbox" checked={checked} onChange={(e) => on(e.target.checked)} />
      <span className={`h-1.5 w-6 rounded-full ${swatch}`} />
      {label}
    </label>
  );
  return (
    <div className="absolute bottom-4 left-4 flex flex-col gap-1.5 rounded-xl bg-white/95 px-3 py-2 text-xs text-zinc-900 shadow-md backdrop-blur dark:bg-zinc-900/95 dark:text-zinc-100">
      <strong className="text-[10px] tracking-wide text-zinc-500 uppercase">Warstwy</strong>
      {row(props.showDone, props.onDone, "bg-green-500", "Przebyte")}
      {row(props.showTodo, props.onTodo, "bg-gradient-to-r from-red-600 via-blue-600 to-green-600", "Nieprzebyte")}
      {props.hasTrack && row(props.showTrack, props.onTrack, "bg-sky-500", "Ślad GPX")}
      <span className="flex items-center gap-2 pl-6">
        <span className="h-1.5 w-6 rounded-full bg-purple-600" /> w planie
      </span>
    </div>
  );
}
