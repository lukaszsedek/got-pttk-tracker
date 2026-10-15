"use client";

import { Card } from "@/components/ui";
import { BADGES, MAX_PER_DAY, W_GORY, WYTRWALOSC_NORM, badgeStatus, type scoreEntries } from "@/lib/badges";

interface Props {
  scored: ReturnType<typeof scoreEntries>;
  onSetGoal: (n: number) => void;
}

export default function BadgesPanel({ scored, onSetGoal }: Props) {
  const { earned, current, next, have, pct } = badgeStatus(scored.domestic, scored.foreign);
  const total = scored.domestic + scored.foreign;

  return (
    <div className="flex flex-col gap-4">
      <Card title="Zdobyte punkty">
        <div className="flex items-end justify-between">
          <div>
            <strong className="text-4xl">{total}</strong>
            <span className="text-zinc-500"> pkt do odznak</span>
          </div>
          <div className="text-right text-xs text-zinc-500">
            w Polsce: {scored.domestic}
            <br />
            za granicą: {scored.foreign}
          </div>
        </div>
        {scored.lostToDailyCap > 0 && (
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
            Limit {MAX_PER_DAY} pkt/dzień (§6.3) obciął {scored.lostToDailyCap} pkt.
          </p>
        )}
        <p className="mt-2 text-sm">
          {current ? (
            <>
              Ostatni zdobyty stopień: <strong>{current.icon} {current.name}</strong>
            </>
          ) : (
            "Pierwszy stopień — Popularna — od 60 pkt."
          )}
        </p>
        {next && (
          <div className="mt-3">
            <div className="flex justify-between text-xs text-zinc-600 dark:text-zinc-400">
              <span>
                Następna: {next.name} (norma {next.norm} pkt)
              </span>
              <span>brakuje {Math.max(0, next.points - have)} pkt</span>
            </div>
            <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
              <div className="h-full rounded-full bg-green-600 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <button
              onClick={() => onSetGoal(next.points)}
              className="mt-2 text-xs font-medium text-green-700 underline dark:text-green-400"
            >
              Ustaw jako cel ({next.points} pkt)
            </button>
          </div>
        )}
      </Card>

      <Card title="Odznaki GOT">
        <ul className="grid grid-cols-2 gap-2">
          {BADGES.map((b) => {
            const ok = earned.includes(b);
            return (
              <li
                key={b.id}
                className={`rounded-xl border p-3 text-center ${
                  ok
                    ? "border-green-500 bg-green-50 dark:bg-green-950/30"
                    : "border-zinc-200 opacity-70 dark:border-zinc-800"
                }`}
              >
                <div
                  className="mx-auto grid h-12 w-12 place-items-center rounded-full text-2xl"
                  style={{ background: ok ? b.color : "#d4d4d8", filter: ok ? undefined : "grayscale(1)" }}
                >
                  {b.icon}
                </div>
                <div className="mt-1 text-sm font-semibold">{b.name}</div>
                <div className="text-xs text-zinc-500">
                  {ok ? "norma spełniona ✓" : `${b.norm} pkt`}
                  {b.norm !== b.points && !ok ? ` (łącznie ${b.points})` : ""}
                </div>
              </li>
            );
          })}
        </ul>
        <ul className="mt-3 list-disc space-y-1 pl-4 text-xs text-zinc-600 dark:text-zinc-400">
          <li>Odznaki zdobywa się kolejno; w roku kalendarzowym można zweryfikować tylko jeden stopień (wyjątek: popularna i mała brązowa).</li>
          <li>Punkty zza granicy mogą pokryć najwyżej 50% normy popularnej i małych odznak.</li>
          <li>Progi są sumą norm od początku cyklu; nadwyżki (do 50% następnej normy) nie są tu uwzględniane.</li>
          <li>
            „W góry” (dzieci 5–10 lat): {W_GORY.map((w) => `${w.points} pkt`).join(" / ")}.
          </li>
          <li>
            Duża odznaka wymaga wycieczek wielodniowych w grupach I–VI (min. 7 dni, 7 punktów pośrednich) oraz
            punktów w Górach Świętokrzyskich i Tatrach — tego aplikacja nie weryfikuje.
          </li>
          <li>„Za wytrwałość”: norma {WYTRWALOSC_NORM} pkt, powtarzana 7–10 razy zależnie od posiadanej odznaki.</li>
        </ul>
      </Card>
    </div>
  );
}
