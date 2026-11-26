import assert from "node:assert/strict";
import { test } from "node:test";
import { branchOf, buildIndex, headOf, subFamily } from "./graph.ts";
import { sampleFamily } from "./sample-family.ts";

test("a branch is the line up to the oldest generation, plus spouse and children", () => {
  const index = buildIndex(sampleFamily);
  const branch = branchOf(index, "daniel");
  assert.deepEqual(
    [...branch].sort(),
    ["daniel", "leo", "margaret", "maya", "priya", "rose", "thomas", "walter"].sort(),
  );
  // No aunts, uncles, siblings or cousins.
  for (const id of ["david", "susan", "grace", "emily", "nora"]) assert.ok(!branch.has(id), id);
});

test("the trimmed family keeps only links between the people in it", () => {
  const index = buildIndex(sampleFamily);
  const small = subFamily(sampleFamily, branchOf(index, "james"));
  const ids = new Set(small.people.map((p) => p.id));
  assert.deepEqual([...ids].sort(), ["david", "james", "linda", "rose", "walter"].sort());
  for (const l of small.parentLinks) assert.ok(ids.has(l.parentId) && ids.has(l.childId));
  for (const l of small.spouseLinks) assert.ok(ids.has(l.aId) && ids.has(l.bId));
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
