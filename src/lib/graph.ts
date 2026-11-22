import type { Family, Person } from "./types";

export interface FamilyIndex {
  byId: Map<string, Person>;
  parentsOf(id: string): string[];
  childrenOf(id: string): string[];
  spousesOf(id: string): string[];
}

const EMPTY: string[] = [];

function push(map: Map<string, string[]>, key: string, value: string) {
  const list = map.get(key);
  if (!list) map.set(key, [value]);
  else if (!list.includes(value)) list.push(value);
}

/** Lookup tables over a family. Links that point at missing people are ignored. */
export function buildIndex(family: Family): FamilyIndex {
  const byId = new Map(family.people.map((p) => [p.id, p]));
  const parents = new Map<string, string[]>();
  const children = new Map<string, string[]>();
  const spouses = new Map<string, string[]>();

  for (const { parentId, childId } of family.parentLinks) {
    if (parentId === childId || !byId.has(parentId) || !byId.has(childId)) continue;
    push(parents, childId, parentId);
    push(children, parentId, childId);
  }
  for (const { aId, bId } of family.spouseLinks) {
    if (aId === bId || !byId.has(aId) || !byId.has(bId)) continue;
    push(spouses, aId, bId);
    push(spouses, bId, aId);
  }

  return {
    byId,
    parentsOf: (id) => parents.get(id) ?? EMPTY,
    childrenOf: (id) => children.get(id) ?? EMPTY,
    spousesOf: (id) => spouses.get(id) ?? EMPTY,
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

export function siblingsOf(index: FamilyIndex, id: string): string[] {
  const result: string[] = [];
  for (const parentId of index.parentsOf(id)) {
    for (const childId of index.childrenOf(parentId)) {
      if (childId !== id && !result.includes(childId)) result.push(childId);
    }
  }
  return result;
}
