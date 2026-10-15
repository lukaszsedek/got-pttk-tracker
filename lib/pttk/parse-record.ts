import type { RawPttkRecord } from "@/types/pttk";

export interface ParsedRecord {
  groupId: string;
  raw: string;
  fromName: string;
  toName: string;
  /** Nazwa punktu pośredniego po "przez", jeśli występuje. */
  via?: string;
  gotPointsForward: number;
  gotPointsBackward: number;
}

// Separator nazw: półpauza, pauza lub myślnik otoczony spacjami.
const NAME_SEP = /\s+[–—-]\s+/;

/**
 * Parsuje wiersz tabeli PTTK, np.
 *   "Kuźnice – Przełęcz między Kopami przez Boczań | 7 pkt / 4 pkt"
 * Obsługuje też "7/4", "7 pkt" (bez powrotu → taka sama liczba) oraz
 * separator punktów " : " zamiast "|".
 */
export function parseRawRecord(rec: RawPttkRecord): ParsedRecord | null {
  const [namePart, pointsPart] = rec.raw.split(/\s*[|:]\s*(?=\d)/);
  if (!namePart || !pointsPart) return null;

  const nums = pointsPart.match(/\d+/g)?.map(Number);
  if (!nums?.length) return null;
  const [fwd, back = fwd] = nums;

  const names = namePart.trim().split(NAME_SEP);
  if (names.length < 2) return null;
  const fromName = names[0].trim();
  const [toRaw, viaRaw] = names.slice(1).join(" – ").split(/\s+przez\s+/i);

  return {
    groupId: rec.groupId,
    raw: rec.raw,
    fromName,
    toName: toRaw.trim(),
    via: viaRaw?.trim(),
    gotPointsForward: fwd,
    gotPointsBackward: back,
  };
}

/** Normalizacja do porównań nazw (bez polskich znaków, wielkości liter, interpunkcji). */
export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
