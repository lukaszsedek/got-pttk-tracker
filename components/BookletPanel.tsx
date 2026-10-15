"use client";

import { useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui";
import { dirPoints, directionLabel, downloadText, formatDate, plural, toCsv } from "@/lib/booklet";
import type { SegmentRow, UserTrailProgress } from "@/types/pttk";

interface Props {
  progress: UserTrailProgress[];
  segById: ReadonlyMap<string, SegmentRow>;
  goal: number;
  onGoalChange: (n: number) => void;
  onSelect: (segmentId: string) => void;
  onUndo: (segmentId: string, direction: "forward" | "backward") => void;
  /** Wywoływane po przywróceniu kopii — odśwież dane. */
  onRestored: () => void;
}

export default function BookletPanel({ progress, segById, goal, onGoalChange, onSelect, onUndo, onRestored }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [restoreMsg, setRestoreMsg] = useState<string | null>(null);
  const restore = async (file: File) => {
    try {
      const res = await fetch("/api/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: await file.text(),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      setRestoreMsg(`Przywrócono: ${j.progressInserted} zaliczeń, ${j.planInserted} w planie (pominięto ${j.skipped}).`);
      onRestored();
    } catch (e) {
      setRestoreMsg(`Błąd: ${(e as Error).message}`);
    }
  };
  const rows = useMemo(
    () =>
      progress
        .map((p) => {
          const s = segById.get(p.segmentId);
          return s ? { p, s, points: dirPoints(s, p.direction) } : null;
        })
        .filter((x): x is NonNullable<typeof x> => x !== null),
    [progress, segById],
  );

  const total = rows.reduce((a, r) => a + r.points, 0);
  const byRegion = useMemo(() => {
    const m = new Map<string, { points: number; n: number }>();
    for (const r of rows) {
      const k = r.s.regionName || r.s.groupId;
      const cur = m.get(k) ?? { points: 0, n: 0 };
      m.set(k, { points: cur.points + r.points, n: cur.n + 1 });
    }
    return [...m].sort((a, b) => b[1].points - a[1].points);
  }, [rows]);

  const pct = goal > 0 ? Math.min(100, (total / goal) * 100) : 0;

  const exportCsv = () => {
    const head = ["Data", "Region", "Odcinek", "Kierunek", "Punkty GOT", "Źródło"];
    const body = [...rows]
      .sort((a, b) => a.p.completedAt.localeCompare(b.p.completedAt))
      .map((r) => [
        formatDate(r.p.completedAt),
        r.s.regionName || r.s.groupId,
        r.s.name,
        directionLabel(r.s.name, r.p.direction),
        r.points,
        r.p.sourceActivityId ? "GPX" : "ręcznie",
      ]);
    downloadText("ksiazeczka-got.csv", toCsv([head, ...body, [], ["", "", "", "Razem", total, ""]]));
  };

  const printBooklet = () => {
    const esc = (v: string | number) => String(v).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
    const body = [...rows]
      .sort((a, b) => a.p.completedAt.localeCompare(b.p.completedAt))
      .map(
        (r, i) =>
          `<tr><td>${i + 1}</td><td>${esc(formatDate(r.p.completedAt))}</td><td>${esc(r.s.regionName || r.s.groupId)}</td><td>${esc(
            directionLabel(r.s.name, r.p.direction),
          )}</td><td class="n">${r.points}</td><td class="stamp"></td></tr>`,
      )
      .join("");
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>Książeczka GOT</title>
<style>body{font:12px system-ui,sans-serif;margin:24px;color:#111}h1{font-size:18px;margin:0 0 4px}
table{border-collapse:collapse;width:100%;margin-top:12px}th,td{border:1px solid #888;padding:5px 7px;text-align:left}
th{background:#eee}.n{text-align:right}.stamp{width:110px}tfoot td{font-weight:700}
@media print{body{margin:10mm}}</style></head><body>
<h1>Książeczka GOT PTTK</h1><div>Wygenerowano: ${new Date().toLocaleDateString("pl-PL")} · wpisów: ${rows.length}</div>
<table><thead><tr><th>Lp.</th><th>Data</th><th>Region</th><th>Odcinek</th><th>Pkt</th><th>Pieczątka</th></tr></thead>
<tbody>${body}</tbody><tfoot><tr><td colspan="4">Razem</td><td class="n">${total}</td><td></td></tr></tfoot></table>
<script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  };

  return (
    <div className="flex flex-col gap-4">
      <Card title="Książeczka GOT">
        <div className="flex items-baseline justify-between">
          <span>
            <strong className="text-3xl">{total}</strong>
            <span className="text-zinc-500"> pkt</span>
          </span>
          <span className="text-xs text-zinc-500">
            {rows.length} {plural(rows.length, "wpis", "wpisy", "wpisów")}
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
          <div className="h-full rounded-full bg-green-600 transition-all" style={{ width: `${pct}%` }} />
        </div>
        <label className="mt-3 flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
          Cel punktowy (np. próg odznaki)
          <input
            type="number"
            min={0}
            value={goal}
            onChange={(e) => onGoalChange(Math.max(0, Number(e.target.value) || 0))}
            className="w-20 rounded-lg border border-zinc-300 bg-transparent px-2 py-1 text-sm dark:border-zinc-700"
          />
        </label>
        <p className="mt-1 text-xs text-zinc-500">
          {goal > total ? `Do celu brakuje ${goal - total} pkt.` : goal > 0 ? "Cel osiągnięty 🎉" : ""}
        </p>
        <button
          onClick={exportCsv}
          disabled={!rows.length}
          className="mt-3 w-full rounded-xl border border-zinc-300 py-2 text-sm font-medium disabled:opacity-40 dark:border-zinc-700"
        >
          Eksportuj do CSV (do przepisania do książeczki)
        </button>
        <button
          onClick={printBooklet}
          disabled={!rows.length}
          className="mt-2 w-full rounded-xl border border-zinc-300 py-2 text-sm font-medium disabled:opacity-40 dark:border-zinc-700"
        >
          Drukuj / zapisz jako PDF
        </button>
        <div className="mt-2 flex gap-2">
          <a
            href="/api/backup"
            download
            className="flex-1 rounded-xl border border-zinc-300 py-2 text-center text-sm font-medium dark:border-zinc-700"
          >
            Pobierz kopię (JSON)
          </a>
          <button
            onClick={() => fileRef.current?.click()}
            className="flex-1 rounded-xl border border-zinc-300 py-2 text-sm font-medium dark:border-zinc-700"
          >
            Przywróć kopię…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void restore(f);
              e.target.value = "";
            }}
          />
        </div>
        {restoreMsg && <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">{restoreMsg}</p>}
      </Card>

      {byRegion.length > 0 && (
        <Card title="Punkty wg regionów">
          <ul className="flex flex-col gap-1.5 text-sm">
            {byRegion.map(([r, v]) => (
              <li key={r} className="flex justify-between gap-2">
                <span className="min-w-0 truncate">{r}</span>
                <span className="shrink-0 font-semibold">
                  {v.points} pkt <span className="font-normal text-zinc-500">({v.n})</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Przebyte trasy">
        {rows.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Brak wpisów. Zaimportuj plik GPX albo zalicz odcinek ręcznie w zakładce „Trasy”.
          </p>
        ) : (
          <div className="overflow-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-zinc-100 text-left text-[11px] tracking-wide text-zinc-600 uppercase dark:bg-zinc-800 dark:text-zinc-300">
                <tr>
                  <th className="py-2 pl-2.5 font-semibold">Data</th>
                  <th className="px-2 py-2 font-semibold">Odcinek</th>
                  <th className="px-2 py-2 text-right font-semibold">Pkt</th>
                  <th className="w-7" aria-label="Usuń" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {rows.map(({ p, s, points }) => (
                  <tr
                    key={`${p.segmentId}-${p.direction}`}
                    className="odd:bg-white even:bg-zinc-50/60 hover:bg-zinc-100 dark:odd:bg-zinc-900 dark:even:bg-zinc-900/60 dark:hover:bg-zinc-800"
                  >
                    <td className="py-2 pl-2.5 align-top text-xs whitespace-nowrap text-zinc-600 tabular-nums dark:text-zinc-400">
                      {formatDate(p.completedAt)}
                    </td>
                    <td className="px-2 py-2 align-top">
                      <button className="text-left" onClick={() => onSelect(s.id)}>
                        <span className="block leading-snug font-medium">{directionLabel(s.name, p.direction)}</span>
                        <span className="text-xs text-zinc-500">
                          {s.regionName || s.groupId}
                          {p.sourceActivityId ? " · GPX" : " · ręcznie"}
                        </span>
                      </button>
                    </td>
                    <td className="px-2 py-2 text-right align-top font-semibold tabular-nums">{points}</td>
                    <td className="py-2 pr-2 text-center align-top">
                      <button
                        onClick={() => onUndo(p.segmentId, p.direction)}
                        title="Usuń wpis"
                        className="text-zinc-400 hover:text-red-600"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-zinc-100 font-semibold dark:bg-zinc-800">
                <tr>
                  <td colSpan={2} className="py-2 pl-2.5">Razem</td>
                  <td className="px-2 py-2 text-right tabular-nums">{total}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
