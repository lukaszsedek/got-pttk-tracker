"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import BadgesPanel from "@/components/BadgesPanel";
import BookletPanel from "@/components/BookletPanel";
import GpxImport from "@/components/GpxImport";
import RouteEditor from "@/components/RouteEditor";
import PlanPanel from "@/components/PlanPanel";
import SegmentDetail from "@/components/SegmentDetail";
import SegmentList from "@/components/SegmentList";
import CommandPalette from "@/components/CommandPalette";
import Toasts, { type Toast } from "@/components/Toasts";
import { Card } from "@/components/ui";
import { loadUi, saveUi } from "@/lib/ui-state";
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
  const [ui] = useState(loadUi);
  const [tab, setTab] = useState<Tab>((ui.tab as Tab) ?? "trasy");
  const [open, setOpen] = useState(ui.open ?? true);
  const [goal, setGoal] = useState<number>(readGoal);
  const [showDone, setShowDone] = useState(ui.showDone ?? true);
  const [showTodo, setShowTodo] = useState(ui.showTodo ?? true);
  const [showTrack, setShowTrack] = useState(ui.showTrack ?? true);
  const [minPoints, setMinPoints] = useState(ui.minPoints ?? 0);
  const [regionFilter, setRegionFilter] = useState(ui.region ?? "");
  const [partial, setPartial] = useState<string[]>([]);
  const [planMode, setPlanMode] = useState(false);
  const [editor, setEditor] = useState(false);
  const [palette, setPalette] = useState(false);
  const [drawFor, setDrawFor] = useState<string | null>(null);
  const [drawPts, setDrawPts] = useState<[number, number][]>([]);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);
  const segRef = useRef<ReadonlyMap<string, SegmentRow>>(new globalThis.Map());
  const progressRef = useRef<UserTrailProgress[]>([]);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback(
    (text: string, opts: Omit<Toast, "id" | "text"> = {}) => {
      const id = ++toastId.current;
      setToasts((t) => [...t.slice(-3), { id, text, ...opts }]);
      setTimeout(() => dismiss(id), opts.action ? 9000 : 5000);
    },
    [dismiss],
  );

  const dark = useSyncExternalStore(
    (cb) => {
      const mo = new MutationObserver(cb);
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
      return () => mo.disconnect();
    },
    () => document.documentElement.classList.contains("dark"),
    () => false,
  );
  const toggleDark = () => {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("got.theme", next ? "dark" : "light");
    } catch {
      /* ignoruj */
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement)?.tagName ?? "");
      if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setPalette(true);
      } else if (e.key === "Escape") {
        setPalette(false);
        setEditor(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    saveUi({ tab, open, showDone, showTodo, showTrack, minPoints, region: regionFilter });
  }, [tab, open, showDone, showTodo, showTrack, minPoints, regionFilter]);

  const reload = useCallback(() => {
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

  useEffect(() => {
    reload();
  }, [reload]);

  const fail = useCallback((e: unknown) => toast((e as Error).message, { tone: "error" }), [toast]);

  const changeGoal = (n: number) => {
    setGoal(n);
    try {
      localStorage.setItem("got.goal", String(n));
    } catch {
      /* ignoruj: tryb prywatny */
    }
  };

  const undo = useCallback(
    async (segmentId: string, direction: Direction, silent = false) => {
      const prev = progressRef.current.find((p) => p.segmentId === segmentId && p.direction === direction);
      try {
        await api("/api/progress", send("DELETE", { segmentId, direction }));
        setProgress((list) => list.filter((p) => !(p.segmentId === segmentId && p.direction === direction)));
        if (!silent && prev) {
          toast("Usunięto zaliczenie", {
            action: {
              label: "Przywróć",
              run: () =>
                void api("/api/progress", send("POST", { completions: [{ segmentId, direction, completedAt: prev.completedAt }] }))
                  .then(() => api<{ progress: UserTrailProgress[] }>("/api/progress"))
                  .then((r) => setProgress(r.progress))
                  .catch(fail),
            },
          });
        }
      } catch (e) {
        fail(e);
      }
    },
    [fail, toast],
  );

  const complete = useCallback(
    async (items: Completion[], activityId?: string, silent = false) => {
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
        if (!silent) {
          const pts = items.reduce((a, i) => {
            const s = segRef.current.get(i.segmentId);
            return s ? a + dirPoints(s, i.direction) : a;
          }, 0);
          toast(`Zaliczono ${items.length} ${items.length === 1 ? "kierunek" : "kierunków"} · +${pts} pkt`, {
            action: {
              label: "Cofnij",
              run: () => items.forEach((i) => void undo(i.segmentId, i.direction, true)),
            },
          });
        }
      } catch (e) {
        fail(e);
      }
    },
    [fail, toast, undo],
  );
  /** Ustawia datę przejścia: aktualizuje istniejące zaliczenie albo tworzy nowe. */
  const setDates = useCallback(
    async (items: { segmentId: string; direction: Direction }[], iso: string) => {
      try {
        const have = new Set(progress.map((p) => key(p.segmentId, p.direction)));
        const fresh = items.filter((i) => !have.has(key(i.segmentId, i.direction)));
        const existing = items.filter((i) => have.has(key(i.segmentId, i.direction)));
        if (fresh.length) {
          await api("/api/progress", send("POST", { completions: fresh.map((i) => ({ ...i, completedAt: iso })) }));
        }
        await Promise.all(existing.map((i) => api("/api/progress", send("PATCH", { ...i, completedAt: iso }))));
        const p = await api<{ progress: UserTrailProgress[] }>("/api/progress");
        setProgress(p.progress);
      } catch (e) {
        fail(e);
      }
    },
    [progress, fail],
  );

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
    [plan, fail],
  );

  const segById = useMemo(
    () => new globalThis.Map((segments ?? []).map((s) => [s.id, s])),
    [segments],
  );
  useEffect(() => {
    segRef.current = segById;
  }, [segById]);
  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);
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
    if (id) {
      setTab("trasy");
      setOpen(true);
    }
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
  const doneKeys = useMemo(() => new Set(progress.map((p) => key(p.segmentId, p.direction))), [progress]);
  const planKeys = useMemo(() => new Set(plan.map((p) => key(p.segmentId, p.direction))), [plan]);
  const regions = useMemo(
    () => [...new Set((segments ?? []).filter((s) => s.geometry).map((s) => s.regionName || s.groupId))].sort((a, b) => a.localeCompare(b, "pl")),
    [segments],
  );
  const partialSet = useMemo(() => new Set(partial), [partial]);

  const startDraw = (id: string) => {
    setDrawFor(id);
    setDrawPts([]);
    setOpen(false);
  };
  const saveDrawn = async () => {
    if (!drawFor || drawPts.length < 2) return;
    try {
      const r = await api<{ distanceKm: number }>(`/api/segments/${encodeURIComponent(drawFor)}`, send("PUT", { coordinates: drawPts }));
      toast(`Zapisano przebieg (${r.distanceKm} km)`);
      setDrawFor(null);
      setDrawPts([]);
      reload();
    } catch (e) {
      fail(e);
    }
  };
  const clearDrawn = async (id: string) => {
    try {
      await api(`/api/segments/${encodeURIComponent(id)}`, { method: "DELETE" });
      reload();
    } catch (e) {
      fail(e);
    }
  };
  const drawing = drawFor ? (segById.get(drawFor) ?? null) : null;

  const mapQuick = (id: string, action: "forward" | "backward" | "plan" | "open") => {
    if (action === "forward" || action === "backward") return void complete([{ segmentId: id, direction: action }]);
    if (action === "plan") {
      const existing = plan.filter((p) => p.segmentId === id);
      if (existing.length) return void existing.forEach((p) => void togglePlan(id, p.direction));
      const s = segById.get(id);
      if (s) void togglePlan(id, s.gotPointsForward >= s.gotPointsBackward ? "forward" : "backward");
    }
  };
  const entries = useMemo(
    () =>
      progress.flatMap((p) => {
        const s = segById.get(p.segmentId);
        return s
          ? [{ day: p.completedAt.slice(0, 10), points: dirPoints(s, p.direction), foreign: s.groupId.startsWith("SK-") }]
          : [];
      }),
    [progress, segById],
  );
  const scored = useMemo(() => scoreEntries(entries), [entries]);
  const badge = badgeStatus(scored.domestic, scored.foreign).current;

  const tabs: [Tab, string, string][] = [
    ["trasy", "Trasy", "🗺️"],
    ["ksiazeczka", "Książeczka", "📒"],
    ["plan", "Plan", "🧭"],
    ["odznaki", "Odznaki", "🏅"],
    ["import", "GPX", "📍"],
  ];
  const badgeFor: Partial<Record<Tab, number>> = { ksiazeczka: progress.length, plan: plan.length };

  const panelBody = (
    <>
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
              onDraw={() => startDraw(selected.id)}
              onClearDrawn={() => void clearDrawn(selected.id)}
            />
          )}
          <SegmentList
            segments={segments ?? []}
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
          onRestored={reload}
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
          onCompleteAll={(items, at) => complete(items.map((i) => ({ ...i, completedAt: at })))}
        />
      )}
      {tab === "odznaki" && <BadgesPanel scored={scored} entries={entries} onSetGoal={changeGoal} />}
      {tab === "import" && (
        <Card title="Import z zegarka">
          <GpxImport
            segments={mapped}
            completedIds={completedIds}
            onConfirm={(items, activityId) => complete(items, activityId)}
            onTrack={setTrack}
            onPreview={(ids, part) => {
              setPreview(ids);
              setPartial(part ?? []);
            }}
            embedded
          />
        </Card>
      )}
    </>
  );

  return (
    <div className="flex h-dvh flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="flex items-center gap-2 border-b border-zinc-200 bg-white px-3 py-2 sm:px-5 dark:border-zinc-800 dark:bg-zinc-900">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-green-600 text-lg text-white">⛰</span>
        <h1 className="hidden text-base leading-tight font-bold sm:block">GOT PTTK Tracker</h1>
        <button
          onClick={() => setPalette(true)}
          className="ml-2 flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-left text-sm text-zinc-500 sm:max-w-sm dark:border-zinc-700 dark:bg-zinc-800"
        >
          <span>🔎</span>
          <span className="truncate">Szukaj odcinka…</span>
          <kbd className="ml-auto hidden rounded border border-zinc-300 px-1.5 text-[10px] sm:block dark:border-zinc-600">
            Ctrl K
          </kbd>
        </button>
        {segments && (
          <dl className="ml-auto flex items-center gap-1.5 text-center">
            <Stat label="Punkty" value={String(points)} />
            <span className="hidden sm:block">
              <Stat label="Odznaka" value={badge ? `${badge.icon} ${badge.name}` : "—"} />
            </span>
            <span className="hidden lg:block">
              <Stat label="Zaliczone" value={`${completedIds.size}/${segments.length}`} />
            </span>
          </dl>
        )}
        <button
          onClick={() => setEditor(true)}
          className="shrink-0 rounded-xl bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700"
          title="Edytor tras (pełny ekran)"
        >
          ✎<span className="hidden md:inline"> Edytor</span>
        </button>
        <button
          onClick={toggleDark}
          aria-label="Przełącz motyw"
          title="Przełącz motyw"
          className="shrink-0 rounded-xl border border-zinc-300 px-2.5 py-2 text-sm dark:border-zinc-700"
        >
          {dark ? "☀️" : "🌙"}
        </button>
      </header>

      {error ? (
        <div className="m-5 rounded-2xl bg-red-50 p-5 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          <p className="font-semibold">Błąd: {error}</p>
          <p className="mt-1 text-xs opacity-80">
            Sprawdź, czy baza działa i ma dane: <code>docker compose run --rm tools npm run db:migrate</code> i{" "}
            <code>npm run db:import-got</code>
          </p>
        </div>
      ) : !segments ? (
        <div className="flex min-h-0 flex-1 gap-3 p-3">
          <div className="hidden w-80 flex-col gap-3 md:flex">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-32 animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
            ))}
          </div>
          <div className="flex-1 animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
        </div>
      ) : segments.length === 0 ? (
        <div className="m-5 rounded-2xl border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
          <p className="text-lg font-semibold">Baza odcinków jest pusta</p>
          <p className="mt-2 text-sm text-zinc-500">Zaimportuj dane:</p>
          <pre className="mx-auto mt-3 w-fit rounded-xl bg-zinc-900 px-4 py-3 text-left text-xs text-zinc-100">
            {"docker compose run --rm tools npm run db:migrate\ndocker compose run --rm tools npm run db:import-got"}
          </pre>
        </div>
      ) : (
        <div className="relative flex min-h-0 flex-1 flex-col-reverse md:flex-row">
          {/* Pasek ikon (md: pionowy po lewej, telefon: dolna nawigacja) */}
          <nav className="z-30 flex shrink-0 justify-around border-t border-zinc-200 bg-white md:w-[4.5rem] md:flex-col md:justify-start md:gap-1 md:border-t-0 md:border-r md:py-2 dark:border-zinc-800 dark:bg-zinc-900">
            {tabs.map(([id, label, icon]) => {
              const active = open && tab === id;
              return (
                <button
                  key={id}
                  onClick={() => {
                    if (active) setOpen(false);
                    else {
                      setTab(id);
                      setOpen(true);
                    }
                  }}
                  aria-pressed={active}
                  className={`relative flex flex-1 flex-col items-center gap-0.5 px-2 py-2 text-[11px] font-medium md:flex-none md:py-2.5 ${
                    active
                      ? "text-green-700 dark:text-green-400 md:border-l-2 md:border-green-600"
                      : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                  }`}
                >
                  <span className="text-xl leading-none">{icon}</span>
                  {label}
                  {badgeFor[id] ? (
                    <span className="absolute top-1 right-3 rounded-full bg-green-600 px-1.5 text-[10px] text-white md:right-2">
                      {badgeFor[id]}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>

          <div className="relative flex min-h-0 min-w-0 flex-1">
            {/* Panel: na telefonie wysuwany arkusz nad mapą, na desktopie kolumna */}
            {open && (
              <aside className="absolute inset-x-0 bottom-0 z-20 flex h-[58%] flex-col gap-4 overflow-y-auto rounded-t-2xl border-t border-zinc-200 bg-zinc-50 p-3 shadow-2xl md:static md:h-auto md:w-[26rem] md:shrink-0 md:rounded-none md:border-t-0 md:border-r md:shadow-none dark:border-zinc-800 dark:bg-zinc-950">
                <button
                  onClick={() => setOpen(false)}
                  className="mx-auto h-1.5 w-12 shrink-0 rounded-full bg-zinc-300 md:hidden dark:bg-zinc-700"
                  aria-label="Zwiń panel"
                />
                {panelBody}
              </aside>
            )}
            <main className="relative min-w-0 flex-1">
              <Map
                segments={mapped}
                completedIds={completedIds}
                selectedId={selectedId}
                highlightIds={highlight}
                partialIds={partialSet}
                planIds={planIds}
                doneKeys={doneKeys}
                planKeys={planKeys}
                showDone={showDone}
                showTodo={showTodo}
                showTrack={showTrack}
                minPoints={minPoints}
                regionFilter={regionFilter}
                track={track}
                initialView={ui.view ?? null}
                onViewChange={(v) => saveUi({ view: v })}
                onQuick={mapQuick}
                onSelect={mapSelect}
                drawPoints={drawFor ? drawPts : null}
                onDrawClick={(p) => setDrawPts((prev) => [...prev, p])}
              />
              {drawing && (
                <div className="absolute top-3 left-1/2 z-20 flex w-[min(34rem,calc(100%-1.5rem))] -translate-x-1/2 flex-col gap-2 rounded-xl bg-rose-600 p-3 text-sm text-white shadow-xl">
                  <div>
                    <strong>Rysowanie: {drawing.name}</strong>
                    <div className="text-xs opacity-90">
                      Klikaj punkty wzdłuż szlaku — od początku do końca odcinka. Punktów: {drawPts.length}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setDrawPts((p) => p.slice(0, -1))}
                      disabled={!drawPts.length}
                      className="rounded-lg bg-white/20 px-3 py-1.5 font-medium disabled:opacity-40"
                    >
                      ↶ Cofnij punkt
                    </button>
                    <button
                      onClick={() => setDrawPts([])}
                      disabled={!drawPts.length}
                      className="rounded-lg bg-white/20 px-3 py-1.5 font-medium disabled:opacity-40"
                    >
                      Wyczyść
                    </button>
                    <button
                      onClick={() => void saveDrawn()}
                      disabled={drawPts.length < 2}
                      className="ml-auto rounded-lg bg-white px-3 py-1.5 font-semibold text-rose-700 disabled:opacity-50"
                    >
                      Zapisz przebieg
                    </button>
                    <button
                      onClick={() => {
                        setDrawFor(null);
                        setDrawPts([]);
                      }}
                      className="rounded-lg bg-white/20 px-3 py-1.5 font-medium"
                    >
                      Anuluj
                    </button>
                  </div>
                </div>
              )}
              <Legend
                showDone={showDone}
                showTodo={showTodo}
                showTrack={showTrack}
                onDone={setShowDone}
                onTodo={setShowTodo}
                onTrack={setShowTrack}
                hasTrack={!!track}
                minPoints={minPoints}
                onMinPoints={setMinPoints}
                regions={regions}
                region={regionFilter}
                onRegion={setRegionFilter}
              />
            </main>
          </div>
        </div>
      )}

      {editor && segments && (
        <RouteEditor
          segments={segments}
          progress={progress}
          onSetDate={(id, d, iso) => setDates([{ segmentId: id, direction: d }], iso)}
          onSetDates={setDates}
          onUndo={undo}
          onClose={() => setEditor(false)}
        />
      )}
      {palette && segments && (
        <CommandPalette
          segments={segments}
          completedIds={completedIds}
          onPick={select}
          onClose={() => setPalette(false)}
        />
      )}
      <Toasts items={toasts} onDismiss={dismiss} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-zinc-100 px-2.5 py-1 dark:bg-zinc-800">
      <dt className="text-[9px] tracking-wide text-zinc-500 uppercase">{label}</dt>
      <dd className="text-sm font-bold whitespace-nowrap">{value}</dd>
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
  minPoints: number;
  onMinPoints: (n: number) => void;
  regions: string[];
  region: string;
  onRegion: (r: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const row = (checked: boolean, on: (v: boolean) => void, swatch: string, label: string) => (
    <label className="flex cursor-pointer items-center gap-2">
      <input type="checkbox" checked={checked} onChange={(e) => on(e.target.checked)} />
      <span className={`h-1.5 w-6 rounded-full ${swatch}`} />
      {label}
    </label>
  );
  return (
    <div className="absolute top-3 left-3 z-10 flex max-w-[15rem] flex-col gap-1.5 rounded-xl bg-white/95 px-3 py-2 text-xs text-zinc-900 shadow-md backdrop-blur dark:bg-zinc-900/95 dark:text-zinc-100">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex items-center justify-between text-[10px] font-bold tracking-wide text-zinc-500 uppercase"
      >
        Warstwy i filtry <span>{collapsed ? "▾" : "▴"}</span>
      </button>
      {!collapsed && (
        <>
          {row(props.showDone, props.onDone, "bg-green-500", "Przebyte")}
          {row(props.showTodo, props.onTodo, "bg-gradient-to-r from-red-600 via-blue-600 to-green-600", "Nieprzebyte")}
          {props.hasTrack && row(props.showTrack, props.onTrack, "bg-sky-500", "Ślad GPX")}
          <span className="flex items-center gap-2 pl-6">
            <span className="h-1.5 w-6 rounded-full bg-purple-600" /> w planie
          </span>
          <label className="mt-1 flex items-center justify-between gap-2">
            Min. punktów
            <select
              value={props.minPoints}
              onChange={(e) => props.onMinPoints(Number(e.target.value))}
              className="rounded-md border px-1.5 py-0.5"
            >
              {[0, 2, 3, 5, 8, 10].map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? "wszystkie" : `≥ ${n}`}
                </option>
              ))}
            </select>
          </label>
          <select
            value={props.region}
            onChange={(e) => props.onRegion(e.target.value)}
            className="w-full rounded-md border px-1.5 py-0.5"
            aria-label="Region"
          >
            <option value="">Wszystkie regiony</option>
            {props.regions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </>
      )}
    </div>
  );
}
