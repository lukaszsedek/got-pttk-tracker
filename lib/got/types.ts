import type { TrailColor } from "@/types/pttk";

/** Jeden wiersz tabeli punktacji GOT: odcinek "z <origin> do <destination>". */
export interface GotRecord {
  /** Stabilny identyfikator: <strona>:<nr bloku>:<nr wiersza>. */
  id: string;
  groupCode: string; // np. "T.01", "BZ.03", "S.12", "SK-slowacki-raj"
  regionName: string; // np. "TATRY WYSOKIE"
  sourcePage: string; // np. "tatry_wysokie.html"
  /** Punkt docelowy (nagłówek bloku), np. "Rusinowa Polana". */
  destination: string;
  destinationElevationM?: string; // surowo, np. "1170 ÷ 1300" lub "1036"
  /** Nazwa sekcji nad punktem docelowym (strony słowackie), np. "GRZBIET GŁÓWNY". */
  section?: string;
  /** Punkt początkowy ("z ..."), np. "Dolin Filipka". Dla atrakcji (jaskinie) brak. */
  origin?: string;
  /** Kolory znakowania; pusty + unmarked=true → "BZ" (bez znaków). */
  trailColors: TrailColor[];
  unmarked: boolean;
  /** Punkty origin → destination ("tam") i z powrotem. null = brak/nieznane. */
  pointsForward: number | null;
  pointsBackward: number | null;
  pointsRaw: string;
  kind: "edge" | "attraction" | "other";
  /** Surowy tekst kolumny nazwy (do debugowania i ręcznych poprawek). */
  rawName: string;
}

export interface GotPageMeta {
  sourcePage: string;
  url: string;
  groupCode: string;
  regionName: string;
  blocks: number;
  records: number;
}
