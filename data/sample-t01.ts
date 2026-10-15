import type { PttkNode, PttkSegment } from "@/types/pttk";

// Dane poglądowe (geometria przybliżona) — do zastąpienia danymi z OSM/PTTK.
export const SAMPLE_SEGMENTS: PttkSegment[] = [
  {
    id: "T01_001",
    groupId: "T.01",
    fromNodeId: "kuznice",
    toNodeId: "przel-miedzy-kopami",
    name: "Kuźnice – Przełęcz między Kopami przez Boczań",
    gotPointsForward: 7,
    gotPointsBackward: 4,
    distanceKm: 3.6,
    elevationGainM: 540,
    trailColor: "Blue",
    geometry: {
      type: "LineString",
      coordinates: [
        [19.9814, 49.2695],
        [19.9895, 49.2662],
        [19.9962, 49.2628],
        [20.0034, 49.2587],
      ],
    },
  },
  {
    id: "T01_002",
    groupId: "T.01",
    fromNodeId: "kuznice",
    toNodeId: "myslenickie-turnie",
    name: "Kuźnice – Myślenickie Turnie",
    gotPointsForward: 6,
    gotPointsBackward: 3,
    distanceKm: 2.9,
    elevationGainM: 560,
    trailColor: "Green",
    geometry: {
      type: "LineString",
      coordinates: [
        [19.9814, 49.2695],
        [19.9778, 49.2641],
        [19.9751, 49.2582],
        [19.9769, 49.2512],
      ],
    },
  },
  {
    id: "T01_003",
    groupId: "T.01",
    fromNodeId: "myslenickie-turnie",
    toNodeId: "kasprowy-wierch",
    name: "Myślenickie Turnie – Kasprowy Wierch",
    gotPointsForward: 5,
    gotPointsBackward: 3,
    distanceKm: 2.4,
    elevationGainM: 430,
    trailColor: "Green",
    geometry: {
      type: "LineString",
      coordinates: [
        [19.9769, 49.2512],
        [19.9801, 49.2438],
        [19.9824, 49.2371],
        [19.9817, 49.2319],
      ],
    },
  },
  {
    id: "T01_004",
    groupId: "T.01",
    fromNodeId: "przel-miedzy-kopami",
    toNodeId: "kasprowy-wierch",
    name: "Przełęcz między Kopami – Kasprowy Wierch",
    gotPointsForward: 4,
    gotPointsBackward: 2,
    distanceKm: 2.1,
    elevationGainM: 310,
    trailColor: "Red",
    geometry: {
      type: "LineString",
      coordinates: [
        [20.0034, 49.2587],
        [19.9990, 49.2501],
        [19.9902, 49.2410],
        [19.9817, 49.2319],
      ],
    },
  },
];


export const SAMPLE_NODES: PttkNode[] = [
  { id: "kuznice", name: "Kuźnice", groupId: "T.01", coordinates: { lat: 49.2695, lng: 19.9814 } },
  { id: "przel-miedzy-kopami", name: "Przełęcz między Kopami", groupId: "T.01", coordinates: { lat: 49.2587, lng: 20.0034 } },
  { id: "myslenickie-turnie", name: "Myślenickie Turnie", groupId: "T.01", coordinates: { lat: 49.2512, lng: 19.9769 } },
  { id: "kasprowy-wierch", name: "Kasprowy Wierch", groupId: "T.01", coordinates: { lat: 49.2319, lng: 19.9817 } },
];
