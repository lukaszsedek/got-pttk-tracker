/** Normalizacja nazw: małe litery, bez ogonków, bez nawiasów i interpunkcji. */
export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const STOP = new Set(["w", "we", "na", "pod", "nad", "przy", "u", "z", "ze", "i", "do", "od", "pttk"]);

export function words(s: string): string[] {
  return normalizeName(s)
    .split(" ")
    .filter((w) => w && !STOP.has(w));
}

/**
 * Przybliżone porównanie słów z uwzględnieniem polskiej fleksji
 * ("Dolin" ≈ "Dolina", "Wierchu" ≈ "Wierch", "Poronca" ≈ "Poroniec").
 */
export function wordsMatch(a: string, b: string): boolean {
  if (a === b) return true;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const min = Math.min(a.length, b.length);
  return min >= 3 && i >= Math.max(3, min - 2) && Math.abs(a.length - b.length) <= 3;
}

/** 2 = identyczne po normalizacji, 1 = zgodne fleksyjnie, 0 = brak zgodności. */
export function nameMatchScore(query: string, candidate: string): 0 | 1 | 2 {
  const q = normalizeName(query);
  const c = normalizeName(candidate);
  if (!q || !c) return 0;
  if (q === c) return 2;
  const qw = words(query);
  const cw = words(candidate);
  if (!qw.length || !cw.length) return 0;
  // Wszystkie słowa zapytania muszą znaleźć odpowiednik, po kolei.
  let j = 0;
  for (const w of qw) {
    while (j < cw.length && !wordsMatch(w, cw[j])) j++;
    if (j === cw.length) return 0;
    j++;
  }
  // Kandydat nie może być dużo dłuższy (unikamy "Kuźnice" ≈ "Kuźnice Zakopane Dworzec").
  return cw.length - qw.length <= 1 ? 1 : 0;
}
