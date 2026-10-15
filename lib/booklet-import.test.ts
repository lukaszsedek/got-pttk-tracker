import assert from "node:assert/strict";
import { test } from "node:test";
import { matchLine, parseBookletText, prepareSegments } from "./booklet-import";
import type { SegmentRow } from "@/types/pttk";

const seg = (id: string, name: string, pf: number, pb: number): SegmentRow =>
  ({ id, name, regionName: "TATRY", groupId: "T.02", gotPointsForward: pf, gotPointsBackward: pb, geometry: null }) as unknown as SegmentRow;

test("parseBookletText: daty, punkty, nagłówki", () => {
  const rows = parseBookletText("Data;Region;Odcinek\n12.06.2021; Kuźnice – Nosal; 4\n2021-07-03 Roma - Dolina Białego 2 pkt\nRazem;;10");
  assert.equal(rows.length, 2);
  assert.equal(rows[0].date, "2021-06-12");
  assert.equal(rows[0].points, 4);
  assert.equal(rows[1].date, "2021-07-03");
  assert.equal(rows[1].points, 2);
});

test("matchLine: kierunek z kolejności nazw i z punktów", () => {
  const prep = prepareSegments([seg("a", "Roma – Dolina Białego", 2, 1), seg("b", "Gronik – Roma", 3, 3)]);
  const [fwd] = matchLine(parseBookletText("Roma - Dolina Białego")[0], prep);
  assert.equal(fwd.segment.id, "a");
  assert.equal(fwd.direction, "forward");
  const [back] = matchLine(parseBookletText("Dolina Białego - Roma")[0], prep);
  assert.equal(back.direction, "backward");
});
