import assert from "node:assert/strict";
import { test } from "node:test";
import { branchOf, buildIndex, headOf, subFamily } from "./graph.ts";
import { sampleFamily } from "./sample-family.ts";
import type { Family } from "./types.ts";

test("a branch is the direct line up to the couple at the top", () => {
  const index = buildIndex(sampleFamily);
  // Maya → Daniel → Margaret → Walter & Rose: no spouses on the way, no children.
  assert.deepEqual([...branchOf(index, "maya")].sort(), ["daniel", "margaret", "maya", "rose", "walter"].sort());
  assert.deepEqual([...branchOf(index, "daniel")].sort(), ["daniel", "margaret", "rose", "walter"].sort());
  // A child of the top couple: just them under the couple.
  assert.deepEqual([...branchOf(index, "david")].sort(), ["david", "rose", "walter"].sort());
  // Someone at the top: them and their spouse.
  assert.deepEqual([...branchOf(index, "walter")].sort(), ["rose", "walter"].sort());
});

test("a branch follows the parent whose family goes back further", () => {
  const family: Family = {
    name: "Two sides",
    people: ["gp", "gm", "dad", "mom", "kid"].map((id) => ({ id, name: id })),
    parentLinks: [
      { parentId: "gp", childId: "mom" },
      { parentId: "gm", childId: "mom" },
      { parentId: "dad", childId: "kid" },
      { parentId: "mom", childId: "kid" },
    ],
    spouseLinks: [
      { aId: "gp", bId: "gm" },
      { aId: "dad", bId: "mom" },
    ],
  };
  assert.deepEqual([...branchOf(buildIndex(family), "kid")].sort(), ["gm", "gp", "kid", "mom"]);
});

test("the trimmed family keeps only links between the people in it", () => {
  const index = buildIndex(sampleFamily);
  const small = subFamily(sampleFamily, branchOf(index, "maya"));
  const ids = new Set(small.people.map((p) => p.id));
  for (const l of small.parentLinks) assert.ok(ids.has(l.parentId) && ids.has(l.childId));
  for (const l of small.spouseLinks) assert.ok(ids.has(l.aId) && ids.has(l.bId));
  assert.equal(small.spouseLinks.length, 1);
});

test("a tree head is the person and spouse on top, with everyone below them", () => {
  const index = buildIndex(sampleFamily);
  const head = headOf(index, "margaret");
  assert.deepEqual(
    [...head].sort(),
    ["daniel", "grace", "leo", "margaret", "maya", "priya", "thomas"].sort(),
  );
  // Not their parents, siblings, or the siblings' families.
  for (const id of ["walter", "rose", "david", "susan", "emily"]) assert.ok(!head.has(id), id);
});
