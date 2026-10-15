/**
 * Zasady wg Regulaminu GOT PTTK (ktg.pttk.pl, §6–§16).
 * Odznaki zdobywa się kolejno: popularna → mała brązowa → srebrna → złota → duża…
 * Każdy stopień wymaga własnej normy punktowej; progi poniżej są SKUMULOWANE
 * (suma norm od początku cyklu, bez nadwyżek przenoszonych do kolejnego stopnia).
 */
export interface Badge {
  id: string;
  name: string;
  /** Norma samego stopnia. */
  norm: number;
  /** Skumulowany próg od początku cyklu. */
  points: number;
  color: string;
  icon: string;
  /** Punkty zza granicy mogą pokryć najwyżej 50% normy (§7.2). */
  foreignCapped: boolean;
}

const MAIN: Omit<Badge, "points">[] = [
  { id: "popularna", name: "Popularna", norm: 60, color: "#16a34a", icon: "🌱", foreignCapped: true },
  { id: "mala-brazowa", name: "Mała brązowa", norm: 120, color: "#b45309", icon: "🥉", foreignCapped: true },
  { id: "mala-srebrna", name: "Mała srebrna", norm: 360, color: "#71717a", icon: "🥈", foreignCapped: true },
  { id: "mala-zlota", name: "Mała złota", norm: 720, color: "#ca8a04", icon: "🥇", foreignCapped: true },
];

export const BADGES: Badge[] = MAIN.reduce<Badge[]>((acc, b) => {
  const prev = acc[acc.length - 1]?.points ?? 0;
  return [...acc, { ...b, points: prev + b.norm }];
}, []);

/** "W góry" (dzieci 5–10 lat) — osobna ścieżka, nie wlicza się do cyklu. */
export const W_GORY = [
  { name: "W góry brązowa", points: 15 },
  { name: "W góry srebrna", points: 30 },
  { name: "W góry złota", points: 45 },
];

export const MAX_PER_DAY = 50; // §6.3
export const WYTRWALOSC_NORM = 120; // §15

export interface ScoreEntry {
  /** Dzień zaliczenia (YYYY-MM-DD). */
  day: string;
  points: number;
  /** Punkty z pasm poza Polską (Słowacja, Czechy, Ukraina). */
  foreign: boolean;
}

/** Stosuje limit 50 pkt/dzień (§6.3); zwraca sumy po limicie. */
export function scoreEntries(entries: ScoreEntry[]) {
  const days = new Map<string, { dom: number; foreign: number }>();
  for (const e of entries) {
    const d = days.get(e.day) ?? { dom: 0, foreign: 0 };
    if (e.foreign) d.foreign += e.points;
    else d.dom += e.points;
    days.set(e.day, d);
  }
  let domestic = 0;
  let foreign = 0;
  let raw = 0;
  for (const { dom, foreign: f } of days.values()) {
    const sum = dom + f;
    raw += sum;
    const k = sum > MAX_PER_DAY ? MAX_PER_DAY / sum : 1;
    domestic += dom * k;
    foreign += f * k;
  }
  return {
    raw,
    domestic: Math.round(domestic),
    foreign: Math.round(foreign),
    lostToDailyCap: Math.round(raw - domestic - foreign),
  };
}

export interface EarnedBadge {
  badgeId: string;
  earnedYear: number;
}

export interface DayWarning {
  day: string;
  points: number;
  lost: number;
}

const yearOf = (e: ScoreEntry) => Number(e.day.slice(0, 4));

/**
 * Stan cyklu odznak z uwzględnieniem już zdobytych stopni (§8, §12):
 * punkty z lat do roku zdobycia ostatniego stopnia dają nadwyżkę (≤ 50% następnej normy),
 * punkty z późniejszych lat liczą się w całości. Zagraniczne ≤ 50% normy (§7.2).
 */
export function cycleStatus(entries: ScoreEntry[], earned: EarnedBadge[]) {
  const ids = new Set(earned.map((e) => e.badgeId));
  let k = -1;
  BADGES.forEach((b, i) => {
    if (ids.has(b.id)) k = i;
  });
  const last = k >= 0 ? BADGES[k] : null;
  const lastYear = last ? (earned.find((e) => e.badgeId === last.id)?.earnedYear ?? null) : null;
  const next = BADGES[k + 1] ?? null;
  const all = scoreEntries(entries);
  const half = next ? Math.floor(next.norm / 2) : 0;

  let have: number;
  if (!last || lastYear === null) {
    have = all.domestic + Math.min(all.foreign, half);
  } else {
    const before = scoreEntries(entries.filter((e) => yearOf(e) <= lastYear));
    const after = scoreEntries(entries.filter((e) => yearOf(e) > lastYear));
    const surplus = Math.max(0, before.domestic + before.foreign - last.points);
    have = Math.min(surplus, half) + after.domestic + Math.min(after.foreign, half);
  }
  const need = next?.norm ?? 0;
  const ready = !!next && have >= need;
  // Najwcześniejszy rok weryfikacji: jeden stopień na rok (wyjątek: popularna → mała brązowa).
  let earliestYear: number | null = null;
  if (last && lastYear !== null) {
    const sameYearOk = last.id === "popularna" && next?.id === "mala-brazowa";
    earliestYear = sameYearOk ? lastYear : lastYear + 1;
  }
  return {
    all,
    last,
    lastYear,
    next,
    have,
    need,
    ready,
    pct: next ? Math.max(0, Math.min(100, (have / need) * 100)) : 100,
    earliestYear,
    earnedList: BADGES.filter((b) => ids.has(b.id)),
  };
}

/** Dni z przekroczonym limitem dziennym (§6.3). */
export function dayWarnings(entries: ScoreEntry[]): DayWarning[] {
  const m = new Map<string, number>();
  for (const e of entries) m.set(e.day, (m.get(e.day) ?? 0) + e.points);
  return [...m]
    .filter(([, p]) => p > MAX_PER_DAY)
    .map(([day, points]) => ({ day, points, lost: points - MAX_PER_DAY }))
    .sort((a, b) => a.day.localeCompare(b.day));
}
