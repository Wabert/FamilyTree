"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import type { ReactNode } from "react";
import { oldestFirst, siblingsOf, type FamilyIndex } from "@/lib/graph";
import { marriageState, marriageYears, orderSpouses, spouseTitle } from "@/lib/marriage";
import type { Relationship } from "@/lib/relationship";
import type { Person } from "@/lib/types";
import { Avatar, lifespan } from "./Avatar";

const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
/** What the family calls them: their nickname, or else their first name. */
export const firstName = (person: Person | undefined) => person?.nickname || person?.name.split(/\s+/)[0] || "";
/** How long the view takes to slide a tapped card into the middle. */
const SLIDE_MS = 450;

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
  // view; swiping along the siblings keeps the page where it is. (A layout
  // effect, so the page is already in place when the cards start to glide.)
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const swipedTo = useRef<string | null>(null);
  // Where the card you tapped was on screen, so the view can slide it from there
  // into the middle, the way a sibling slides along their row.
  const tappedFrom = useRef<{ id: string; left: number; top: number } | null>(null);
  const slide = useRef<Animation | null>(null);
  const firstRender = useRef(true);
  useLayoutEffect(() => {
    const swiped = swipedTo.current === centerId;
    swipedTo.current = null;
    const from = tappedFrom.current?.id === centerId ? tappedFrom.current : null;
    tappedFrom.current = null;
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (swiped) return;
    scroller.current?.scrollTo({ top: 0 });

    // Plays even with the phone's Reduce Motion setting on, like the sibling row's
    // own smooth scroll: it's the same kind of move, and the way you keep your place.
    const box = content.current;
    slide.current?.cancel();
    if (!box) return;
    const card = box.querySelector<HTMLElement>("[data-focused]")?.getBoundingClientRect();
    const row = box.querySelector<HTMLElement>("[data-carousel]")?.getBoundingClientRect();
    if (from && card && row) {
      // Everything moves together: the tapped card starts where your finger was
      // and lands in the middle of its row (where the row snaps it, even if the
      // row hasn't finished settling yet), with its family coming along around it.
      const dx = from.left - (row.left + row.width / 2);
      const dy = from.top - card.top;
      slide.current = box.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], {
        duration: SLIDE_MS,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      });
    } else {
      // Moved from somewhere else (search, the quick card): a soft fade instead.
      slide.current = box.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: "ease-out" });
    }
  }, [centerId]);

  // Tapping a card (or a spouse's name): note where it is, then move to them.
  const goFrom = (id: string, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    tappedFrom.current = { id, left: rect.left + rect.width / 2, top: rect.top };
    onCenter(id);
  };

  const center = index.byId.get(centerId);
  if (!center) return null;
  const age = oldestFirst(index);

  const parents = [...index.parentsOf(centerId)].sort(age);
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
  const children = [...childGroups]
    .sort(([a], [b]) => {
      // Current spouse's children first, then other partners, then "other parent not in the tree".
      const rank = (id: string) => (id === "" ? 3 : spouses[0] === id ? 0 : spouses.includes(id) ? 1 : 2);
      return rank(a) - rank(b);
    })
    .flatMap(([, kids]) => kids);

  const card = (id: string, note?: string) => (
    <PersonCard
      key={id}
      person={index.byId.get(id)!}
      relation={relations?.get(id)}
      note={note}
      isMe={id === meId}
      onClick={(el) => goFrom(id, el)}
    />
  );

  return (
    <div ref={scroller} className="absolute inset-0 overflow-x-hidden overflow-y-auto pt-32 pb-10">
      <div ref={content} className="mx-auto flex max-w-3xl flex-col items-center px-2">
        {parents.length > 0 && (
          <>
            <Parents>{parents.map((id) => card(id))}</Parents>
            <Line />
          </>
        )}

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
              onSpouse={goFrom}
              onClick={() => (focused ? onDetails(id) : undefined)}
            />
          )}
          onSettle={(id) => {
            swipedTo.current = id;
            onSwipe(id);
          }}
        />

        {children.length > 0 && (
          <>
            <Line />
            <Children>{children.map((id) => card(id))}</Children>
          </>
        )}

        {!parents.length && !spouses.length && !siblings.length && !children.length && (
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

  // The scroll position that puts this card exactly in the middle. (Measured on
  // screen: offsetLeft counts from the wrong parent and was off by the padding.)
  const offsetFor = (el: HTMLElement, container: HTMLElement) => {
    const card = el.getBoundingClientRect();
    const box = container.getBoundingClientRect();
    return container.scrollLeft + card.left - box.left - (box.width - card.width) / 2;
  };

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
      data-carousel
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

/** A short line down the middle, joining one generation to the next. */
function Line() {
  return <span aria-hidden className="block h-5 w-px shrink-0 bg-line" />;
}

/** The parents side by side, joined by a short line, like a couple in the whole tree. */
function Parents({ children }: { children: ReactNode }) {
  return (
    <div className="w-full overflow-x-auto">
      <div className="relative mx-auto flex w-max gap-4 px-2">
        {/* Between the two cards, at the middle of their height. */}
        <span aria-hidden className="absolute top-1/2 left-1/2 h-px w-4 -translate-x-1/2 bg-line" />
        {children}
      </div>
    </div>
  );
}

/** The children in a row, each hanging from one line across, like the whole tree. */
function Children({ children }: { children: ReactNode[] }) {
  return (
    <div className="w-full overflow-x-auto">
      <div className="mx-auto flex w-max px-2 pb-1">
        {children.map((child, i) => (
          <div key={i} className="relative flex flex-col items-center px-1 pt-4">
            {/* The line across: from this card's middle to its neighbours'. */}
            {i > 0 && <span aria-hidden className="absolute top-0 left-0 h-px w-1/2 bg-line" />}
            {i < children.length - 1 && <span aria-hidden className="absolute top-0 right-0 h-px w-1/2 bg-line" />}
            {/* And down to the card. */}
            <span aria-hidden className="absolute top-0 left-1/2 h-4 w-px bg-line" />
            {child}
          </div>
        ))}
      </div>
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
  onSpouse?(id: string, el: HTMLElement): void;
  /** Given the card's element, so the view can slide from where it was. */
  onClick(el: HTMLElement): void;
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
      <button
        type="button"
        onClick={(e) => onClick(e.currentTarget)}
        className={`${look} cursor-pointer transition-shadow hover:shadow-md`}>
        {body}
      </button>
    );
  }
  // The focused card: tap the person for details, or a spouse's name to move to them.
  return (
    <div data-focused className={look}>
      <button
        type="button"
        onClick={(e) => onClick(e.currentTarget)}
        aria-label={`${person.name}, shown in the middle. Open details`}
        className="flex w-full cursor-pointer flex-col items-center"
      >
        {body}
      </button>
      {spouses && spouses.length > 0 && (
        <div className="mt-1.5 w-full space-y-1 border-t border-leaf/30 pt-1.5">
          {spouses.map((spouse) => (
            <div key={spouse.id} className="flex flex-col items-center leading-tight">
              {/* A small pill with an arrow, so it reads as something to tap. */}
              <button
                  type="button"
                  onClick={(e) => onSpouse?.(spouse.id, e.currentTarget)}
                  aria-label={`Go to ${spouse.name}`}
                  className="flex max-w-full cursor-pointer items-center gap-0.5 rounded-full border border-leaf/40 bg-card py-0.5 pr-1.5 pl-2 text-[11px] font-medium text-ink shadow-sm hover:border-leaf active:bg-leaf-soft"
                >
                  <span className="truncate">{spouse.name}</span>
                  <span aria-hidden className="text-[13px] leading-none text-leaf-dark">
                    ›
                  </span>
                </button>
              <span className="mt-0.5 block max-w-full truncate text-[9px] text-muted">{spouse.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
