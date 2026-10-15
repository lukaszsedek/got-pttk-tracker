import { nameMatchScoreAnyOrder, words, wordsMatch } from "@/lib/got/names";
import { splitName } from "@/lib/booklet";
import type { Direction, SegmentRow } from "@/types/pttk";

export interface ParsedLine {
  raw: string;
  /** Data ISO (YYYY-MM-DD), jeśli rozpoznano w linii. */
  date?: string;
  /** Liczba punktów podana w linii (do wyboru kierunku). */
  points?: number;
  /** Tekst bez daty i liczb — do dopasowania. */
  text: string;
}

export interface Candidate {
  segment: SegmentRow;
  direction: Direction;
  score: number;
}

const DATE_RES: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/(\d{4})-(\d{1,2})-(\d{1,2})/, (m) => `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`],
  [/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/, (m) => `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`],
  [/(\d{1,2})[./-](\d{1,2})[./-](\d{2})(?!\d)/, (m) => `20${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`],
];

/** Dzieli wklejony tekst/CSV na linie i wyciąga datę oraz punkty. Pomija nagłówki i puste wiersze. */
export function parseBookletText(text: string): ParsedLine[] {
  const out: ParsedLine[] = [];
  for (const raw of text.replace(/^﻿/, "").split(/\r?\n/)) {
    let line = raw.trim();
    if (!line || /^(data|lp\.?)\b[;\t,]/i.test(line) || /^razem\b/i.test(line)) continue;
    let date: string | undefined;
    for (const [re, fmt] of DATE_RES) {
      const m = line.match(re);
      if (m) {
        const d = fmt(m);
        if (!Number.isNaN(Date.parse(d))) {
          date = d;
          line = line.replace(m[0], " ");
          break;
        }
      }
    }
    // Ostatnia samodzielna liczba w linii traktujemy jako punkty ("… 4 pkt", "…;4").
    const pm = line.match(/(?:^|[\s;,\t])(\d{1,2})\s*(?:pkt\.?|p\.)?\s*$/i);
    const points = pm ? Number(pm[1]) : undefined;
    if (pm) line = line.slice(0, pm.index);
    const textOnly = line.replace(/[;\t|]+/g, " ").replace(/\b\d+\b/g, " ").replace(/\s+/g, " ").trim();
    if (textOnly.length < 3) continue;
    out.push({ raw, date, points, text: textOnly });
  }
  return out;
}

interface Prepared {
  s: SegmentRow;
  a: string[];
  b: string[];
}

export function prepareSegments(segments: SegmentRow[]): Prepared[] {
  return segments.map((s) => {
    const [a, b] = splitName(s.name);
    return { s, a: words(a), b: words(b) };
  });
}

const frac = (needles: string[], hay: string[]) =>
  needles.length ? needles.filter((n) => hay.some((h) => wordsMatch(n, h))).length / needles.length : 0;

const firstPos = (needles: string[], hay: string[]) => {
  let best = Infinity;
  for (const n of needles) {
    const i = hay.findIndex((h) => wordsMatch(n, h));
    if (i !== -1) best = Math.min(best, i);
  }
  return best;
};

/** Najlepsze dopasowania linii do odcinków (z kierunkiem z kolejności nazw). */
export function matchLine(line: ParsedLine, prepared: Prepared[], limit = 5): Candidate[] {
  const lw = words(line.text);
  if (!lw.length) return [];
  const scored: Candidate[] = [];
  for (const { s, a, b } of prepared) {
    if (!a.length && !b.length) continue;
    const fa = frac(a, lw);
    const fb = frac(b, lw);
    // Obie końcówki odcinka muszą się pojawić (choćby jedna w całości i druga częściowo).
    if (fa === 0 || fb === 0) continue;
    // Kara za słowa linii, których nie ma w nazwie (inne trasy o podobnych końcach).
    const covered = lw.filter((w) => [...a, ...b].some((n) => wordsMatch(w, n))).length / lw.length;
    const score = (fa + fb) / 2 * 0.7 + covered * 0.3;
    if (score < 0.55) continue;
    const pa = firstPos(a, lw);
    const pb = firstPos(b, lw);
    let direction: Direction = pa <= pb ? "forward" : "backward";
    // Gdy punkty w linii pasują tylko do jednego kierunku — to rozstrzyga.
    if (line.points !== undefined && s.gotPointsForward !== s.gotPointsBackward) {
      if (line.points === s.gotPointsForward && line.points !== s.gotPointsBackward) direction = "forward";
      else if (line.points === s.gotPointsBackward && line.points !== s.gotPointsForward) direction = "backward";
    }
    scored.push({ segment: s, direction, score });
  }
  scored.sort((x, y) => y.score - x.score);
  // Dla pewności sprawdź pełne dopasowanie nazwy w wybranym kierunku.
  return scored.slice(0, limit).map((c) => {
    const [a, b] = splitName(c.segment.name);
    const q = line.text;
    const bonus = nameMatchScoreAnyOrder(q, `${a} ${b}`) ? 0.05 : 0;
    return { ...c, score: Math.min(1, c.score + bonus) };
  });
}
