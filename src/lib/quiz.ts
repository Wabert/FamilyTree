import type { Gender, Person } from "./types";
import type { FamilyIndex } from "./graph";
import { relationship, type Relationship } from "./relationship.ts";

/**
 * The four kinds of question:
 * - face: a photo, pick the name.
 * - relation: a person, pick how they are related to you.
 * - who: a relationship ("your great-aunt"), pick the person.
 * - parent: a person, pick their mother or father.
 * The first needs photos and the middle two need to know who you are; the last
 * works for any tree, so there is always something to ask.
 */
export type QuizKind = "face" | "relation" | "who" | "parent";

export interface QuizOption {
  key: string;
  label: string;
  /** Set when the choice is a person, so their picture can sit beside the name. */
  personId?: string;
}

export interface QuizQuestion {
  kind: QuizKind;
  /** Who the question is about: the face shown, or the person named in it. */
  subjectId: string;
  prompt: string;
  options: QuizOption[];
  /** The key of the right option. */
  answer: string;
  /** Shown once they have answered, right or wrong: "Margaret Okafor is your aunt." */
  reveal: string;
  /** The person to look up afterwards (the right answer, when the choices are people). */
  answerPersonId: string;
}

export const QUIZ_LENGTH = 10;
const CHOICES = 4;

type Random = () => number;

function shuffled<T>(items: readonly T[], random: Random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Relationship words to fall back on when the tree is too small to supply three wrong answers. */
const STOCK_LABELS: Record<Gender | "any", string[]> = {
  male: ["Father", "Grandfather", "Brother", "Uncle", "Son", "Nephew", "First cousin", "Brother-in-law"],
  female: ["Mother", "Grandmother", "Sister", "Aunt", "Daughter", "Niece", "First cousin", "Sister-in-law"],
  other: ["Parent", "Grandparent", "Sibling", "Child", "First cousin", "Second cousin"],
  any: ["Parent", "Grandparent", "Sibling", "Child", "First cousin", "Second cousin"],
};

const sameName = (a: Person, b: Person) => a.name.trim().toLowerCase() === b.name.trim().toLowerCase();

/**
 * Wrong answers that are people: the ones most like `like` (same gender, born
 * around the same time) so the right answer does not stand out, with a little
 * shuffling so the same faces do not come up every round. Gender outweighs any
 * age gap: a man among the choices for "your grandmother" rules himself out.
 */
function similarPeople(pool: Person[], like: Person, random: Random): Person[] {
  const distance = (p: Person) =>
    (p.gender && like.gender && p.gender !== like.gender ? 1000 : 0) +
    (p.birthYear && like.birthYear ? Math.abs(p.birthYear - like.birthYear) : 25);
  const ranked = shuffled(pool, random).sort((a, b) => distance(a) - distance(b));
  // Pick from the closest handful, not always the closest three.
  const picked = shuffled(ranked.slice(0, (CHOICES - 1) * 2), random).slice(0, CHOICES - 1);
  // Two people with the same name would make two identical buttons.
  const unique: Person[] = [];
  for (const p of [...picked, ...ranked]) {
    if (unique.length === CHOICES - 1) break;
    if (!sameName(p, like) && !unique.some((u) => u.id === p.id || sameName(u, p))) unique.push(p);
  }
  return unique;
}

const personOption = (p: Person): QuizOption => ({ key: p.id, label: p.name, personId: p.id });

interface Context {
  index: FamilyIndex;
  people: Person[];
  /** How everyone is related to you; empty when the quiz does not know who you are. */
  relations: Map<string, Relationship>;
  random: Random;
}

const related = (r: Relationship | undefined): r is Relationship => !!r && (r.kind === "blood" || r.kind === "marriage");

function faceQuestion({ people, relations, random }: Context, subject: Person): QuizQuestion | null {
  const wrong = similarPeople(people.filter((p) => p.id !== subject.id), subject, random);
  if (wrong.length < CHOICES - 1) return null;
  const relation = relations.get(subject.id);
  return {
    kind: "face",
    subjectId: subject.id,
    prompt: "Who is this?",
    // Names only: a picture beside each name would give the answer away.
    options: shuffled([subject, ...wrong], random).map((p) => ({ key: p.id, label: p.name })),
    answer: subject.id,
    reveal: related(relation) ? `This is ${subject.name}, ${relation.phrase}.` : `This is ${subject.name}.`,
    answerPersonId: subject.id,
  };
}

function relationQuestion({ people, relations, random }: Context, subject: Person): QuizQuestion | null {
  const relation = relations.get(subject.id);
  if (!related(relation)) return null;
  const labelsOf = (pool: Person[]) =>
    pool.flatMap((p) => {
      const r = relations.get(p.id);
      return related(r) ? [r.label] : [];
    });
  // Wrong answers that could fit someone of the same gender come first.
  const sameGender = people.filter((p) => p.id !== subject.id && p.gender === subject.gender);
  const candidates = [
    ...shuffled(labelsOf(sameGender), random),
    ...shuffled(labelsOf(people), random),
    ...shuffled(STOCK_LABELS[subject.gender ?? "any"], random),
  ];
  const wrong: string[] = [];
  for (const label of candidates) {
    if (wrong.length === CHOICES - 1) break;
    if (label !== relation.label && !wrong.includes(label)) wrong.push(label);
  }
  if (wrong.length < CHOICES - 1) return null;
  return {
    kind: "relation",
    subjectId: subject.id,
    prompt: `How is ${subject.name} related to you?`,
    options: shuffled([relation.label, ...wrong], random).map((label) => ({ key: label, label })),
    answer: relation.label,
    reveal: `${subject.name} is ${relation.phrase}.`,
    answerPersonId: subject.id,
  };
}

function whoQuestion({ people, relations, random }: Context, subject: Person, meId: string): QuizQuestion | null {
  const relation = relations.get(subject.id);
  if (!related(relation)) return null;
  // Anyone who is also "your first cousin" would be a second right answer.
  const pool = people.filter((p) => p.id !== meId && relations.get(p.id)?.label !== relation.label);
  const wrong = similarPeople(pool, subject, random);
  if (wrong.length < CHOICES - 1) return null;
  return {
    kind: "who",
    subjectId: subject.id,
    prompt: `Which of these is ${relation.phrase}?`,
    options: shuffled([subject, ...wrong], random).map(personOption),
    answer: subject.id,
    reveal: `${subject.name} is ${relation.phrase}.`,
    answerPersonId: subject.id,
  };
}

function parentQuestion({ index, people, random }: Context, child: Person): QuizQuestion | null {
  const parentIds = index.parentsOf(child.id);
  if (!parentIds.length) return null;
  const parent = index.byId.get(parentIds[Math.floor(random() * parentIds.length)]);
  if (!parent) return null;
  const pool = people.filter((p) => p.id !== child.id && !parentIds.includes(p.id));
  const wrong = similarPeople(pool, parent, random);
  if (wrong.length < CHOICES - 1) return null;
  const word = parent.gender === "male" ? "father" : parent.gender === "female" ? "mother" : "parent";
  return {
    kind: "parent",
    subjectId: child.id,
    prompt: `Who is ${child.name}’s ${word}?`,
    options: shuffled([parent, ...wrong], random).map(personOption),
    answer: parent.id,
    reveal: `${parent.name} is ${child.name}’s ${word}.`,
    answerPersonId: parent.id,
  };
}

/**
 * A round of questions about this family, mixed across the kinds the tree can
 * support. `meId` unlocks the "related to you" questions. Returns fewer than
 * `count` (down to none) when the tree is too small to ask that many.
 */
export function buildQuiz(
  index: FamilyIndex,
  meId: string | null,
  count = QUIZ_LENGTH,
  random: Random = Math.random,
): QuizQuestion[] {
  const people = [...index.byId.values()];
  const me = meId && index.byId.has(meId) ? meId : null;
  const relations = new Map<string, Relationship>();
  if (me) for (const p of people) relations.set(p.id, relationship(index, me, p.id));
  const context: Context = { index, people, relations, random };

  const others = people.filter((p) => p.id !== me);
  const makers: Record<QuizKind, (subject: Person) => QuizQuestion | null> = {
    face: (p) => (p.photo ? faceQuestion(context, p) : null),
    relation: (p) => relationQuestion(context, p),
    who: (p) => (me ? whoQuestion(context, p, me) : null),
    parent: (p) => parentQuestion(context, p),
  };
  // Your own parents are not much of a question; ask about everyone else's.
  const subjects: Record<QuizKind, Person[]> = {
    face: shuffled(others, random),
    relation: shuffled(others, random),
    who: shuffled(others, random),
    parent: shuffled(others, random),
  };

  const questions: QuizQuestion[] = [];
  const asked = new Set<string>();
  // Take turns between the kinds. First time round nobody is asked about twice;
  // if that leaves the round short, the same person may come up in another kind.
  for (const allowRepeats of [false, true]) {
    let added = true;
    while (added && questions.length < count) {
      added = false;
      for (const kind of shuffled(Object.keys(makers) as QuizKind[], random)) {
        if (questions.length >= count) break;
        const queue = subjects[kind];
        for (let i = 0; i < queue.length; i++) {
          const subject = queue[i];
          if (!allowRepeats && asked.has(subject.id)) continue;
          queue.splice(i, 1);
          i--;
          const question = makers[kind](subject);
          if (!question) continue;
          questions.push(question);
          asked.add(subject.id);
          added = true;
          break;
        }
      }
    }
  }
  return questions;
}
