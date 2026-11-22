"use client";

import { useEffect, useRef } from "react";
import type { ReactNode, Ref } from "react";
import { siblingsOf, type FamilyIndex } from "@/lib/graph";
import { marriageState, marriageYears, orderSpouses, spouseTitle } from "@/lib/marriage";
import type { Relationship } from "@/lib/relationship";
import type { Person } from "@/lib/types";
import { Avatar, lifespan } from "./Avatar";

const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const firstName = (person: Person | undefined) => person?.nickname || person?.name.split(/\s+/)[0] || "";
const byAge = (index: FamilyIndex) => (a: string, b: string) =>
  (index.byId.get(a)?.birthYear ?? Infinity) - (index.byId.get(b)?.birthYear ?? Infinity);

/**
 * One person at a time: their grandparents, parents, spouse, siblings and
 * children around them. Tap anyone to move to them. Made for phones, where the
 * whole tree is too big to find your way around.
 */
export function FocusView({
  index,
  centerId,
  meId,
  relations,
  onCenter,
  onDetails,
}: {
  index: FamilyIndex;
  centerId: string;
  meId: string | null;
  relations: Map<string, Relationship> | null;
  onCenter(id: string): void;
  /** Tapping the focused (green) person opens their details. */
  onDetails(id: string): void;
}) {
  // Moving to someone starts at the top, with their grandparents in view.
  const scroller = useRef<HTMLDivElement>(null);
  const centerRow = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
    // With many siblings the row scrolls sideways: bring the focused person to its middle.
    const row = centerRow.current;
    const card = row?.querySelector<HTMLElement>("[data-focused]");
    if (row && card) row.scrollLeft = card.offsetLeft - (row.clientWidth - card.offsetWidth) / 2;
  }, [centerId]);

  const center = index.byId.get(centerId);
  if (!center) return null;
  const age = byAge(index);

  const parents = [...index.parentsOf(centerId)].sort(age);
  // A parent's other partner (a step-parent) explains half-siblings, so show them too.
  const stepParents = parents
    .flatMap((p) => index.spousesOf(p))
    .filter((s, i, all) => !parents.includes(s) && all.indexOf(s) === i);
  const grandparentGroups = parents
    .map((p) => ({ parent: p, grandparents: [...index.parentsOf(p)].sort(age) }))
    .filter((group) => group.grandparents.length);
  const spouses = orderSpouses(index, centerId, index.spousesOf(centerId)).reverse();
  const siblings = siblingsOf(index, centerId).sort(age);
  // Siblings sit on the person's own row, older ones to the left and younger to the right.
  const born = center.birthYear;
  const olderSiblings = siblings.filter((id) => {
    const year = index.byId.get(id)?.birthYear;
    return born !== undefined && year !== undefined && year < born;
  });
  const youngerSiblings = siblings.filter((id) => !olderSiblings.includes(id));
  const isHalf = (id: string) => {
    const mine = index.parentsOf(centerId);
    const theirs = index.parentsOf(id);
    return mine.length > 0 && theirs.length > 0 && !(mine.every((p) => theirs.includes(p)) && theirs.length === mine.length);
  };

  // Children grouped by their other parent, so a second marriage's children read as their own family.
  const childGroups = new Map<string, string[]>();
  for (const child of [...index.childrenOf(centerId)].sort(age)) {
    const other = index.parentsOf(child).find((p) => p !== centerId) ?? "";
    childGroups.set(other, [...(childGroups.get(other) ?? []), child]);
  }
  const groups = [...childGroups].sort(([a], [b]) => {
    // Current spouse's children first, then other partners, then "other parent not in the tree".
    const rank = (id: string) => (id === "" ? 3 : spouses[0] === id ? 0 : spouses.includes(id) ? 1 : 2);
    return rank(a) - rank(b);
  });

  const card = (id: string, note?: string) => (
    <PersonCard
      key={id}
      person={index.byId.get(id)!}
      relation={relations?.get(id)}
      note={note}
      isMe={id === meId}
      onClick={() => onCenter(id)}
    />
  );

  return (
    <div ref={scroller} className="absolute inset-0 overflow-y-auto pt-32 pb-10">
      <div className="mx-auto flex max-w-3xl flex-col items-stretch gap-1 px-2">
        {grandparentGroups.length > 0 && (
          <Section title="Grandparents">
            {grandparentGroups.map(({ parent, grandparents }) => (
              <Family key={parent} caption={`${firstName(index.byId.get(parent))}’s parents`}>
                {grandparents.map((id) => card(id))}
              </Family>
            ))}
          </Section>
        )}

        {parents.length > 0 && (
          <Section title="Parents">
            <Family>{parents.map((id) => card(id))}</Family>
            {stepParents.length > 0 && (
              <Family caption="Step-parent">
                {stepParents.map((id) => {
                  const partner = parents.find((p) => index.spousesOf(p).includes(id));
                  return card(id, partner ? cap(spouseTitle(index, partner, id)) + ` of ${firstName(index.byId.get(partner))}` : undefined);
                })}
              </Family>
            )}
          </Section>
        )}

        <Section title={siblings.length ? "Siblings" : undefined}>
          <Row ref={centerRow}>
            {olderSiblings.map((id) => card(id, isHalf(id) ? "Half-sibling" : undefined))}
            <PersonCard
              person={center}
              relation={relations?.get(centerId)}
              isMe={centerId === meId}
              focused
              onClick={() => onDetails(centerId)}
            />
            {spouses.map((id) => {
              const m = marriageState(index, centerId, id);
              const note = [cap(spouseTitle(index, centerId, id)), marriageYears(m)].filter(Boolean).join(" · ");
              return card(id, note);
            })}
            {youngerSiblings.map((id) => card(id, isHalf(id) ? "Half-sibling" : undefined))}
          </Row>
          <p className="text-[11px] text-muted">Tap {firstName(center)} for details, or anyone else to move to them.</p>
        </Section>

        {groups.length > 0 && (
          <Section title="Children">
            {groups.map(([other, kids]) => (
              <Family
                key={other || "none"}
                caption={
                  groups.length === 1
                    ? undefined
                    : other
                      ? `With ${index.byId.get(other)?.name ?? "partner"}`
                      : "Other parent not in the tree"
                }
              >
                {kids.map((id) => card(id))}
              </Family>
            ))}
          </Section>
        )}

        {!parents.length && !spouses.length && !siblings.length && !groups.length && (
          <p className="px-4 py-6 text-center text-sm text-muted">
            No one is linked to {firstName(center)} yet. Use Details → Edit details to add their parents or spouse.
          </p>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="relative flex flex-col items-center gap-1.5 py-2">
      {/* A short line down the middle ties the generations together. */}
      <span aria-hidden className="absolute -top-1 left-1/2 h-3 w-px bg-line" />
      {title && <h3 className="text-[11px] font-semibold tracking-wide text-muted uppercase">{title}</h3>}
      <div className="flex w-full flex-col items-center gap-2">{children}</div>
    </section>
  );
}

/** One family's people in a row: centered when they fit, scrolling sideways when they don't. */
function Family({ caption, children }: { caption?: string; children: ReactNode }) {
  return (
    <div className="flex w-full flex-col items-center gap-1">
      {caption && <p className="text-[11px] text-muted">{caption}</p>}
      <Row>{children}</Row>
    </div>
  );
}

function Row({ children, ref }: { children: ReactNode; ref?: Ref<HTMLDivElement> }) {
  return (
    <div ref={ref} className="w-full overflow-x-auto">
      <div className="mx-auto flex w-max gap-2 px-2 pb-1">{children}</div>
    </div>
  );
}

function PersonCard({
  person,
  relation,
  note,
  isMe,
  focused = false,
  onClick,
}: {
  person: Person;
  relation?: Relationship;
  note?: string;
  isMe: boolean;
  /** The person the view is centered on: same size, green background. */
  focused?: boolean;
  onClick(): void;
}) {
  const years = lifespan(person);
  const dead = person.deathYear !== undefined;
  return (
    <button
      type="button"
      onClick={onClick}
      data-focused={focused || undefined}
      aria-label={focused ? `${person.name}, shown in the middle. Open details` : undefined}
      className={[
        "flex w-28 shrink-0 cursor-pointer flex-col items-center rounded-2xl border px-1.5 pt-2.5 pb-2 text-center transition-shadow hover:shadow-md",
        focused ? "border-leaf bg-leaf-soft shadow-md" : dead ? "bg-memorial" : "bg-card shadow-sm",
        isMe ? "border-leaf ring-2 ring-leaf" : focused ? "ring-1 ring-leaf" : "border-line",
      ].join(" ")}
    >
      <span className={dead ? "opacity-75 grayscale-[60%]" : undefined}>
        <Avatar person={person} size={44} />
      </span>
      <span className={`mt-1.5 line-clamp-2 text-[12px] leading-tight font-semibold ${dead ? "text-ink/70" : "text-ink"}`}>
        {person.name}
      </span>
      {(person.nickname || years) && (
        <span className="mt-0.5 max-w-full truncate text-[10px] text-muted">
          {person.nickname && <span className="italic">“{person.nickname}”</span>}
          {person.nickname && years && " · "}
          {years}
        </span>
      )}
      {note && <span className="mt-0.5 line-clamp-2 text-[10px] leading-tight text-muted">{note}</span>}
      {relation && relation.kind !== "none" && (
        <span className="mt-1 line-clamp-2 max-w-full rounded-lg bg-leaf-soft px-1.5 py-0.5 text-[10px] leading-tight font-medium text-leaf-dark">
          {relation.label}
        </span>
      )}
    </button>
  );
}
