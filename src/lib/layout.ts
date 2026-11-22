import { marriageState, marriageYears, orderSpouses } from "./marriage.ts";
import { buildIndex } from "./graph.ts";
import type { Family } from "./types";

/** Card and spacing sizes for the drawn tree. */
export interface CardSizes {
  cardW: number;
  cardH: number;
  spouseGap: number;
  siblingGap: number;
  rowGap: number;
  treeGap: number;
}

/** Room for a relationship label at the bottom of each card. */
export const REGULAR_CARDS: CardSizes = {
  cardW: 136,
  cardH: 164,
  spouseGap: 20,
  siblingGap: 28,
  rowGap: 64,
  treeGap: 72,
};

/** Used when relationship labels are turned off: fits more of the tree on a phone. */
export const COMPACT_CARDS: CardSizes = {
  cardW: 112,
  cardH: 118,
  spouseGap: 14,
  siblingGap: 18,
  rowGap: 44,
  treeGap: 48,
};

export const CARD_W = REGULAR_CARDS.cardW;

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
}

export interface LayoutPath {
  key: string;
  d: string;
  /** True when the child sits somewhere other than directly under these parents. */
  dashed: boolean;
  /**
   * One of several families hanging from the same row of cards: a child of
   * Benita and her second partner, or of Benita alone, rather than of Benita and
   * Frank. Drawn in its own color, on a line a little above the main family's.
   */
  otherFamily: boolean;
}

export interface CoupleLine {
  key: string;
  x1: number;
  x2: number;
  y: number;
  /** Divorced or split up: drawn dashed with a break mark. */
  divorced: boolean;
  /** For a tooltip, e.g. "Divorced · m. 1986 · div. 2001". */
  title: string;
}

export interface TreeLayout {
  /** The card size this layout was made for. */
  cardW: number;
  cardH: number;
  nodes: LayoutNode[];
  paths: LayoutPath[];
  couples: CoupleLine[];
  width: number;
  height: number;
  /** A sensible point to centre on when the tree is too big for the screen. */
  focus: { x: number; y: number };
}

/** A person plus their spouse(s), laid out side by side as one block. */
interface Unit {
  members: string[];
  children: Unit[];
  depth: number;
  width: number;
  subtreeWidth: number;
  x: number;
}

/**
 * Lays the family out as descendant trees: the oldest generation on top, each
 * couple side by side, their children in a row beneath them.
 */
export function computeLayout(family: Family, sizes: CardSizes = REGULAR_CARDS): TreeLayout {
  const {
    cardW: CARD_W,
    cardH: CARD_H,
    spouseGap: SPOUSE_GAP,
    siblingGap: SIBLING_GAP,
    rowGap: ROW_GAP,
    treeGap: TREE_GAP,
  } = sizes;
  const index = buildIndex(family);
  const order = new Map(family.people.map((p, i) => [p.id, i]));
  const unitOf = new Map<string, Unit>();

  const byAge = (a: string, b: string) => {
    const ya = index.byId.get(a)?.birthYear ?? Infinity;
    const yb = index.byId.get(b)?.birthYear ?? Infinity;
    return ya !== yb ? ya - yb : order.get(a)! - order.get(b)!;
  };

  const makeUnit = (primary: string): Unit => {
    // Past marriages first and the current one last, so a remarried person sits
    // between their former and current spouse, each couple side by side.
    const spouses = orderSpouses(index, primary, index.spousesOf(primary).filter((s) => !unitOf.has(s)));
    // Keep the primary person between two spouses so each couple is adjacent.
    const members =
      spouses.length >= 2
        ? [spouses[0], primary, ...spouses.slice(1)]
        : [primary, ...spouses];
    const unit: Unit = { members, children: [], depth: 0, width: 0, subtreeWidth: 0, x: 0 };
    for (const m of members) unitOf.set(m, unit);

    // Someone who married in may have married again (or before): put that
    // spouse beside them on the outer side, so every couple stays side by side.
    const placeOthers = (end: "left" | "right") => {
      for (;;) {
        const edge = end === "left" ? members[0] : members[members.length - 1];
        if (edge === primary) return;
        const others = orderSpouses(index, edge, index.spousesOf(edge).filter((s) => !unitOf.has(s)));
        if (!others.length) return;
        // Their current spouse goes on the outside, past marriages next to them.
        const next = end === "left" ? others[others.length - 1] : others[0];
        if (end === "left") members.unshift(next);
        else members.push(next);
        unitOf.set(next, unit);
      }
    };
    placeOthers("left");
    placeOthers("right");
    return unit;
  };

  const grow = (unit: Unit, depth: number) => {
    unit.depth = depth;
    const kids = [...new Set(unit.members.flatMap((m) => index.childrenOf(m)))].sort(byAge);
    for (const kid of kids) {
      if (unitOf.has(kid)) continue; // already placed elsewhere; gets a dashed link
      const child = makeUnit(kid);
      unit.children.push(child);
      grow(child, depth + 1);
    }
  };

  const countDescendants = (id: string, seen = new Set<string>()): number => {
    for (const child of index.childrenOf(id)) {
      if (seen.has(child)) continue;
      seen.add(child);
      countDescendants(child, seen);
    }
    return seen.size;
  };

  // Start from people with no parents in the tree. Someone who married into a
  // family is drawn next to their spouse rather than as a tree of their own.
  const parentless = family.people.map((p) => p.id).filter((id) => index.parentsOf(id).length === 0);
  const founders = parentless
    .filter((id) => index.spousesOf(id).every((s) => index.parentsOf(s).length === 0))
    .sort((a, b) => countDescendants(b) - countDescendants(a) || byAge(a, b));

  const roots: Unit[] = [];
  for (const id of [...founders, ...parentless, ...family.people.map((p) => p.id)]) {
    if (unitOf.has(id)) continue;
    const root = makeUnit(id);
    roots.push(root);
    grow(root, 0);
  }

  const measure = (unit: Unit) => {
    unit.width = unit.members.length * CARD_W + (unit.members.length - 1) * SPOUSE_GAP;
    let childrenWidth = 0;
    for (const child of unit.children) {
      measure(child);
      childrenWidth += child.subtreeWidth;
    }
    childrenWidth += Math.max(0, unit.children.length - 1) * SIBLING_GAP;
    unit.subtreeWidth = Math.max(unit.width, childrenWidth);
  };

  const place = (unit: Unit, left: number) => {
    const childrenWidth =
      unit.children.reduce((sum, c) => sum + c.subtreeWidth, 0) +
      Math.max(0, unit.children.length - 1) * SIBLING_GAP;
    let cursor = left + (unit.subtreeWidth - childrenWidth) / 2;
    for (const child of unit.children) {
      place(child, cursor);
      cursor += child.subtreeWidth + SIBLING_GAP;
    }
    let center = left + unit.subtreeWidth / 2;
    if (unit.children.length) {
      const first = unit.children[0];
      const last = unit.children[unit.children.length - 1];
      center = (first.x + first.width / 2 + last.x + last.width / 2) / 2;
    }
    const min = left;
    const max = left + unit.subtreeWidth - unit.width;
    unit.x = Math.min(Math.max(center - unit.width / 2, min), max);
  };

  let width = 0;
  for (const root of roots) {
    measure(root);
    place(root, width);
    width += root.subtreeWidth + TREE_GAP;
  }
  width = Math.max(0, width - TREE_GAP);

  const rowY = (depth: number) => depth * (CARD_H + ROW_GAP);
  const memberX = (unit: Unit, i: number) => unit.x + i * (CARD_W + SPOUSE_GAP);

  const nodes: LayoutNode[] = [];
  const couples: CoupleLine[] = [];
  const position = new Map<string, LayoutNode>();
  let maxDepth = 0;

  const collect = (unit: Unit) => {
    maxDepth = Math.max(maxDepth, unit.depth);
    unit.members.forEach((id, i) => {
      const node = { id, x: memberX(unit, i), y: rowY(unit.depth) };
      nodes.push(node);
      position.set(id, node);
      const left = unit.members[i - 1];
      // Only draw a line between two people who are actually a couple.
      if (i > 0 && index.spousesOf(id).includes(left)) {
        const m = marriageState(index, left, id);
        const kind = m.divorced ? (m.status === "partners" ? "Split up" : "Divorced") : m.widowed ? "Married (widowed)" : m.status === "partners" ? "Partners" : "Married";
        couples.push({
          key: `${left}+${id}`,
          x1: node.x - SPOUSE_GAP,
          x2: node.x,
          y: node.y + CARD_H / 2,
          divorced: m.divorced,
          title: [kind, marriageYears(m)].filter(Boolean).join(" · "),
        });
      }
    });
    unit.children.forEach(collect);
  };
  roots.forEach(collect);

  // Which parents each child hangs from, per row of cards. When a row has more
  // than one family (Frank & Benita's children, Benita & Tom's, Benita's alone),
  // each gets its own line level so they don't merge into one.
  const parentSets = (personId: string) => {
    const byUnit = new Map<Unit, string[]>();
    for (const parentId of index.parentsOf(personId)) {
      const unit = unitOf.get(parentId);
      if (unit) byUnit.set(unit, [...(byUnit.get(unit) ?? []), parentId]);
    }
    return [...byUnit].map(([unit, parentIds]) => ({
      unit,
      slots: parentIds.map((id) => unit.members.indexOf(id)).sort((a, b) => a - b),
    }));
  };
  const laneOf = new Map<Unit, Map<string, number>>();
  {
    const counts = new Map<Unit, Map<string, { couple: boolean; children: number }>>();
    for (const person of family.people) {
      for (const { unit, slots } of parentSets(person.id)) {
        const key = slots.join(",");
        const sets = counts.get(unit) ?? new Map<string, { couple: boolean; children: number }>();
        const entry = sets.get(key) ?? { couple: slots.length === 2, children: 0 };
        entry.children++;
        sets.set(key, entry);
        counts.set(unit, sets);
      }
    }
    // The main family (a couple with the most children) keeps the usual line.
    for (const [unit, sets] of counts) {
      const order = [...sets].sort(
        ([ka, a], [kb, b]) => Number(b.couple) - Number(a.couple) || b.children - a.children || ka.localeCompare(kb),
      );
      laneOf.set(unit, new Map(order.map(([key], lane) => [key, lane])));
    }
  }
  const LANE_STEP = Math.min(10, ROW_GAP / 4);

  const paths: LayoutPath[] = [];
  for (const person of family.people) {
    const child = position.get(person.id);
    if (!child) continue;
    const childUnit = unitOf.get(person.id)!;

    for (const { unit, slots } of parentSets(person.id)) {
      const top = rowY(unit.depth);
      const bottom = top + CARD_H;
      const isCouple = slots.length === 2 && slots[1] - slots[0] === 1;
      // A couple's line drops from the join between their cards.
      const sx = isCouple
        ? memberX(unit, slots[1]) - SPOUSE_GAP / 2
        : memberX(unit, slots[0]) + CARD_W / 2;
      const sy = isCouple ? top + CARD_H / 2 : bottom;
      const cx = child.x + CARD_W / 2;
      const cy = child.y;

      const direct = unit.children.includes(childUnit);
      const lane = laneOf.get(unit)?.get(slots.join(",")) ?? 0;
      // Other families run a little above the main family's line (never touching the cards).
      const midY = Math.max(bottom + 6, bottom + ROW_GAP / 2 - lane * LANE_STEP);
      const bendY = (bottom + cy) / 2;
      paths.push({
        key: `${unit.members[slots[0]]}>${person.id}`,
        dashed: !direct,
        otherFamily: lane > 0,
        d: direct
          ? `M${sx},${sy} V${midY} H${cx} V${cy}`
          : `M${sx},${bottom} C${sx},${bendY} ${cx},${bendY} ${cx},${cy}`,
      });
    }
  }

  const firstRoot = roots[0];
  return {
    cardW: CARD_W,
    cardH: CARD_H,
    nodes,
    paths,
    couples,
    width,
    height: nodes.length ? rowY(maxDepth) + CARD_H : 0,
    focus: firstRoot
      ? { x: firstRoot.x + firstRoot.width / 2, y: CARD_H / 2 }
      : { x: 0, y: 0 },
  };
}
