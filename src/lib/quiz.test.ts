import assert from "node:assert/strict";
import { test } from "node:test";
import { buildIndex } from "./graph.ts";
import { buildQuiz } from "./quiz.ts";
import { relationship } from "./relationship.ts";
import { sampleFamily } from "./sample-family.ts";
import type { Family } from "./types.ts";

/** A repeatable stand-in for Math.random, so a failing round can be replayed. */
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const withPhotos: Family = {
  ...sampleFamily,
  people: sampleFamily.people.map((p) => ({ ...p, photo: `data:image/png;base64,${p.id}` })),
};

const rounds = (family: Family, meId: string | null) => {
  const index = buildIndex(family);
  return Array.from({ length: 40 }, (_, seed) => buildQuiz(index, meId, 10, seeded(seed + 1))).map((questions) => ({
    index,
    questions,
  }));
};

test("every question has four different choices and one of them is right", () => {
  for (const meId of ["emily", null]) {
    for (const { questions } of rounds(withPhotos, meId)) {
      assert.equal(questions.length, 10);
      for (const q of questions) {
        assert.equal(q.options.length, 4, q.prompt);
        assert.equal(new Set(q.options.map((o) => o.key)).size, 4, q.prompt);
        assert.equal(new Set(q.options.map((o) => o.label)).size, 4, q.prompt);
        assert.ok(q.options.some((o) => o.key === q.answer), q.prompt);
      }
    }
  }
});

test("a round does not ask the same thing twice", () => {
  for (const { questions } of rounds(withPhotos, "emily")) {
    const asked = questions.map((q) => `${q.kind}:${q.subjectId}`);
    assert.equal(new Set(asked).size, asked.length);
    // The sample family is big enough that nobody needs to come up twice.
    assert.equal(new Set(questions.map((q) => q.subjectId)).size, questions.length);
  }
});

test("without knowing who you are, nothing asks how people are related to you", () => {
  for (const { questions } of rounds(withPhotos, null)) {
    for (const q of questions) assert.ok(q.kind === "face" || q.kind === "parent", q.kind);
  }
});

test("without photos there are no face questions, and you are never the subject", () => {
  for (const { questions } of rounds(sampleFamily, "emily")) {
    assert.equal(questions.length, 10);
    for (const q of questions) {
      assert.notEqual(q.kind, "face");
      assert.notEqual(q.subjectId, "emily");
    }
  }
});

test("face questions show someone with a photo and do not put pictures on the choices", () => {
  const somePhotos: Family = {
    ...sampleFamily,
    people: sampleFamily.people.map((p, i) => (i % 3 === 0 ? { ...p, photo: "data:image/png;base64,x" } : p)),
  };
  let seen = 0;
  for (const { index, questions } of rounds(somePhotos, null)) {
    for (const q of questions.filter((q) => q.kind === "face")) {
      seen++;
      assert.ok(index.byId.get(q.subjectId)?.photo);
      assert.ok(q.options.every((o) => o.personId === undefined));
    }
  }
  assert.ok(seen > 0);
});

test("relationship questions have exactly one right answer", () => {
  for (const { index, questions } of rounds(withPhotos, "emily")) {
    for (const q of questions) {
      if (q.kind === "relation") {
        assert.equal(q.answer, relationship(index, "emily", q.subjectId).label);
      }
      if (q.kind === "who") {
        const right = relationship(index, "emily", q.answer).label;
        for (const o of q.options) {
          if (o.key !== q.answer) assert.notEqual(relationship(index, "emily", o.key).label, right, q.prompt);
        }
        assert.ok(q.options.every((o) => o.key !== "emily"));
      }
    }
  }
});

test("parent questions offer one real parent and nobody else's", () => {
  for (const { index, questions } of rounds(sampleFamily, null)) {
    for (const q of questions) {
      assert.equal(q.kind, "parent");
      const parents = index.parentsOf(q.subjectId);
      assert.ok(parents.includes(q.answer));
      assert.equal(q.options.filter((o) => parents.includes(o.key)).length, 1, q.prompt);
      assert.ok(q.options.every((o) => o.key !== q.subjectId));
    }
  }
});

test("a small tree gives a short round, and an empty one gives none", () => {
  assert.deepEqual(buildQuiz(buildIndex({ name: "", people: [], parentLinks: [], spouseLinks: [] }), null), []);

  // Two parents and two children: too few people for three wrong answers.
  const tiny: Family = {
    name: "Tiny",
    people: [
      { id: "a", name: "Ann" },
      { id: "b", name: "Bob" },
      { id: "c", name: "Cat" },
      { id: "d", name: "Dan" },
    ],
    parentLinks: [
      { parentId: "a", childId: "c" },
      { parentId: "b", childId: "c" },
      { parentId: "a", childId: "d" },
      { parentId: "b", childId: "d" },
    ],
    spouseLinks: [{ aId: "a", bId: "b" }],
  };
  assert.deepEqual(buildQuiz(buildIndex(tiny), null, 10, seeded(7)), []);
  // Knowing who you are, "how is Ann related to you?" still works, with stock wrong answers.
  const asMe = buildQuiz(buildIndex(tiny), "c", 10, seeded(7));
  assert.ok(asMe.length > 0 && asMe.length < 10);
  assert.ok(asMe.every((q) => q.kind === "relation"));
});
