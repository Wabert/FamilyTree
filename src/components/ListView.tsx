"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { buildOutline } from "@/lib/outline";
import type { Relationship } from "@/lib/relationship";
import type { Family, Person } from "@/lib/types";
import { Avatar, lifespan } from "./Avatar";

/** The compact view: an indented list, couples on one line, children underneath. */
export function ListView({
  family,
  meId,
  selectedId,
  relations,
  compact,
  panelOpen,
  focusTick,
  onSelect,
}: {
  family: Family;
  meId: string | null;
  selectedId: string | null;
  relations: Map<string, Relationship> | null;
  /** One line per person, used when relationship labels are turned off. */
  compact: boolean;
  /** True while the details panel covers part of the list. */
  panelOpen: boolean;
  /** Goes up each time someone is picked from search, so they are centred again. */
  focusTick: number;
  onSelect(id: string): void;
}) {
  const rows = useMemo(() => buildOutline(family), [family]);
  const people = useMemo(() => new Map(family.people.map((p) => [p.id, p])), [family]);

  // For every row: the rows above it that it sits under, and how many people are below it.
  const tree = useMemo(() => {
    const ancestors = new Map<string, string[]>(); // row id -> ids of the rows it is nested under
    const below = new Map<string, number>(); // row id -> people in the rows nested under it
    const rowOf = new Map<string, string>(); // person id (including spouses) -> their row id
    const stack: string[] = [];
    for (const row of rows) {
      stack.length = row.depth;
      ancestors.set(row.id, [...stack]);
      const size = 1 + row.spouseIds.length;
      for (const id of stack) below.set(id, (below.get(id) ?? 0) + size);
      rowOf.set(row.id, row.id);
      row.spouseIds.forEach((s) => rowOf.set(s, row.id));
      stack.push(row.id);
    }
    return { ancestors, below, rowOf };
  }, [rows]);

  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

  // If someone inside a collapsed branch gets selected (say from the details
  // panel), open the branch so they can be seen.
  const [shownSelection, setShownSelection] = useState(selectedId);
  if (selectedId !== shownSelection) {
    setShownSelection(selectedId);
    const above = tree.ancestors.get(tree.rowOf.get(selectedId ?? "") ?? "") ?? [];
    if (above.some((id) => collapsed.has(id))) {
      setCollapsed(new Set([...collapsed].filter((id) => !above.includes(id))));
    }
  }

  const toggle = (id: string) => {
    const next = new Set(collapsed);
    if (!next.delete(id)) next.add(id);
    setCollapsed(next);
  };
  const parentRows = rows.filter((row) => tree.below.has(row.id));
  const visibleRows = rows.filter((row) => !tree.ancestors.get(row.id)!.some((id) => collapsed.has(id)));

  const containerRef = useRef<HTMLDivElement>(null);
  const tappedHere = useRef<string | null>(null);

  // Bring the chosen person to the middle of the part of the list the details
  // panel doesn't cover. Someone tapped in the list itself is only moved if
  // the panel would otherwise hide them.
  useEffect(() => {
    const container = containerRef.current;
    const el = selectedId ? document.getElementById(`list-${selectedId}`) : null;
    if (!container || !el) return;
    const tapped = tappedHere.current === selectedId;
    tappedHere.current = null;

    /** How far the row is from the middle of the uncovered part, and whether it is fully in it. */
    const measure = () => {
      const phone = window.matchMedia("(max-width: 767px)").matches;
      const covered = phone ? (container.parentElement?.clientHeight ?? 0) * 0.62 : 0;
      const box = container.getBoundingClientRect();
      const visibleHeight = Math.max(box.height - covered, 80);
      const row = el.getBoundingClientRect();
      return {
        offset: row.top + row.height / 2 - (box.top + visibleHeight / 2),
        inView: row.top >= box.top && row.bottom <= box.top + visibleHeight,
      };
    };

    // Wait a frame so the opened branch and the details panel are laid out,
    // then check once more after the glide in case the page shifted meanwhile.
    let settle: number | undefined;
    const frame = window.requestAnimationFrame(() => {
      const first = measure();
      if (tapped && first.inView) return;
      container.scrollBy({ top: first.offset, behavior: "smooth" });
      settle = window.setTimeout(() => {
        const { offset } = measure();
        if (Math.abs(offset) > 6) container.scrollBy({ top: offset });
      }, 500);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(settle);
    };
  }, [selectedId, focusTick]);

  const chip = (person: Person) => {
    const relation = relations?.get(person.id);
    const years = lifespan(person);
    const isMe = person.id === meId;
    const isSelected = person.id === selectedId;
    const ring = isSelected ? "border-ink ring-1 ring-ink" : isMe ? "border-leaf ring-1 ring-leaf" : "border-line";
    if (compact) {
      return (
        <button
          key={person.id}
          id={`list-${person.id}`}
          type="button"
          onClick={() => {
            tappedHere.current = person.id;
            onSelect(person.id);
          }}
          aria-pressed={isSelected}
          className={`flex min-w-0 cursor-pointer items-center gap-1.5 rounded-lg border bg-card py-0.5 pr-2.5 pl-0.5 text-left hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leaf ${ring}`}
        >
          <span className={person.deathYear ? "opacity-80 grayscale-[35%]" : undefined}>
            <Avatar person={person} size={22} />
          </span>
          <span className="min-w-0 truncate text-sm leading-tight font-semibold text-ink">
            {person.name}
            {person.nickname && <span className="font-normal text-muted italic"> “{person.nickname}”</span>}
            {years && <span className="text-[11px] font-normal text-muted"> · {years}</span>}
          </span>
        </button>
      );
    }
    return (
      <button
        key={person.id}
        id={`list-${person.id}`}
        type="button"
        onClick={() => {
          tappedHere.current = person.id;
          onSelect(person.id);
        }}
        aria-pressed={isSelected}
        className={`flex min-w-0 cursor-pointer items-center gap-2 rounded-xl border bg-card py-1 pr-3 pl-1 text-left hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leaf ${ring}`}
      >
        <span className={person.deathYear ? "opacity-80 grayscale-[35%]" : undefined}>
          <Avatar person={person} size={30} />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm leading-tight font-semibold text-ink">
            {person.name}
            {person.nickname && <span className="font-normal text-muted italic"> “{person.nickname}”</span>}
          </span>
          {(years || relation) && (
            <span className="block truncate text-[11px] leading-tight text-muted">
              {years}
              {years && relation && " · "}
              {relation && (
                <span className={relation.kind === "none" ? undefined : "font-medium text-leaf-dark"}>
                  {relation.label}
                </span>
              )}
            </span>
          )}
        </span>
      </button>
    );
  };

  return (
    <div
      ref={containerRef}
      className={[
        // Starts below the Tree / List switch so rows never scroll underneath it.
        "absolute inset-x-0 top-[4.25rem] bottom-0 overflow-y-auto px-3 pt-1 sm:px-6",
        panelOpen ? "pb-[66dvh] md:pr-[392px] md:pb-6" : "pb-6",
      ].join(" ")}
    >
      {parentRows.length > 0 && (
        <div className="mx-auto flex max-w-3xl justify-end gap-4 pb-1 text-xs">
          <button
            type="button"
            disabled={collapsed.size === 0}
            onClick={() => setCollapsed(new Set())}
            className="cursor-pointer text-muted underline disabled:cursor-default disabled:no-underline disabled:opacity-50"
          >
            Expand all
          </button>
          <button
            type="button"
            disabled={parentRows.every((row) => collapsed.has(row.id))}
            onClick={() => setCollapsed(new Set(parentRows.map((row) => row.id)))}
            className="cursor-pointer text-muted underline disabled:cursor-default disabled:no-underline disabled:opacity-50"
          >
            Collapse all
          </button>
        </div>
      )}
      <ul className="mx-auto max-w-3xl">
        {visibleRows.map((row) => {
          const person = people.get(row.id);
          if (!person) return null;
          const below = tree.below.get(row.id) ?? 0;
          const isCollapsed = collapsed.has(row.id);
          return (
            <li key={row.id} className="flex items-stretch">
              {Array.from({ length: row.depth }, (_, i) => (
                <span key={i} aria-hidden className="ml-3 w-3 shrink-0 border-l border-line sm:ml-4 sm:w-4" />
              ))}
              {below > 0 ? (
                <button
                  type="button"
                  onClick={() => toggle(row.id)}
                  aria-expanded={!isCollapsed}
                  aria-label={`${isCollapsed ? "Show" : "Hide"} ${person.name}’s descendants`}
                  className={`flex w-7 shrink-0 cursor-pointer items-center justify-center self-center rounded-lg text-muted hover:bg-card hover:text-ink ${compact ? "py-1" : "py-2"}`}
                >
                  <svg
                    viewBox="0 0 12 12"
                    aria-hidden
                    className={`h-3 w-3 transition-transform ${isCollapsed ? "" : "rotate-90"}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M4 2l4 4-4 4" />
                  </svg>
                </button>
              ) : (
                <span aria-hidden className="w-7 shrink-0" />
              )}
              {/* One line per couple: names shorten rather than wrap on narrow screens. */}
              <div className={`flex min-w-0 flex-1 items-center gap-1.5 ${compact ? "py-0.5" : "py-1"}`}>
                {chip(person)}
                {row.spouseIds.map((spouseId) => {
                  const spouse = people.get(spouseId);
                  if (!spouse) return null;
                  return (
                    <span key={spouseId} className="flex min-w-0 items-center gap-1.5">
                      <span aria-hidden className="text-xs text-muted">
                        &amp;
                      </span>
                      {chip(spouse)}
                    </span>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
