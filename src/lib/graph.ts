import type { Family, Person, SpouseLink } from "./types";

export interface FamilyIndex {
  byId: Map<string, Person>;
  parentsOf(id: string): string[];
  childrenOf(id: string): string[];
  spousesOf(id: string): string[];
  /** The link between two spouses, with its status and years. */
  marriage(a: string, b: string): SpouseLink | undefined;
}

const EMPTY: string[] = [];

function push(map: Map<string, string[]>, key: string, value: string) {
  const list = map.get(key);
  if (!list) map.set(key, [value]);
  else if (!list.includes(value)) list.push(value);
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Lookup tables over a family. Links that point at missing people are ignored. */
export function buildIndex(family: Family): FamilyIndex {
  const byId = new Map(family.people.map((p) => [p.id, p]));
  const parents = new Map<string, string[]>();
  const children = new Map<string, string[]>();
  const spouses = new Map<string, string[]>();
  const marriages = new Map<string, SpouseLink>();

  for (const { parentId, childId } of family.parentLinks) {
    if (parentId === childId || !byId.has(parentId) || !byId.has(childId)) continue;
    push(parents, childId, parentId);
    push(children, parentId, childId);
  }
  for (const link of family.spouseLinks) {
    const { aId, bId } = link;
    if (aId === bId || !byId.has(aId) || !byId.has(bId)) continue;
    push(spouses, aId, bId);
    push(spouses, bId, aId);
    marriages.set(pairKey(aId, bId), link);
  }

  return {
    byId,
    parentsOf: (id) => parents.get(id) ?? EMPTY,
    childrenOf: (id) => children.get(id) ?? EMPTY,
    spousesOf: (id) => spouses.get(id) ?? EMPTY,
    marriage: (a, b) => marriages.get(pairKey(a, b)),
  };
}

/** Everyone below `id` in the tree (not including `id`). */
export function descendantsOf(index: FamilyIndex, id: string): Set<string> {
  const seen = new Set<string>();
  const queue = [...index.childrenOf(id)];
  while (queue.length) {
    const next = queue.pop()!;
    if (seen.has(next)) continue;
    seen.add(next);
    queue.push(...index.childrenOf(next));
  }
  return seen;
}

/**
 * A sort for people's ids: oldest first. People without a birth year keep the
 * order they were added, so rows never reshuffle.
 */
export function oldestFirst(index: FamilyIndex): (a: string, b: string) => number {
  const added = new Map([...index.byId.keys()].map((id, i) => [id, i]));
  return (a, b) =>
    (index.byId.get(a)?.birthYear ?? Infinity) - (index.byId.get(b)?.birthYear ?? Infinity) ||
    (added.get(a) ?? 0) - (added.get(b) ?? 0);
}

export function siblingsOf(index: FamilyIndex, id: string): string[] {
  const result: string[] = [];
  for (const parentId of index.parentsOf(id)) {
    for (const childId of index.childrenOf(parentId)) {
      if (childId !== id && !result.includes(childId)) result.push(childId);
    }
  }
  return result;
}

/**
 * The line that leads down to `id`: every ancestor up to the oldest in the
 * tree, `id` themselves, their spouses and their children. Aunts, uncles,
 * cousins and the rest of the tree are left out.
 */
export function branchOf(index: FamilyIndex, id: string): Set<string> {
  const keep = new Set<string>([id]);
  const queue = [...index.parentsOf(id)];
  while (queue.length) {
    const next = queue.pop()!;
    if (keep.has(next)) continue;
    keep.add(next);
    queue.push(...index.parentsOf(next));
  }
  for (const s of index.spousesOf(id)) keep.add(s);
  for (const c of index.childrenOf(id)) keep.add(c);
  return keep;
}

/** Just the given people, and only the links between them. */
export function subFamily(family: Family, keep: Set<string>): Family {
  return {
    ...family,
    people: family.people.filter((p) => keep.has(p.id)),
    parentLinks: family.parentLinks.filter((l) => keep.has(l.parentId) && keep.has(l.childId)),
    spouseLinks: family.spouseLinks.filter((l) => keep.has(l.aId) && keep.has(l.bId)),
  };
}

/**
 * `id` at the head of the tree: them and their spouses on top, and everyone
 * descended from them below, with those descendants' spouses beside them.
 */
export function headOf(index: FamilyIndex, id: string): Set<string> {
  const below = descendantsOf(index, id);
  const keep = new Set<string>([id, ...below]);
  for (const person of [id, ...below]) for (const s of index.spousesOf(person)) keep.add(s);
  return keep;
}
