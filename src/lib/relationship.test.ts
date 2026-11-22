import assert from "node:assert/strict";
import { test } from "node:test";
import { buildIndex } from "./graph.ts";
import { computeLayout, CARD_W } from "./layout.ts";
import { relationship } from "./relationship.ts";
import { sampleFamily } from "./sample-family.ts";
import type { Family } from "./types.ts";

const index = buildIndex(sampleFamily);
const rel = (me: string, other: string) => relationship(index, me, other).label;

test("direct line", () => {
  assert.equal(rel("emily", "emily"), "You");
  assert.equal(rel("emily", "david"), "Father");
  assert.equal(rel("emily", "walter"), "Grandfather");
  assert.equal(rel("maya", "rose"), "Great-grandmother");
  assert.equal(rel("david", "emily"), "Daughter");
  assert.equal(rel("walter", "maya"), "Great-granddaughter");
});

test("siblings, aunts, uncles, nieces, nephews", () => {
  assert.equal(rel("emily", "james"), "Brother");
  assert.equal(rel("emily", "margaret"), "Aunt");
  assert.equal(rel("margaret", "emily"), "Niece");
  assert.equal(rel("maya", "david"), "Great-uncle");
  assert.equal(rel("david", "maya"), "Great-niece");
});

test("cousins", () => {
  assert.equal(rel("emily", "daniel"), "First cousin");
  assert.equal(rel("maya", "oliver"), "Second cousin");
  assert.equal(rel("maya", "emily"), "First cousin once removed");
  assert.equal(rel("emily", "maya"), "First cousin once removed");
  assert.deepEqual(
    relationship(index, "emily", "daniel").commonAncestorIds.sort(),
    ["rose", "walter"],
  );
});

test("relatives by marriage", () => {
  assert.equal(rel("emily", "marcus"), "Husband");
  assert.equal(rel("marcus", "david"), "Father-in-law");
  assert.equal(rel("marcus", "james"), "Brother-in-law");
  assert.equal(rel("james", "marcus"), "Brother-in-law");
  assert.equal(rel("linda", "marcus"), "Son-in-law");
  assert.equal(rel("emily", "thomas"), "Uncle by marriage");
  assert.equal(rel("rose", "marcus"), "Granddaughter's husband");
  assert.equal(rel("marcus", "daniel"), "Wife's first cousin");
  assert.equal(rel("priya", "marcus"), "Husband's first cousin's husband");
});

test("half-siblings, step-relatives and strangers", () => {
  const family: Family = {
    name: "Test",
    people: [
      { id: "mom", name: "Mom", gender: "female" },
      { id: "dad", name: "Dad", gender: "male" },
      { id: "stepdad", name: "Stepdad", gender: "male" },
      { id: "me", name: "Me" },
      { id: "half", name: "Half", gender: "female" },
      { id: "stranger", name: "Stranger" },
    ],
    parentLinks: [
      { parentId: "mom", childId: "me" },
      { parentId: "dad", childId: "me" },
      { parentId: "mom", childId: "half" },
      { parentId: "stepdad", childId: "half" },
    ],
    spouseLinks: [{ aId: "mom", bId: "stepdad" }],
  };
  const idx = buildIndex(family);
  assert.equal(relationship(idx, "me", "half").label, "Half-sister");
  assert.equal(relationship(idx, "me", "stepdad").label, "Stepfather");
  assert.equal(relationship(idx, "stepdad", "me").label, "Stepchild");
  assert.equal(relationship(idx, "me", "stranger").kind, "none");
});

test("layout places everyone once without overlaps", () => {
  const layout = computeLayout(sampleFamily);
  assert.equal(layout.nodes.length, sampleFamily.people.length);
  assert.equal(new Set(layout.nodes.map((n) => n.id)).size, sampleFamily.people.length);

  const rows = new Map<number, number[]>();
  for (const node of layout.nodes) {
    rows.set(node.y, [...(rows.get(node.y) ?? []), node.x]);
  }
  assert.equal(rows.size, 4, "four generations");
  for (const xs of rows.values()) {
    xs.sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) {
      assert.ok(xs[i] - xs[i - 1] >= CARD_W, "cards in a row do not overlap");
    }
  }

  // One line from parents to each of the 14 people who have parents in the tree.
  assert.equal(layout.paths.length, 14);
  assert.ok(layout.paths.every((p) => !p.dashed));
});
