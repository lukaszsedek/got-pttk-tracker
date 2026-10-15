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

/** Dopasowanie bez względu na kolejność słów ("Olczyska Polana" ≈ "Polana Olczyska"). */
export function nameMatchScoreAnyOrder(query: string, candidate: string): 0 | 1 | 2 {
  const ordered = nameMatchScore(query, candidate);
  if (ordered) return ordered;
  const qw = words(query);
  const cw = words(candidate);
  if (!qw.length || qw.length !== cw.length) return 0;
  const used = new Set<number>();
  for (const w of qw) {
    const j = cw.findIndex((c, i) => !used.has(i) && wordsMatch(w, c));
    if (j === -1) return 0;
    used.add(j);
  }
  return 1;
}

const GENERIC = new Set([
  "przelecz", "przelecze", "przeleczy", "przel", "dolina", "doliny", "dolinie", "dolinke", "polana", "polany",
  "polanie", "schronisko", "schroniska", "schronisku", "hala", "hali", "staw", "stawu", "zleb", "zlebu",
  "grapa", "turnia", "turni", "pttk", "wielka", "wielkiej", "wielki",
]);

/** Znane rozbieżności między nazwami z tabeli PTTK a nazwami w OSM (klucz: nazwa znormalizowana, bez końcówek). */
const ALIASES: [RegExp, string[]][] = [
  [/^schronisk\w* pttk na hali gasienicowej/, ["Murowaniec"]],
  [/^schronisk\w* pttk nad morskim okiem/, ["Schronisko nad Morskim Okiem", "Morskie Oko"]],
  [/^schronisk\w* pttk na polanie chocholowskiej/, ["Schronisko na Polanie Chochołowskiej", "Polana Chochołowska"]],
  [/^schronisk\w* pttk w dolinie pieciu stawow/, ["Schronisko w Dolinie Pięciu Stawów Polskich", "Dolina Pięciu Stawów Polskich"]],
  [/^schronisk\w* pttk na hali ornak/, ["Schronisko na Hali Ornak"]],
  [/^dom\w* turysty pttk/, ["Dom Turysty PTTK"]],
  [/^kuznic/, ["Kuźnice"]],
];

/**
 * Warianty nazwy do geokodowania, od najbardziej do najmniej wiernego oryginałowi:
 * oczyszczona, alias, bez słowa rodzajowego na początku, bez wszystkich słów rodzajowych.
 */
export function nameVariants(raw: string): string[] {
  // Szum z tabel PTTK: punkty doklejone do nazwy, kody grup, przystanki, "TPG".
  const pre = raw
    .replace(/\s+\d+(?:\+\d+)?\s*\/\s*[\d?-]+\s*$/, "")
    .replace(/\b(?:BZ|BW|[SŁŁT])\.?\s?\d{2}\b/gi, " ")
    .replace(/^(?:z|ze|od|do)\s+/i, "")
    .replace(/^BZ\s+/i, "")
    .replace(/\b(?:TPG|PKP|PKS|Razc\.?)\b/g, " ");
  const compound = pre
    .split(/\s+[-–/]\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (compound.length > 1) {
    const seen: string[] = [];
    for (const part of [pre, ...compound]) for (const v of nameVariantsCore(part)) if (!seen.includes(v)) seen.push(v);
    return seen;
  }
  return nameVariantsCore(pre);
}

function nameVariantsCore(raw: string): string[] {
  const cleaned = raw
    .replace(/\(jeden kierunek\)/gi, " ")
    .replace(/\s+przez\s+.*$/i, "")
    .replace(/\(([^)]*)\)/g, " ")
    .replace(/\b\d[\d\s÷–-]*\s*m\b/g, " ")
    .replace(/["„”]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const out: string[] = [];
  const nominative = cleaned.replace(/\bWsi\b/g, "Wieś").replace(/\bwsi\b/g, "wieś");
  const add = (s: string) => {
    const t = s.trim();
    if (t && !out.includes(t)) out.push(t);
  };
  add(cleaned);
  if (nominative !== cleaned) add(nominative);

  const norm = normalizeName(cleaned).replace(/\bprzel\b/g, "przelecz");
  for (const [re, targets] of ALIASES) if (re.test(norm)) targets.forEach(add);

  // "Wielkiej Polany w Dolinie Małej Łąki" → "Dolina Małej Łąki"
  const inValley = cleaned.match(/\bw\s+(Dolinie|dolinie)\s+(.+)$/);
  if (inValley) add(`Dolina ${inValley[2]}`);

  const ws = cleaned.split(" ");
  if (ws.length > 1 && GENERIC.has(normalizeName(ws[0]))) add(ws.slice(1).join(" "));
  const core = ws.filter((w) => !GENERIC.has(normalizeName(w)));
  if (core.length && core.length < ws.length) add(core.join(" "));
  return out;
}
