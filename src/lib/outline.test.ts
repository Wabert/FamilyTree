import assert from "node:assert/strict";
import { test } from "node:test";
import { buildOutline } from "./outline.ts";
import { sampleFamily } from "./sample-family.ts";
import type { Family } from "./types.ts";

test("outline lists everyone once, couples on one line, children indented", () => {
  const rows = buildOutline(sampleFamily);
  const everyone = rows.flatMap((r) => [r.id, ...r.spouseIds]);
  assert.equal(everyone.length, sampleFamily.people.length);
  assert.equal(new Set(everyone).size, sampleFamily.people.length);

  // The top couple lists the wife first; below that, the blood relative comes first.
  assert.deepEqual(rows[0], { id: "rose", spouseIds: ["walter"], depth: 0 });
  assert.deepEqual(
    rows.find((r) => r.id === "david"),
    { id: "david", spouseIds: ["linda"], depth: 1 },
  );
  assert.deepEqual(rows[1], { id: "margaret", spouseIds: ["thomas"], depth: 1 });
  assert.deepEqual(rows[2], { id: "daniel", spouseIds: ["priya"], depth: 2 });
  assert.deepEqual(rows[3], { id: "maya", spouseIds: [], depth: 3 });
  assert.equal(rows.filter((r) => r.depth === 0).length, 1);
  assert.equal(Math.max(...rows.map((r) => r.depth)), 3);
});

test("outline copes with unconnected people and loops", () => {
  const family: Family = {
    name: "Odd",
    people: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
      { id: "loner", name: "Loner" },
    ],
    parentLinks: [
      { parentId: "a", childId: "b" },
      { parentId: "b", childId: "a" },
    ],
    spouseLinks: [],
  };
  const rows = buildOutline(family);
  assert.deepEqual(rows.map((r) => r.id).sort(), ["a", "b", "loner"]);
});
