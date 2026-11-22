import type { Gender } from "./types";
import type { FamilyIndex } from "./graph";
import { marriageState, spouseTitle } from "./marriage.ts";

export type RelationKind = "self" | "blood" | "marriage" | "none";

export interface Relationship {
  kind: RelationKind;
  /** Short label for a chip, e.g. "First cousin". */
  label: string;
  /** Reads naturally after "<Name> is ", e.g. "your first cousin". */
  phrase: string;
  /** The closest shared ancestors, for relatives who are neither above nor below you. */
  commonAncestorIds: string[];
}

interface Blood {
  /** Generations from the first person up to the shared ancestor. */
  up: number;
  /** Generations from the second person up to the shared ancestor. */
  down: number;
  common: string[];
}

function ancestorDistances(index: FamilyIndex, id: string): Map<string, number> {
  const dist = new Map<string, number>([[id, 0]]);
  let frontier = [id];
  while (frontier.length) {
    const next: string[] = [];
    for (const current of frontier) {
      const d = dist.get(current)!;
      for (const parentId of index.parentsOf(current)) {
        if (dist.has(parentId)) continue;
        dist.set(parentId, d + 1);
        next.push(parentId);
      }
    }
    frontier = next;
  }
  return dist;
}

function findBlood(index: FamilyIndex, a: string, b: string): Blood | null {
  const fromA = ancestorDistances(index, a);
  const fromB = ancestorDistances(index, b);
  let best: Blood | null = null;
  for (const [id, up] of fromA) {
    const down = fromB.get(id);
    if (down === undefined) continue;
    const total = up + down;
    if (!best || total < best.up + best.down) best = { up, down, common: [id] };
    else if (total === best.up + best.down && up === best.up) best.common.push(id);
  }
  return best;
}

const pick = (g: Gender | undefined, male: string, female: string, neutral: string) =>
  g === "male" ? male : g === "female" ? female : neutral;

const greats = (n: number) => "great-".repeat(Math.max(0, n));

const ORDINALS = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth"];
const ordinal = (n: number) => ORDINALS[n] ?? `${n}th`;

const removed = (n: number) =>
  n === 0 ? "" : n === 1 ? " once removed" : n === 2 ? " twice removed" : ` ${n} times removed`;

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Name for someone `down` generations below an ancestor that is `up` generations above you. */
function bloodLabel(up: number, down: number, g: Gender | undefined, half = false): string {
  if (down === 0) {
    if (up === 1) return pick(g, "father", "mother", "parent");
    return greats(up - 2) + pick(g, "grandfather", "grandmother", "grandparent");
  }
  if (up === 0) {
    if (down === 1) return pick(g, "son", "daughter", "child");
    return greats(down - 2) + pick(g, "grandson", "granddaughter", "grandchild");
  }
  if (up === 1 && down === 1) {
    return (half ? "half-" : "") + pick(g, "brother", "sister", "sibling");
  }
  if (down === 1) return greats(up - 2) + pick(g, "uncle", "aunt", "aunt/uncle");
  if (up === 1) return greats(down - 2) + pick(g, "nephew", "niece", "niece/nephew");
  return `${ordinal(Math.min(up, down) - 1)} cousin${removed(Math.abs(up - down))}`;
}

function isHalfSibling(index: FamilyIndex, a: string, b: string): boolean {
  const pa = index.parentsOf(a);
  const pb = index.parentsOf(b);
  if (pa.length < 2 || pb.length < 2) return false;
  return pa.filter((p) => pb.includes(p)).length === 1;
}

const yours = (kind: RelationKind, label: string, common: string[] = []): Relationship => ({
  kind,
  label: capitalize(label),
  phrase: `your ${label}`,
  commonAncestorIds: common,
});

/** Closest blood relation between `from` and any of `candidates`. */
function closestBlood(index: FamilyIndex, from: string, candidates: string[]) {
  let best: { id: string; blood: Blood } | null = null;
  for (const id of candidates) {
    const blood = findBlood(index, from, id);
    if (!blood) continue;
    if (!best || blood.up + blood.down < best.blood.up + best.blood.down) best = { id, blood };
  }
  return best;
}

/** What `otherId` is to `meId` — "Dana is your first cousin once removed". */
export function relationship(index: FamilyIndex, meId: string, otherId: string): Relationship {
  if (meId === otherId) {
    return { kind: "self", label: "You", phrase: "you", commonAncestorIds: [] };
  }
  const other = index.byId.get(otherId);
  const g = other?.gender;

  const blood = findBlood(index, meId, otherId);
  if (blood) {
    const half = blood.up === 1 && blood.down === 1 && isHalfSibling(index, meId, otherId);
    // Naming the shared ancestors helps for cousins; for siblings it is just "your parents".
    const collateral = blood.up > 0 && blood.down > 0 && blood.up + blood.down > 2;
    return yours("blood", bloodLabel(blood.up, blood.down, g, half), collateral ? blood.common : []);
  }

  // Marriages still in place (including one ended by a death) come before divorces,
  // which get "ex-" wording instead of in-law and step- words.
  const divorcedFrom = (a: string, b: string) => marriageState(index, a, b).divorced;
  const split = (from: string, ids: string[]) => [
    ids.filter((id) => !divorcedFrom(from, id)),
    ids.filter((id) => divorcedFrom(from, id)),
  ];
  const [mySpouses, myExes] = split(meId, index.spousesOf(meId));
  const [theirSpouses, theirExes] = split(otherId, index.spousesOf(otherId));

  if (index.spousesOf(meId).includes(otherId)) return yours("marriage", spouseTitle(index, meId, otherId));

  // They married one of my blood relatives.
  const viaTheirSpouse = closestBlood(index, meId, theirSpouses);
  if (viaTheirSpouse) {
    const { up, down } = viaTheirSpouse.blood;
    const relative = index.byId.get(viaTheirSpouse.id);
    if (up === 0 && down === 1) return yours("marriage", pick(g, "son-in-law", "daughter-in-law", "child-in-law"));
    if (up === 1 && down === 0) return yours("marriage", pick(g, "stepfather", "stepmother", "step-parent"));
    if (up === 1 && down === 1) return yours("marriage", pick(g, "brother-in-law", "sister-in-law", "sibling-in-law"));
    if (down === 1 && up >= 2) {
      return yours("marriage", `${greats(up - 2)}${pick(g, "uncle", "aunt", "aunt/uncle")} by marriage`);
    }
    return yours("marriage", `${bloodLabel(up, down, relative?.gender)}'s ${spouseTitle(index, viaTheirSpouse.id, otherId)}`);
  }

  // A child of my parent's spouse: a stepbrother or stepsister.
  const myParents = index.parentsOf(meId);
  for (const parentId of myParents) {
    for (const stepParent of index.spousesOf(parentId)) {
      if (myParents.includes(stepParent) || divorcedFrom(parentId, stepParent)) continue;
      if (index.parentsOf(otherId).includes(stepParent)) {
        return yours("marriage", pick(g, "stepbrother", "stepsister", "stepsibling"));
      }
    }
  }

  // They are a blood relative of my spouse.
  for (const spouseId of mySpouses) {
    const viaMySpouse = findBlood(index, spouseId, otherId);
    if (!viaMySpouse) continue;
    const { up, down } = viaMySpouse;
    const mine = spouseTitle(index, meId, spouseId);
    if (up === 1 && down === 0) return yours("marriage", pick(g, "father-in-law", "mother-in-law", "parent-in-law"));
    if (up === 0 && down === 1) return yours("marriage", pick(g, "stepson", "stepdaughter", "stepchild"));
    if (up === 1 && down === 1) return yours("marriage", pick(g, "brother-in-law", "sister-in-law", "sibling-in-law"));
    return yours("marriage", `${mine}'s ${bloodLabel(up, down, g)}`);
  }

  // They married a blood relative of my spouse.
  for (const spouseId of mySpouses) {
    const link = closestBlood(index, spouseId, theirSpouses);
    if (!link) continue;
    const { up, down } = link.blood;
    if (up === 1 && down === 1) return yours("marriage", pick(g, "brother-in-law", "sister-in-law", "sibling-in-law"));
    const mine = spouseTitle(index, meId, spouseId);
    const relative = index.byId.get(link.id);
    return yours("marriage", `${mine}'s ${bloodLabel(up, down, relative?.gender)}'s ${spouseTitle(index, link.id, otherId)}`);
  }

  // Divorced from one of my blood relatives: "mother's ex-husband", "sister's ex-wife".
  const viaTheirEx = closestBlood(index, meId, theirExes);
  if (viaTheirEx) {
    const { up, down } = viaTheirEx.blood;
    const relative = index.byId.get(viaTheirEx.id);
    return yours("marriage", `${bloodLabel(up, down, relative?.gender)}'s ${spouseTitle(index, viaTheirEx.id, otherId)}`);
  }

  // A blood relative of my ex: "ex-wife's father".
  for (const exId of myExes) {
    const viaMyEx = findBlood(index, exId, otherId);
    if (!viaMyEx) continue;
    return yours("marriage", `${spouseTitle(index, meId, exId)}'s ${bloodLabel(viaMyEx.up, viaMyEx.down, g)}`);
  }

  return {
    kind: "none",
    label: "Not connected yet",
    phrase: "not connected to you in the tree yet",
    commonAncestorIds: [],
  };
}
