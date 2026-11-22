import { buildIndex } from "./graph.ts";
import type { Family } from "./types";

/** One line of the compact list: a person, their spouses beside them, and how far to indent. */
export interface OutlineRow {
  id: string;
  spouseIds: string[];
  depth: number;
}

/**
 * The family as an indented outline: the oldest generation at the left edge,
 * each couple on one line, and their children indented underneath. Everyone
 * appears exactly once. On each line the person born into the family comes
 * first and whoever married in follows; the couple at the top has the wife first.
 */
export function buildOutline(family: Family): OutlineRow[] {
  const index = buildIndex(family);
  const order = new Map(family.people.map((p, i) => [p.id, i]));
  const seen = new Set<string>();
  const rows: OutlineRow[] = [];

  // Oldest first where birth years are known, otherwise the order people were added.
  const byAge = (a: string, b: string) => {
    const ya = index.byId.get(a)?.birthYear;
    const yb = index.byId.get(b)?.birthYear;
    if (ya && yb && ya !== yb) return ya - yb;
    return (order.get(a) ?? 0) - (order.get(b) ?? 0);
  };

  const visit = (id: string, depth: number) => {
    if (seen.has(id)) return;
    seen.add(id);
    const spouseIds = index.spousesOf(id).filter((s) => !seen.has(s));
    spouseIds.forEach((s) => seen.add(s));
    rows.push({ id, spouseIds, depth });

    const children = new Set<string>();
    for (const parent of [id, ...spouseIds]) {
      for (const child of index.childrenOf(parent)) children.add(child);
    }
    [...children].sort(byAge).forEach((child) => visit(child, depth + 1));
  };

  const hasParents = (id: string) => index.parentsOf(id).length > 0;
  const ids = family.people.map((p) => p.id).sort(byAge);

  // Start from people with no parents in the tree, but leave anyone who married
  // into a branch to be shown beside their spouse.
  for (const id of ids) {
    if (seen.has(id) || hasParents(id) || index.spousesOf(id).some(hasParents)) continue;
    // Neither of a top couple married in, so the convention there is wife first.
    const wife =
      index.byId.get(id)?.gender === "female"
        ? undefined
        : index.spousesOf(id).find((s) => !seen.has(s) && index.byId.get(s)?.gender === "female");
    visit(wife ?? id, 0);
  }
  // Anyone still missing (unusual link tangles) gets a line of their own.
  for (const id of ids) visit(id, 0);

  return rows;
}
