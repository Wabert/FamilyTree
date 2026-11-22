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

// Linda had Emily and James with Mark, divorced him, then married Tom and had
// Sophie. Tom has a son, Sam, from his own earlier marriage to Carol.
const blended: Family = {
  name: "Blended",
  people: [
    { id: "gran", name: "Gran", gender: "female" },
    { id: "mark", name: "Mark", gender: "male" },
    { id: "linda", name: "Linda", gender: "female" },
    { id: "tom", name: "Tom", gender: "male" },
    { id: "carol", name: "Carol", gender: "female" },
    { id: "emily", name: "Emily", gender: "female", birthYear: 1988 },
    { id: "james", name: "James", gender: "male", birthYear: 1990 },
    { id: "sophie", name: "Sophie", gender: "female", birthYear: 2006 },
    { id: "sam", name: "Sam", gender: "male", birthYear: 1995 },
  ],
  parentLinks: [
    { parentId: "gran", childId: "linda" },
    { parentId: "mark", childId: "emily" },
    { parentId: "linda", childId: "emily" },
    { parentId: "mark", childId: "james" },
    { parentId: "linda", childId: "james" },
    { parentId: "linda", childId: "sophie" },
    { parentId: "tom", childId: "sophie" },
    { parentId: "tom", childId: "sam" },
    { parentId: "carol", childId: "sam" },
  ],
  spouseLinks: [
    { aId: "linda", bId: "tom", startYear: 2004 },
    { aId: "mark", bId: "linda", status: "divorced", startYear: 1986, endYear: 2001 },
    { aId: "tom", bId: "carol", status: "divorced" },
  ],
};

test("divorce and remarriage", () => {
  const idx = buildIndex(blended);
  const r = (me: string, other: string) => relationship(idx, me, other).label;
  assert.equal(r("linda", "mark"), "Ex-husband");
  assert.equal(r("mark", "linda"), "Ex-wife");
  assert.equal(r("linda", "tom"), "Husband");
  assert.equal(r("emily", "mark"), "Father");
  assert.equal(r("emily", "tom"), "Stepfather");
  assert.equal(r("tom", "emily"), "Stepdaughter");
  assert.equal(r("emily", "james"), "Brother");
  assert.equal(r("emily", "sophie"), "Half-sister");
  assert.equal(r("emily", "sam"), "Stepbrother");
  assert.equal(r("sam", "emily"), "Stepsister");
  assert.equal(r("sophie", "mark"), "Mother's ex-husband");
  assert.equal(r("gran", "mark"), "Daughter's ex-husband");
  assert.equal(r("gran", "tom"), "Son-in-law");
  assert.equal(r("mark", "gran"), "Ex-wife's mother");
});

test("a marriage ended by a death", () => {
  const family: Family = {
    name: "Widowed",
    people: [
      { id: "grandpa", name: "Grandpa", gender: "male", deathYear: 1999 },
      { id: "grandma", name: "Grandma", gender: "female" },
      { id: "bob", name: "Bob", gender: "male" },
      { id: "kid", name: "Kid" },
    ],
    parentLinks: [
      { parentId: "grandpa", childId: "kid" },
      { parentId: "grandma", childId: "kid" },
    ],
    spouseLinks: [
      { aId: "grandpa", bId: "grandma" },
      { aId: "grandma", bId: "bob", startYear: 2003 },
    ],
  };
  const idx = buildIndex(family);
  assert.equal(relationship(idx, "grandma", "grandpa").label, "Late husband");
  assert.equal(relationship(idx, "grandpa", "grandma").label, "Wife");
  assert.equal(relationship(idx, "grandma", "bob").label, "Husband");
  assert.equal(relationship(idx, "kid", "grandpa").label, "Father");
  assert.equal(relationship(idx, "kid", "bob").label, "Stepfather");
});

test("layout puts a remarried person between their former and current spouse", () => {
  const layout = computeLayout(blended);
  const x = (id: string) => layout.nodes.find((n) => n.id === id)!.x;
  assert.ok(x("mark") < x("linda") && x("linda") < x("tom"), "Mark, Linda, Tom from left to right");
  const line = (a: string, b: string) => layout.couples.find((c) => c.key === `${a}+${b}` || c.key === `${b}+${a}`);
  assert.equal(line("mark", "linda")?.divorced, true);
  assert.equal(line("linda", "tom")?.divorced, false);
  assert.match(line("mark", "linda")!.title, /Divorced · m\. 1986 · div\. 2001/);
  // Every couple line joins two people who really are a couple.
  const idx = buildIndex(blended);
  for (const c of layout.couples) {
    const [a, b] = c.key.split("+");
    assert.ok(idx.spousesOf(a).includes(b), `${c.key} should be a couple`);
  }
});

test("layout keeps a married-in spouse's other marriage beside them", () => {
  // David is the family member; Linda married in, divorced him, then married Tom.
  const family: Family = {
    name: "Married in",
    people: [
      { id: "walter", name: "Walter", gender: "male" },
      { id: "david", name: "David", gender: "male" },
      { id: "linda", name: "Linda", gender: "female" },
      { id: "tom", name: "Tom", gender: "male" },
      { id: "kid", name: "Kid" },
      { id: "sophie", name: "Sophie" },
    ],
    parentLinks: [
      { parentId: "walter", childId: "david" },
      { parentId: "david", childId: "kid" },
      { parentId: "linda", childId: "kid" },
      { parentId: "linda", childId: "sophie" },
      { parentId: "tom", childId: "sophie" },
    ],
    spouseLinks: [
      { aId: "david", bId: "linda", status: "divorced" },
      { aId: "linda", bId: "tom" },
    ],
  };
  const layout = computeLayout(family);
  const node = (id: string) => layout.nodes.find((n) => n.id === id)!;
  assert.equal(layout.nodes.length, family.people.length, "everyone placed once");
  assert.ok(node("david").x < node("linda").x && node("linda").x < node("tom").x, "David, Linda, Tom from left to right");
  assert.equal(node("tom").y, node("linda").y, "Tom on Linda's row");
  assert.deepEqual(layout.couples.map((c) => [c.key, c.divorced]), [["david+linda", true], ["linda+tom", false]]);
});

test("someone with only one parent entered is described through that parent", () => {
  // Uncle Dan married Benita; Eddie is listed only as Benita's son.
  const family: Family = {
    name: "One parent",
    people: [
      { id: "gran", name: "Gran", gender: "female" },
      { id: "mom", name: "Mom", gender: "female" },
      { id: "me", name: "Me" },
      { id: "dan", name: "Dan", gender: "male" },
      { id: "benita", name: "Benita", gender: "female" },
      { id: "eddie", name: "Eddie", gender: "male" },
      { id: "eddiekid", name: "Eddie's kid", gender: "female" },
      { id: "benitasmom", name: "Benita's mom", gender: "female" },
      { id: "loner", name: "Loner" },
    ],
    parentLinks: [
      { parentId: "gran", childId: "mom" },
      { parentId: "gran", childId: "dan" },
      { parentId: "mom", childId: "me" },
      { parentId: "benita", childId: "eddie" },
      { parentId: "eddie", childId: "eddiekid" },
      { parentId: "benitasmom", childId: "benita" },
    ],
    spouseLinks: [{ aId: "dan", bId: "benita" }],
  };
  const idx = buildIndex(family);
  const r = (other: string) => relationship(idx, "me", other);
  assert.equal(r("benita").label, "Aunt by marriage");
  assert.equal(r("eddie").label, "Son of aunt by marriage");
  assert.equal(r("eddie").phrase, "the son of your aunt by marriage");
  assert.equal(r("eddiekid").label, "Granddaughter of aunt by marriage");
  assert.equal(r("benitasmom").label, "Mother of aunt by marriage");
  assert.equal(r("loner").kind, "none");
  // Seen from Dan, Benita's son is his stepson, as before.
  assert.equal(relationship(idx, "dan", "eddie").label, "Stepson");
});

test("a child of only one of a couple gets its own, higher line", () => {
  const family: Family = {
    name: "One parent line",
    people: [
      { id: "benita", name: "Benita", gender: "female" },
      { id: "frank", name: "Frank", gender: "male" },
      { id: "lemuel", name: "Lemuel", birthYear: 1900 },
      { id: "eddie", name: "Eddie", birthYear: 1905 },
    ],
    parentLinks: [
      { parentId: "benita", childId: "lemuel" },
      { parentId: "frank", childId: "lemuel" },
      { parentId: "benita", childId: "eddie" },
    ],
    spouseLinks: [{ aId: "benita", bId: "frank" }],
  };
  const layout = computeLayout(family);
  const toLemuel = layout.paths.find((p) => p.key.endsWith(">lemuel"))!;
  const toEddie = layout.paths.find((p) => p.key.endsWith(">eddie"))!;
  assert.equal(toLemuel.otherFamily, false);
  assert.equal(toEddie.otherFamily, true);
  // The horizontal run is the "V<y>" before "H": Eddie's sits just above the shared one.
  const runY = (d: string) => Number(/V([\d.]+) H/.exec(d)![1]);
  assert.ok(runY(toEddie.d) < runY(toLemuel.d));
});

test("a second partner's children get their own, higher line", () => {
  // Frank & Benita have two children; Benita & Tbd have Eddie.
  const family: Family = {
    name: "Two partners",
    people: [
      { id: "frank", name: "Frank", gender: "male" },
      { id: "benita", name: "Benita", gender: "female" },
      { id: "tbd", name: "TBD", gender: "male" },
      { id: "lemuel", name: "Lemuel", birthYear: 1900 },
      { id: "gloria", name: "Gloria", birthYear: 1902 },
      { id: "eddie", name: "Eddie", birthYear: 1905 },
    ],
    parentLinks: [
      { parentId: "frank", childId: "lemuel" },
      { parentId: "benita", childId: "lemuel" },
      { parentId: "frank", childId: "gloria" },
      { parentId: "benita", childId: "gloria" },
      { parentId: "benita", childId: "eddie" },
      { parentId: "tbd", childId: "eddie" },
    ],
    spouseLinks: [
      { aId: "frank", bId: "benita" },
      { aId: "benita", bId: "tbd" },
    ],
  };
  const layout = computeLayout(family);
  const path = (id: string) => layout.paths.find((p) => p.key.endsWith(`>${id}`))!;
  assert.equal(path("lemuel").otherFamily, false);
  assert.equal(path("gloria").otherFamily, false);
  assert.equal(path("eddie").otherFamily, true);
  const runY = (d: string) => Number(/V([\d.]+) H/.exec(d)![1]);
  assert.ok(runY(path("eddie").d) < runY(path("lemuel").d));
});
