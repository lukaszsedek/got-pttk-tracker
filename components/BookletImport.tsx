"use client";

import { useMemo, useState } from "react";
import { directionLabel, todayInput } from "@/lib/booklet";
import { matchLine, parseBookletText, prepareSegments, type Candidate } from "@/lib/booklet-import";
import type { Direction, SegmentRow } from "@/types/pttk";

interface Props {
  segments: SegmentRow[];
  onImport: (items: { segmentId: string; direction: Direction; completedAt: string; verifiedYear?: number }[]) => Promise<void> | void;
  onClose: () => void;
}

interface Row {
  id: number;
  raw: string;
  date?: string;
  cands: Candidate[];
  /** Indeks wybranego kandydata, -1 = pomiń. */
  pick: number;
  direction: Direction;
}

const EXAMPLE = `12.06.2021; Murowanica – Nosal; 4
2021-07-03 Morskie Oko - Czarny Staw nad Morskim Okiem
15.08.2022 Wyżnia Dolina Chochołowska – Schronisko na Polanie Chochołowskiej 2`;

export default function BookletImport({ segments, onImport, onClose }: Props) {
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [defDate, setDefDate] = useState(todayInput());
  const [verified, setVerified] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const prepared = useMemo(() => prepareSegments(segments), [segments]);

  const analyse = () => {
    const parsed = parseBookletText(text);
    setRows(
      parsed.map((p, i) => {
        const cands = matchLine(p, prepared);
        return { id: i, raw: p.raw, date: p.date, cands, pick: cands.length ? 0 : -1, direction: cands[0]?.direction ?? "forward" };
      }),
    );
  };

  const accepted = (rows ?? []).filter((r) => r.pick >= 0 && r.cands[r.pick]);
  const points = accepted.reduce((a, r) => {
    const s = r.cands[r.pick].segment;
    return a + (r.direction === "forward" ? s.gotPointsForward : s.gotPointsBackward);
  }, 0);

  const update = (id: number, patch: Partial<Row>) =>
    setRows((rs) => rs?.map((r) => (r.id === id ? { ...r, ...patch } : r)) ?? null);

  const run = async () => {
    setBusy(true);
    const vy = Number(verified);
    // Duplikaty (ten sam odcinek i kierunek) liczymy raz.
    const seen = new Set<string>();
    const items = accepted
      .map((r) => ({
        segmentId: r.cands[r.pick].segment.id,
        direction: r.direction,
        completedAt: `${r.date ?? defDate}T12:00:00.000Z`,
        verifiedYear: Number.isInteger(vy) && vy > 1990 ? vy : undefined,
      }))
      .filter((i) => {
        const k = `${i.segmentId}|${i.direction}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    await onImport(items);
    setBusy(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="flex items-center gap-3 border-b border-zinc-200 bg-white px-5 py-3 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-bold">Import istniejącej książeczki</h2>
        <button
          onClick={onClose}
          className="ml-auto rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          ← Wróć
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-5">
        {!rows ? (
          <div className="mx-auto flex max-w-3xl flex-col gap-3">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Wklej wpisy z książeczki — po jednym w linii. W linii może być data (np. <code>12.06.2021</code>),
              nazwa odcinka (<code>Kuźnice – Nosal</code>) i opcjonalnie liczba punktów. Kolejność nazw
              rozstrzyga o kierunku. Możesz też wczytać plik CSV (w tym wyeksportowany z tej aplikacji).
            </p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={EXAMPLE}
              rows={14}
              className="w-full rounded-xl border p-3 font-mono text-sm"
            />
            <div className="flex flex-wrap items-center gap-3">
              <label className="cursor-pointer rounded-xl border border-zinc-300 px-3 py-2 text-sm font-medium dark:border-zinc-700">
                Wczytaj plik…
                <input
                  type="file"
                  accept=".csv,.txt,text/plain,text/csv"
                  hidden
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) setText(await f.text());
                    e.target.value = "";
                  }}
                />
              </label>
              <button
                onClick={() => setText(EXAMPLE)}
                className="text-sm text-zinc-500 underline"
              >
                wstaw przykład
              </button>
              <button
                onClick={analyse}
                disabled={!text.trim()}
                className="ml-auto rounded-xl bg-green-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
              >
                Dopasuj do odcinków →
              </button>
            </div>
          </div>
        ) : (
          <div className="mx-auto flex max-w-6xl flex-col gap-4">
            <div className="flex flex-wrap items-end gap-4 rounded-xl border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-500">Data dla wpisów bez daty</span>
                <input type="date" value={defDate} max={todayInput()} onChange={(e) => setDefDate(e.target.value)} className="rounded-lg border px-2 py-1" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-500">Rok weryfikacji (opcjonalnie)</span>
                <input
                  type="number"
                  value={verified}
                  onChange={(e) => setVerified(e.target.value)}
                  placeholder="np. 2023"
                  className="w-28 rounded-lg border px-2 py-1"
                />
              </label>
              <div className="ml-auto text-right">
                <div className="text-xs text-zinc-500">Do zaimportowania</div>
                <strong className="text-lg">
                  {accepted.length} wpisów · {points} pkt
                </strong>
              </div>
              <button onClick={() => setRows(null)} className="rounded-xl border border-zinc-300 px-3 py-2 dark:border-zinc-700">
                ← Edytuj tekst
              </button>
              <button
                onClick={() => void run()}
                disabled={!accepted.length || busy}
                className="rounded-xl bg-green-600 px-5 py-2.5 font-semibold text-white disabled:opacity-40"
              >
                {busy ? "Importuję…" : "Importuj do książeczki"}
              </button>
            </div>

            <div className="overflow-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-zinc-100 text-left text-[11px] tracking-wide text-zinc-600 uppercase dark:bg-zinc-800 dark:text-zinc-300">
                  <tr>
                    <th className="py-2 pl-3">Wpis z książeczki</th>
                    <th className="px-2 py-2">Dopasowany odcinek</th>
                    <th className="px-2 py-2">Kierunek</th>
                    <th className="px-2 py-2 text-right">Pkt</th>
                    <th className="px-2 py-2">Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {rows.map((r) => {
                    const c = r.pick >= 0 ? r.cands[r.pick] : undefined;
                    const s = c?.segment;
                    return (
                      <tr key={r.id} className={c ? "bg-white dark:bg-zinc-900" : "bg-amber-50 dark:bg-amber-950/20"}>
                        <td className="max-w-xs py-2 pl-3 align-top text-xs text-zinc-600 dark:text-zinc-400">{r.raw}</td>
                        <td className="px-2 py-2 align-top">
                          <select
                            value={r.pick}
                            onChange={(e) => {
                              const pick = Number(e.target.value);
                              update(r.id, { pick, direction: r.cands[pick]?.direction ?? r.direction });
                            }}
                            className="w-full rounded-lg border px-2 py-1"
                          >
                            <option value={-1}>— pomiń —</option>
                            {r.cands.map((cd, i) => (
                              <option key={cd.segment.id} value={i}>
                                {cd.segment.name} ({Math.round(cd.score * 100)}%)
                              </option>
                            ))}
                          </select>
                          {!r.cands.length && <div className="mt-1 text-xs text-amber-700 dark:text-amber-300">Brak dopasowania — dodaj ręcznie w Edytorze tras.</div>}
                        </td>
                        <td className="px-2 py-2 align-top">
                          {s && (
                            <select
                              value={r.direction}
                              onChange={(e) => update(r.id, { direction: e.target.value as Direction })}
                              className="rounded-lg border px-2 py-1"
                            >
                              <option value="forward">{directionLabel(s.name, "forward")}</option>
                              <option value="backward">{directionLabel(s.name, "backward")}</option>
                            </select>
                          )}
                        </td>
                        <td className="px-2 py-2 text-right align-top font-semibold tabular-nums">
                          {s ? (r.direction === "forward" ? s.gotPointsForward : s.gotPointsBackward) : ""}
                        </td>
                        <td className="px-2 py-2 align-top">
                          <input
                            type="date"
                            value={r.date ?? ""}
                            max={todayInput()}
                            onChange={(e) => update(r.id, { date: e.target.value || undefined })}
                            className="rounded-lg border px-2 py-1"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
