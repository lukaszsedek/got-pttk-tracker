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

/** Punkty zaliczane do progu `threshold`: zagraniczne najwyżej 50% progu. */
export function countedFor(domestic: number, foreign: number, badge: Badge) {
  return domestic + (badge.foreignCapped ? Math.min(foreign, Math.floor(badge.norm / 2)) : foreign);
}

export function badgeStatus(domestic: number, foreign = 0) {
  // Zagraniczne ograniczamy względem skumulowanego progu (przybliżenie §7.2).
  const counted = (b: Badge) =>
    domestic + (b.foreignCapped ? Math.min(foreign, Math.floor(b.points / 2)) : foreign);
  const earned = BADGES.filter((b) => counted(b) >= b.points);
  const current = earned[earned.length - 1] ?? null;
  const next = BADGES.find((b) => counted(b) < b.points) ?? null;
  const have = next ? counted(next) : domestic + foreign;
  const prevPts = current?.points ?? 0;
  const pct = next ? ((have - prevPts) / (next.points - prevPts)) * 100 : 100;
  return { earned, current, next, have, pct: Math.max(0, Math.min(100, pct)) };
}
