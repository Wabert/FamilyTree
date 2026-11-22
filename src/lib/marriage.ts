import type { FamilyIndex } from "./graph";
import type { Gender, MarriageStatus, SpouseLink } from "./types";

/**
 * How a couple's marriage stands. A divorce is recorded on the link; a
 * marriage that ended because one of them died is worked out from their death
 * year, so the two can never disagree.
 */
export interface MarriageState {
  status: MarriageStatus;
  startYear?: number;
  endYear?: number;
  /** Over by divorce or separation. */
  divorced: boolean;
  /** Not divorced, but one of the two has died. */
  widowed: boolean;
}

export function marriageState(index: FamilyIndex, a: string, b: string): MarriageState {
  const link: SpouseLink | undefined = index.marriage(a, b);
  const status = link?.status ?? "married";
  const divorced = status === "divorced";
  const someoneDied = [a, b].some((id) => index.byId.get(id)?.deathYear !== undefined);
  return { status, startYear: link?.startYear, endYear: link?.endYear, divorced, widowed: !divorced && someoneDied };
}

/** Still together: not divorced and both alive. */
export const isCurrent = (m: MarriageState) => !m.divorced && !m.widowed;

const pick = (g: Gender | undefined, male: string, female: string, neutral: string) =>
  g === "male" ? male : g === "female" ? female : neutral;

/**
 * What `spouseId` is to the other person: "husband", "ex-wife", "late husband",
 * "partner". Late only when the spouse is the one who died.
 */
export function spouseTitle(index: FamilyIndex, otherId: string, spouseId: string): string {
  const m = marriageState(index, otherId, spouseId);
  const spouse = index.byId.get(spouseId);
  const word = m.status === "partners" ? "partner" : pick(spouse?.gender, "husband", "wife", "spouse");
  if (m.divorced) return m.status === "partners" ? "former partner" : `ex-${word}`;
  if (spouse?.deathYear !== undefined) return `late ${word}`;
  return word;
}

/** "m. 1986", "div. 2001", "m. 1986 · div. 2001", "together since 2010", or "". */
export function marriageYears(m: MarriageState): string {
  const together = m.status === "partners" ? "together" : "m.";
  const start = m.startYear ? (m.status === "partners" ? `together ${m.startYear}` : `${together} ${m.startYear}`) : "";
  const end = m.divorced && m.endYear ? (m.status === "partners" ? `split ${m.endYear}` : `div. ${m.endYear}`) : "";
  return [start, end].filter(Boolean).join(" · ");
}

/**
 * Spouses in the order to draw them beside someone: past marriages first, the
 * current one last, oldest marriage first within each group.
 */
export function orderSpouses(index: FamilyIndex, id: string, spouses: string[]): string[] {
  const rank = (s: string) => (isCurrent(marriageState(index, id, s)) ? 1 : 0);
  const year = (s: string) => index.marriage(id, s)?.startYear ?? Infinity;
  return [...spouses].sort((x, y) => rank(x) - rank(y) || year(x) - year(y));
}
