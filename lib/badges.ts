/**
 * Progi odznak GOT PTTK. Wartości trzymane w jednym miejscu — zweryfikuj je
 * z aktualnym regulaminem GOT i popraw tutaj, jeśli się różnią.
 */
export interface Badge {
  id: string;
  name: string;
  points: number;
  color: string; // kolor tła odznaki
  icon: string;
}

export const BADGES: Badge[] = [
  { id: "popularna", name: "Popularna", points: 15, color: "#16a34a", icon: "🌱" },
  { id: "mala-brazowa", name: "Mała brązowa", points: 30, color: "#b45309", icon: "🥉" },
  { id: "mala-srebrna", name: "Mała srebrna", points: 45, color: "#71717a", icon: "🥈" },
  { id: "mala-zlota", name: "Mała złota", points: 60, color: "#ca8a04", icon: "🥇" },
  { id: "duza-brazowa", name: "Duża brązowa", points: 90, color: "#92400e", icon: "🏅" },
  { id: "duza-srebrna", name: "Duża srebrna", points: 120, color: "#52525b", icon: "🎖️" },
  { id: "duza-zlota", name: "Duża złota", points: 150, color: "#a16207", icon: "🏆" },
];

export function badgeStatus(points: number) {
  const earned = BADGES.filter((b) => points >= b.points);
  const current = earned[earned.length - 1] ?? null;
  const next = BADGES.find((b) => points < b.points) ?? null;
  const prevPts = current?.points ?? 0;
  const pct = next ? ((points - prevPts) / (next.points - prevPts)) * 100 : 100;
  return { earned, current, next, pct: Math.max(0, Math.min(100, pct)) };
}
