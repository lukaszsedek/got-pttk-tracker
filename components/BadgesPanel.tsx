"use client";

import { useMemo } from "react";
import { Card } from "@/components/ui";
import {
  BADGES,
  MAX_PER_DAY,
  OTHER_BADGES,
  W_GORY,
  WYTRWALOSC_NORM,
  cycleStatus,
  dayWarnings,
  scoreEntries as score,
  type EarnedBadge,
  type ScoreEntry,
} from "@/lib/badges";

interface Props {
  entries: ScoreEntry[];
  earned: EarnedBadge[];
  onSetGoal: (n: number) => void;
  onEarn: (badgeId: string, year: number) => void;
  onUnearn: (badgeId: string) => void;
}

const MONTHS = ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"];

export default function BadgesPanel({ entries, earned, onSetGoal, onEarn, onUnearn }: Props) {
  const st = useMemo(() => cycleStatus(entries, earned), [entries, earned]);
  const warnings = useMemo(() => dayWarnings(entries), [entries]);
  const thisYear = new Date().getFullYear();

  const stats = useMemo(() => {
    const byMonth = new Map<string, number>();
    for (const e of entries) byMonth.set(e.day.slice(0, 7), (byMonth.get(e.day.slice(0, 7)) ?? 0) + e.points);
    const years = [...new Set(entries.map((e) => e.day.slice(0, 4)))].sort();
    const byYear = years.map((y) => {
      const sc = score(entries.filter((e) => e.day.startsWith(y)));
      return [y, sc.domestic + sc.foreign] as const;
    });
    const months = [...byMonth].sort((a, b) => a[0].localeCompare(b[0])).slice(-12);
    const best = [...byYear].sort((a, b) => b[1] - a[1])[0];
    return { months, years: byYear, best, max: Math.max(1, ...months.map((m) => m[1])) };
  }, [entries]);

  const total = st.all.domestic + st.all.foreign;
  const foreignWarn = st.next && st.all.foreign > Math.floor(st.next.norm / 2);

  return (
    <div className="flex flex-col gap-4">
      <Card title="Punkty i następny stopień">
        <div className="flex items-end justify-between">
          <div>
            <strong className="text-4xl">{total}</strong>
            <span className="text-zinc-500"> pkt łącznie</span>
          </div>
          <div className="text-right text-xs text-zinc-500">
            w Polsce: {st.all.domestic}
            <br />
            za granicą: {st.all.foreign}
          </div>
        </div>
        <p className="mt-2 text-sm">
          {st.last ? (
            <>
              Ostatnia zdobyta: <strong>{st.last.name}</strong> ({st.lastYear})
            </>
          ) : (
            "Nie zaznaczono jeszcze żadnej zdobytej odznaki."
          )}
        </p>
        {st.next ? (
          <div className="mt-3">
            <div className="flex justify-between text-xs text-zinc-600 dark:text-zinc-400">
              <span>
                Następna: {st.next.name} — {st.have}/{st.need} pkt
              </span>
              <span>{st.ready ? "norma spełniona ✓" : `brakuje ${st.need - st.have} pkt`}</span>
            </div>
            <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
              <div className="h-full rounded-full bg-green-600 transition-all" style={{ width: `${st.pct}%` }} />
            </div>
            {st.earliestYear && (
              <p className="mt-2 text-xs text-zinc-500">
                Weryfikacja najwcześniej w {st.earliestYear} (jeden stopień na rok).
              </p>
            )}
            {!st.ready && (
              <button
                onClick={() => onSetGoal(total + (st.need - st.have))}
                className="mt-2 text-xs font-medium text-green-700 underline dark:text-green-400"
              >
                Ustaw cel: {st.need - st.have} pkt do {st.next.name}
              </button>
            )}
          </div>
        ) : (
          <p className="mt-2 text-xs text-zinc-500">Wszystkie stopnie małej odznaki zdobyte.</p>
        )}
      </Card>

      {(warnings.length > 0 || foreignWarn) && (
        <Card title="Uwagi do reguł">
          <ul className="list-disc space-y-1 pl-4 text-xs text-amber-800 dark:text-amber-300">
            {warnings.map((w) => (
              <li key={w.day}>
                {new Date(w.day).toLocaleDateString("pl-PL")}: {w.points} pkt w jeden dzień — limit {MAX_PER_DAY}, nie
                liczy się {w.lost} pkt.
              </li>
            ))}
            {foreignWarn && st.next && (
              <li>
                Punkty zza granicy ({st.all.foreign}) przekraczają 50% normy {st.next.name} — liczy się najwyżej{" "}
                {Math.floor(st.next.norm / 2)}.
              </li>
            )}
          </ul>
        </Card>
      )}

      <Card title="Odznaki GOT">
        <ul className="grid grid-cols-2 gap-2">
          {BADGES.map((b) => {
            const e = earned.find((x) => x.badgeId === b.id);
            return (
              <li
                key={b.id}
                className={`rounded-xl border p-3 text-center ${
                  e ? "border-green-500 bg-green-50 dark:bg-green-950/30" : "border-zinc-200 dark:border-zinc-800"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={b.image}
                  alt={b.name}
                  className="mx-auto h-20 w-auto object-contain"
                  style={{ filter: e ? undefined : "grayscale(1) opacity(0.55)" }}
                />
                <div className="mt-1 text-sm font-semibold">{b.name}</div>
                <div className="text-xs text-zinc-500">
                  {e ? `zdobyta ${e.earnedYear}` : `norma ${b.norm} pkt`}
                </div>
                {e ? (
                  <button onClick={() => onUnearn(b.id)} className="mt-1 text-xs text-red-600 underline">
                    cofnij
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      const y = Number(prompt(`Rok zdobycia odznaki „${b.name}”:`, String(thisYear)));
                      if (Number.isInteger(y) && y > 1950 && y <= thisYear + 1) onEarn(b.id, y);
                    }}
                    className="mt-1 text-xs font-medium text-green-700 underline dark:text-green-400"
                  >
                    oznacz jako zdobytą
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        <h3 className="mt-4 mb-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
          Wyższe stopnie (wymagają wycieczek wielodniowych)
        </h3>
        <ul className="grid grid-cols-4 gap-2">
          {OTHER_BADGES.map((b) => (
            <li key={b.id} className="text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={b.image}
                alt={b.name}
                className="mx-auto h-14 w-auto object-contain"
                style={{ filter: "grayscale(1) opacity(0.6)" }}
              />
              <div className="mt-1 text-[10px] leading-tight text-zinc-500">{b.name}</div>
            </li>
          ))}
        </ul>
        <ul className="mt-3 list-disc space-y-1 pl-4 text-xs text-zinc-600 dark:text-zinc-400">
          <li>Odznaki zdobywa się kolejno; w roku kalendarzowym można zweryfikować jeden stopień (wyjątek: popularna i mała brązowa).</li>
          <li>Po zdobyciu stopnia nadwyżka punktów (do 50% następnej normy) przechodzi dalej, później liczą się punkty z kolejnych lat.</li>
          <li>Punkty zza granicy mogą pokryć najwyżej 50% normy popularnej i małych odznak.</li>
          <li>„W góry” (dzieci 5–10 lat): {W_GORY.map((w) => `${w.points} pkt`).join(" / ")}.</li>
          <li>
            Duża odznaka wymaga wycieczek wielodniowych w grupach I–VI oraz punktów w Górach Świętokrzyskich i
            Tatrach — tego aplikacja nie weryfikuje.
          </li>
          <li>„Za wytrwałość”: norma {WYTRWALOSC_NORM} pkt, powtarzana 7–10 razy zależnie od posiadanej odznaki.</li>
        </ul>
      </Card>

      {stats.months.length > 0 && (
        <Card title="Statystyki">
          <div className="flex h-28 items-end gap-1">
            {stats.months.map(([m, v]) => (
              <div key={m} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${m}: ${v} pkt`}>
                <span className="text-[10px] text-zinc-500">{v}</span>
                <div className="w-full rounded-t bg-green-600" style={{ height: `${(v / stats.max) * 80}%`, minHeight: 2 }} />
                <span className="text-[10px] text-zinc-500">{MONTHS[Number(m.slice(5)) - 1]}</span>
              </div>
            ))}
          </div>
          <table className="mt-3 w-full text-sm">
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {stats.years.map(([y, v]) => (
                <tr key={y}>
                  <td className="py-1.5">{y}</td>
                  <td className="py-1.5 text-right font-semibold tabular-nums">{v} pkt</td>
                  <td className="py-1.5 pl-3 text-xs text-zinc-500">
                    {stats.best && stats.best[0] === y && stats.years.length > 1 ? "najlepszy rok" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
