"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import type { ReactNode, Ref } from "react";
import { siblingsOf, type FamilyIndex } from "@/lib/graph";
import { marriageState, marriageYears, orderSpouses, spouseTitle } from "@/lib/marriage";
import type { Relationship } from "@/lib/relationship";
import type { Person } from "@/lib/types";
import { Avatar, lifespan } from "./Avatar";

const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const firstName = (person: Person | undefined) => person?.nickname || person?.name.split(/\s+/)[0] || "";
/** Oldest first; people without a birth year keep the order they were added, so rows never reshuffle. */
const byAge = (index: FamilyIndex) => {
  const added = new Map([...index.byId.keys()].map((id, i) => [id, i]));
  return (a: string, b: string) =>
    (index.byId.get(a)?.birthYear ?? Infinity) - (index.byId.get(b)?.birthYear ?? Infinity) ||
    (added.get(a) ?? 0) - (added.get(b) ?? 0);
};

/**
 * One person at a time: their parents, spouse, siblings and
 * children around them. Tap anyone to move to them. Made for phones, where the
 * whole tree is too big to find your way around.
 */
export function FocusView({
  index,
  centerId,
  meId,
  relations,
  onCenter,
  onSwipe,
  onDetails,
}: {
  index: FamilyIndex;
  centerId: string;
  meId: string | null;
  relations: Map<string, Relationship> | null;
  onCenter(id: string): void;
  /** Swiping the siblings row to someone: moves the focus without a history step. */
  onSwipe(id: string): void;
  /** Tapping the focused (green) person opens their details. */
  onDetails(id: string): void;
}) {
  // Moving to someone by tapping starts at the top, with their parents in
  // view; swiping along the siblings keeps the page where it is.
  const scroller = useRef<HTMLDivElement>(null);
  const swipedTo = useRef<string | null>(null);
  useEffect(() => {
    if (swipedTo.current !== centerId) scroller.current?.scrollTo({ top: 0 });
    swipedTo.current = null;
  }, [centerId]);

  const center = index.byId.get(centerId);
  if (!center) return null;
  const age = byAge(index);

  const parents = [...index.parentsOf(centerId)].sort(age);
  // A parent's other partner (a step-parent) explains half-siblings, so show them too.
  const stepParents = parents
    .flatMap((p) => index.spousesOf(p))
    .filter((s, i, all) => !parents.includes(s) && all.indexOf(s) === i);
  const spouses = orderSpouses(index, centerId, index.spousesOf(centerId)).reverse();
  const siblings = siblingsOf(index, centerId).sort(age);
  // The person and their siblings, oldest to youngest: the row that swipes.
  const brood = [...siblings, centerId].sort(age);
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

        <Section title={siblings.length ? "Siblings · swipe" : undefined}>
          <SiblingCarousel
            ids={brood}
            centerId={centerId}
            renderCard={(id, focused) => (
              <PersonCard
                person={index.byId.get(id)!}
                relation={relations?.get(id)}
                note={!focused && isHalf(id) ? "Half-sibling" : undefined}
                isMe={id === meId}
                focused={focused}
                spouses={
                  focused
                    ? spouses.map((s) => ({
                        id: s,
                        name: index.byId.get(s)?.name ?? "",
                        title: [cap(spouseTitle(index, centerId, s)), marriageYears(marriageState(index, centerId, s))]
                          .filter(Boolean)
                          .join(" · "),
                      }))
                    : undefined
                }
                onSpouse={onCenter}
                onClick={() => (focused ? onDetails(id) : undefined)}
              />
            )}
            onSettle={(id) => {
              swipedTo.current = id;
              onSwipe(id);
            }}
          />
          <p className="text-[11px] text-muted">Tap {firstName(center)} for details. Tap anyone else to move to them.</p>
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

/**
 * The focused person among their siblings, oldest to youngest. Swipe and it
 * snaps a card into the middle, and that person becomes the focus; tapping a
 * sibling glides them into the middle the same way.
 */
function SiblingCarousel({
  ids,
  centerId,
  renderCard,
  onSettle,
}: {
  ids: string[];
  centerId: string;
  renderCard(id: string, focused: boolean): ReactNode;
  onSettle(id: string): void;
}) {
  const row = useRef<HTMLDivElement>(null);
  const settle = useRef<number | undefined>(undefined);

  const offsetFor = (el: HTMLElement, container: HTMLElement) =>
    el.offsetLeft - (container.clientWidth - el.offsetWidth) / 2;

  // Whenever the focus changes (or the row's people change, e.g. after moving to a
  // half-sibling), put the focused person exactly in the middle.
  useLayoutEffect(() => {
    const container = row.current;
    const el = container?.querySelector<HTMLElement>(`[data-slot="${centerId}"]`);
    if (!container || !el) return;
    // After a swipe the card is already in the middle: leave the row alone so nothing
    // fights the finger. Otherwise (a tap elsewhere, Back, search) jump straight there.
    const target = offsetFor(el, container);
    if (Math.abs(container.scrollLeft - target) > 2) container.scrollTo({ left: target, behavior: "instant" });
  }, [centerId, ids]);

  useEffect(() => () => window.clearTimeout(settle.current), []);

  const onScroll = () => {
    window.clearTimeout(settle.current);
    settle.current = window.setTimeout(() => {
      const container = row.current;
      if (!container) return;
      const middle = container.scrollLeft + container.clientWidth / 2;
      let best: { id: string; distance: number } | null = null;
      for (const el of container.querySelectorAll<HTMLElement>("[data-slot]")) {
        const distance = Math.abs(el.offsetLeft + el.offsetWidth / 2 - middle);
        if (!best || distance < best.distance) best = { id: el.dataset.slot!, distance };
      }
      if (best && best.id !== centerId) onSettle(best.id);
    }, 120);
  };

  const glideTo = (id: string) => {
    const container = row.current;
    const el = container?.querySelector<HTMLElement>(`[data-slot="${id}"]`);
    if (container && el) container.scrollTo({ left: offsetFor(el, container), behavior: "smooth" });
  };

  // Room at both ends so the oldest and youngest can sit in the middle too.
  const spacer = <span aria-hidden className="shrink-0" style={{ width: "calc(50% - 4rem)" }} />;
  return (
    <div
      ref={row}
      onScroll={onScroll}
      className="flex w-full snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:none]"
    >
      {spacer}
      {ids.map((id) => (
        <div
          key={id}
          data-slot={id}
          className="shrink-0 snap-center"
          onClickCapture={(e) => {
            if (id === centerId) return;
            e.stopPropagation();
            glideTo(id);
          }}
        >
          {renderCard(id, id === centerId)}
        </div>
      ))}
      {spacer}
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
  spouses,
  onSpouse,
  onClick,
}: {
  person: Person;
  relation?: Relationship;
  note?: string;
  isMe: boolean;
  /** The person the view is centered on: same size, green background. */
  focused?: boolean;
  /** Shown inside the focused card, e.g. "Wife · m. 2004: Linda Hartley". */
  spouses?: { id: string; name: string; title: string }[];
  onSpouse?(id: string): void;
  onClick(): void;
}) {
  const years = lifespan(person);
  const dead = person.deathYear !== undefined;
  const look = [
    "flex w-28 shrink-0 flex-col items-center rounded-2xl border px-1.5 pt-2.5 pb-2 text-center",
    focused ? "border-leaf bg-leaf-soft shadow-md" : dead ? "bg-memorial" : "bg-card shadow-sm",
    isMe ? "border-leaf ring-2 ring-leaf" : focused ? "ring-1 ring-leaf" : "border-line",
  ].join(" ");
  const body = (
    <>
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
    </>
  );

  if (!focused) {
    return (
      <button type="button" onClick={onClick} className={`${look} cursor-pointer transition-shadow hover:shadow-md`}>
        {body}
      </button>
    );
  }
  // The focused card: tap the person for details, or a spouse's name to move to them.
  return (
    <div data-focused className={look}>
      <button
        type="button"
        onClick={onClick}
        aria-label={`${person.name}, shown in the middle. Open details`}
        className="flex w-full cursor-pointer flex-col items-center"
      >
        {body}
      </button>
      {spouses && spouses.length > 0 && (
        <div className="mt-1.5 w-full space-y-1 border-t border-leaf/30 pt-1.5">
          {spouses.map((spouse) => (
            <button
              key={spouse.id}
              type="button"
              onClick={() => onSpouse?.(spouse.id)}
              className="block w-full cursor-pointer rounded-md px-0.5 text-center leading-tight hover:bg-card/70"
            >
              <span className="block truncate text-[11px] font-medium text-ink">{spouse.name}</span>
              <span className="block truncate text-[9px] text-muted">{spouse.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
