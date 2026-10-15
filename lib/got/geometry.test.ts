import assert from "node:assert/strict";
import { test } from "node:test";
import { buildRecordGeometries, toPlaces } from "./build-geometry";
import { buildGraph } from "./graph";
import { nameMatchScore } from "./names";
import type { OsmElement } from "./osm";
import type { GotRecord } from "./types";

const way = (id: number, pts: [number, number][], tags: Record<string, string> = { highway: "path" }): OsmElement => ({
  type: "way",
  id,
  tags,
  geometry: pts.map(([lon, lat]) => ({ lat, lon })),
});
const node = (id: number, name: string, lon: number, lat: number, tags: Record<string, string>): OsmElement => ({
  type: "node",
  id,
  lat,
  lon,
  tags: { name, ...tags },
});
const rel = (id: number, colour: string, wayIds: number[], hw: OsmElement[]): OsmElement => ({
  type: "relation",
  id,
  tags: { route: "hiking", type: "route", colour },
  members: wayIds.map((ref) => ({
    type: "way",
    ref,
    role: "",
    geometry: hw.find((w) => w.id === ref)!.geometry,
  })),
});
const rec = (over: Partial<GotRecord>): GotRecord => ({
  id: "t:1:1",
  groupCode: "T.01",
  regionName: "TEST",
  sourcePage: "t.html",
  destination: "Przełęcz",
  origin: "Kuźnic",
  trailColors: [],
  unmarked: false,
  pointsForward: 3,
  pointsBackward: 2,
  pointsRaw: "3/2",
  kind: "edge",
  rawName: "z Kuźnic",
  ...over,
});

test("nazwy: fleksja i dokładne dopasowanie", () => {
  assert.equal(nameMatchScore("Dolin Filipka", "Dolina Filipka"), 1);
  assert.equal(nameMatchScore("Wierchu Porońca (1036 m)", "Wierch Poroniec"), 1);
  assert.equal(nameMatchScore("Kuźnice", "Kuźnice"), 2);
  assert.equal(nameMatchScore("Kuźnic", "Kuźnice"), 1);
  assert.equal(nameMatchScore("Kuźnice", "Kuźnice Zakopane Dworzec Główny"), 0);
  assert.equal(nameMatchScore("Giewont", "Kasprowy Wierch"), 0);
});

test("trasa wybiera właściwy kolor, nawet gdy jest dłuższa; kierunek origin→destination", () => {
  // A(0,0) -> B(0.02,0): niebieski prosto (krótki), zielony łukiem (dłuższy).
  const blue = way(1, [[0, 0], [0.01, 0], [0.02, 0]]);
  const green = way(2, [[0, 0], [0.01, 0.01], [0.02, 0]]);
  const hw = [blue, green];
  const routes = [rel(10, "blue", [1], hw), rel(11, "green", [2], hw)];
  const graph = buildGraph(hw, routes);
  const places = toPlaces([
    node(100, "Kuźnice", 0, 0, { place: "locality" }),
    node(101, "Przełęcz", 0.02, 0, { natural: "saddle" }),
  ]);

  const { results } = buildRecordGeometries(
    [rec({ id: "g", trailColors: ["Green"] }), rec({ id: "b", trailColors: ["Blue"] })],
    places,
    graph,
  );
  const g = results.find((r) => r.id === "g")!;
  const b = results.find((r) => r.id === "b")!;
  assert.equal(g.status, "ok");
  assert.equal(b.status, "ok");
  assert.ok(g.distanceKm! > b.distanceKm!, "zielony łukiem jest dłuższy");
  assert.deepEqual(g.coordinates![0], [0, 0]); // zaczyna w origin
  assert.deepEqual(g.coordinates!.at(-1), [0.02, 0]); // kończy w destination
  assert.equal(g.coordinates!.length, 3);
});

test("braki: nieznana nazwa i brak połączenia", () => {
  const w1 = way(1, [[0, 0], [0.01, 0]]);
  const w2 = way(2, [[0.5, 0.5], [0.51, 0.5]]); // odłączona składowa
  const graph = buildGraph([w1, w2], []);
  const places = toPlaces([
    node(100, "Kuźnice", 0, 0, { place: "locality" }),
    node(101, "Przełęcz", 0.51, 0.5, { natural: "saddle" }),
  ]);
  const { results } = buildRecordGeometries(
    [rec({ id: "np" }), rec({ id: "nf", destination: "Nieistniejące" })],
    places,
    graph,
  );
  assert.equal(results.find((r) => r.id === "np")!.status, "no-path");
  assert.equal(results.find((r) => r.id === "nf")!.status, "destination-not-found");
});

test("przycina niezaznakowane dojścia do szlaku", () => {
  // A --(bez znaków)-- B --(niebieski)-- C --(bez znaków)-- D
  const hw = [
    way(1, [[0, 0], [0.005, 0]]),
    way(2, [[0.005, 0], [0.01, 0], [0.015, 0]]),
    way(3, [[0.015, 0], [0.02, 0]]),
  ];
  const graph = buildGraph(hw, [rel(10, "blue", [2], hw)]);
  const places = toPlaces([
    node(100, "Kuźnice", 0, 0, { place: "locality" }),
    node(101, "Przełęcz", 0.02, 0, { natural: "saddle" }),
  ]);
  const { results } = buildRecordGeometries([rec({ id: "x", trailColors: ["Blue"] })], places, graph);
  const r = results[0];
  assert.equal(r.status, "ok");
  assert.deepEqual(r.coordinates![0], [0.005, 0]);
  assert.deepEqual(r.coordinates!.at(-1), [0.015, 0]);
});

test("alternatywne nazwy (name:pl) są używane do dopasowania", () => {
  const places = toPlaces([node(1, "Štrbské pleso", 20.05, 49.12, { place: "locality", "name:pl": "Szczyrbskie Jezioro" })]);
  assert.ok(places.some((p) => p.name === "Szczyrbskie Jezioro"));
});
