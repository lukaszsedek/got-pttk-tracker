import type { LineString } from "geojson";

/** Kolor oznakowania szlaku. */
export type TrailColor = "Red" | "Blue" | "Green" | "Yellow" | "Black";

/** Kierunek przejścia odcinka względem from -> to. */
export type Direction = "forward" | "backward";

/** Węzeł PTTK (punkt węzłowy / schronisko / szczyt). */
export interface PttkNode {
  id: string;
  name: string;
  coordinates: { lat: number; lng: number };
  groupId: string; // np. "T.01"
}

/** Odcinek szlaku punktowany (krawędź grafu). */
export interface PttkSegment {
  id: string; // np. "T01_001"
  groupId: string;
  fromNodeId: string;
  toNodeId: string;
  /** Surowa nazwa z tabeli PTTK, np. "Kuźnice – Przełęcz między Kopami przez Boczań". */
  name: string;
  gotPointsForward: number;
  gotPointsBackward: number;
  distanceKm: number;
  elevationGainM: number;
  trailColor: TrailColor;
  geometry: LineString; // GeoJSON [lng, lat]
}

/** Zaliczony odcinek użytkownika. */
export interface UserTrailProgress {
  userId: string;
  segmentId: string;
  completedAt: string; // ISO 8601
  direction: Direction;
  sourceActivityId?: string;
}

/** Punkt śladu GPX po wstępnej obróbce. */
export interface GpxPoint {
  lat: number;
  lng: number;
  ele?: number;
  time?: string; // ISO 8601
}

/** Aktywność zaimportowana z pliku GPX/FIT. */
export interface GpxActivity {
  id: string;
  name?: string;
  startedAt?: string;
  points: GpxPoint[];
}

/** Pojedyncze dopasowanie śladu do odcinka (wynik map matchingu). */
export interface SegmentMatch {
  segmentId: string;
  direction: Direction;
  /** Odsetek długości odcinka pokryty śladem (0..1). */
  coverage: number;
  gotPoints: number;
  alreadyCompleted: boolean;
  /** Pokrycie poniżej progu (np. 50–85%) — wymaga ręcznego potwierdzenia. */
  partial?: boolean;
  /** Data wycieczki (ISO), gdy ślad obejmował kilka dni. */
  day?: string;
}

/** Podsumowanie importu do zatwierdzenia przez użytkownika. */
export interface MatchSummary {
  activityId: string;
  matches: SegmentMatch[];
  /** Data rozpoczęcia aktywności (do wpisu w książeczce). */
  startedAt?: string;
  newSegments: number;
  totalGotPoints: number;
  /** Diagnostyka: statystyki śladu i pokrycie każdego odcinka (także niedopasowanych). */
  diagnostics?: {
    trackPoints: number;
    trackLengthKm: number;
    coverage: { segmentId: string; coverage: number }[];
  };
}

/** Surowy rekord tabeli PTTK przed powiązaniem z geometrią OSM. */
export interface RawPttkRecord {
  groupId: string;
  raw: string; // "Kuźnice – Przełęcz między Kopami przez Boczań | 7 pkt / 4 pkt"
}

/** Odcinek z listy (API): przebieg na mapie może nie być jeszcze wyznaczony. */
export interface SegmentRow extends Omit<PttkSegment, "geometry" | "trailColor"> {
  geometry: LineString | null;
  trailColor: TrailColor | null;
  regionName: string;
  /** "ok" | "detour" | "origin-not-found" | ... — status dopasowania do OSM. */
  geomStatus: string;
  unmarked: boolean;
}

/** Minimalny zestaw pól potrzebny do dopasowania śladu. */
export type MatchableSegment = Pick<
  PttkSegment,
  "id" | "geometry" | "gotPointsForward" | "gotPointsBackward"
>;

/** Pozycja planu: odcinek + kierunek, który chcemy przejść. */
export interface PlanItem {
  segmentId: string;
  direction: Direction;
  addedAt: string;
}
