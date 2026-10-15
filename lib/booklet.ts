import type { Direction } from "@/types/pttk";

export interface PointsSource {
  gotPointsForward: number;
  gotPointsBackward: number;
}

export const dirPoints = (s: PointsSource, d: Direction) =>
  d === "forward" ? s.gotPointsForward : s.gotPointsBackward;

export const key = (segmentId: string, d: Direction) => `${segmentId}|${d}`;

/** "A – B" → ["A", "B"] (nazwa odcinka to "<skąd> – <dokąd>"). */
export function splitName(name: string): [string, string] {
  const i = name.indexOf(" – ");
  return i === -1 ? [name, ""] : [name.slice(0, i), name.slice(i + 3)];
}

export function directionLabel(name: string, d: Direction): string {
  const [a, b] = splitName(name);
  return d === "forward" ? `${a} → ${b}` : `${b} → ${a}`;
}

export const formatDate = (iso: string) => new Date(iso).toLocaleDateString("pl-PL");

export const todayInput = () => new Date().toISOString().slice(0, 10);

/** Data z <input type="date"> → ISO w południe UTC (unika przesunięć stref czasowych). */
export const dateInputToIso = (d: string) => `${d}T12:00:00.000Z`;

export function toCsv(rows: (string | number)[][]): string {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + rows.map((r) => r.map(esc).join(";")).join("\r\n");
}

export function downloadText(filename: string, text: string, mime = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Polska odmiana liczebnika: plural(1,"wpis","wpisy","wpisów"). */
export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (n === 1) return one;
  if (m10 >= 2 && m10 <= 4 && !(m100 >= 12 && m100 <= 14)) return few;
  return many;
}
