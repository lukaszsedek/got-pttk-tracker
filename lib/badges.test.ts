import assert from "node:assert/strict";
import { test } from "node:test";
import { cycleStatus, dayWarnings, scoreEntries, type ScoreEntry } from "./badges";

const e = (day: string, points: number, foreign = false): ScoreEntry => ({ day, points, foreign });

test("limit 50 pkt/dzień", () => {
  const s = scoreEntries([e("2024-06-01", 40), e("2024-06-01", 30), e("2024-06-02", 10)]);
  assert.equal(s.domestic, 60);
  assert.equal(s.lostToDailyCap, 20);
  assert.deepEqual(dayWarnings([e("2024-06-01", 70)]), [{ day: "2024-06-01", points: 70, lost: 20 }]);
});

test("bez zdobytych odznak: pierwsza norma to popularna 60", () => {
  const st = cycleStatus([e("2023-05-01", 40), e("2023-06-01", 30)], []);
  assert.equal(st.next?.id, "popularna");
  assert.equal(st.have, 70);
  assert.equal(st.ready, true);
});

test("zagraniczne ≤ 50% normy", () => {
  const st = cycleStatus([e("2023-05-01", 50, true), e("2023-06-01", 50, true)], []);
  assert.equal(st.have, 30); // 50% z 60
});

test("po zdobyciu popularnej: nadwyżka ≤ 50% następnej normy + punkty z późniejszych lat", () => {
  const st = cycleStatus(
    [e("2022-05-01", 50), e("2022-06-01", 50), e("2022-07-01", 50), e("2023-06-01", 25)],
    [{ badgeId: "popularna", earnedYear: 2022 }],
  );
  // 2022: 150 pkt (limit dzienny nie zmienia), norma 60 → nadwyżka 90, cap 50% z 120 = 60; + 25 z 2023
  assert.equal(st.next?.id, "mala-brazowa");
  assert.equal(st.have, 85);
  assert.equal(st.earliestYear, 2022); // popularna → mała brązowa w tym samym roku
});

test("mała brązowa → srebrna: najwcześniej w następnym roku", () => {
  const st = cycleStatus([e("2022-05-01", 10)], [
    { badgeId: "popularna", earnedYear: 2021 },
    { badgeId: "mala-brazowa", earnedYear: 2022 },
  ]);
  assert.equal(st.next?.id, "mala-srebrna");
  assert.equal(st.earliestYear, 2023);
});
