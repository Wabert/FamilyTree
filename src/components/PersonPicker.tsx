"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Person } from "@/lib/types";
import { Avatar, lifespan } from "./Avatar";

/** Lower-case, and without accents, so "jose" finds "José". */
const plain = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

/** Ann Smith “Annie” */
export function PersonName({ person }: { person: Person }) {
  return (
    <>
      {person.name}
      {person.nickname && <span className="font-normal text-muted italic"> “{person.nickname}”</span>}
    </>
  );
}

export type PickerChoice = { type: "none" } | { type: "person"; id: string } | { type: "new"; name: string };

/**
 * A pop-up for choosing someone from the tree: type part of a name or
 * nickname (or a birth year) to narrow the list. Offers "nobody" first and
 * "add a new person" last, pre-filled with whatever was typed.
 */
export function PersonPicker({
  title,
  emptyLabel,
  people,
  selectedId,
  onPick,
  onClose,
}: {
  title: string;
  emptyLabel: string;
  people: Person[];
  selectedId: string;
  onPick(choice: PickerChoice): void;
  onClose(): void;
}) {
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const searchable = useMemo(
    () =>
      people.map((person) => ({
        person,
        text: plain([person.name, person.nickname ?? "", person.birthYear ?? "", person.location ?? ""].join(" ")),
      })),
    [people],
  );

  const words = plain(query).split(/\s+/).filter(Boolean);
  const matches = words.length
    ? searchable.filter(({ text }) => words.every((word) => text.includes(word))).map(({ person }) => person)
    : people;

  // Rows: "nobody" (only when not searching), the matches, then "add new".
  const rows: PickerChoice[] = [
    ...(words.length ? [] : [{ type: "none" } as const]),
    ...matches.map((p) => ({ type: "person", id: p.id }) as const),
    { type: "new", name: query.trim() },
  ];
  const active = Math.min(highlight, rows.length - 1);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-row="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 sm:items-center sm:p-6"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="flex h-[80dvh] w-full max-w-md flex-col rounded-t-3xl bg-card shadow-2xl sm:h-[70dvh] sm:rounded-3xl"
      >
        <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-2">
          <h2 className="font-display text-xl font-semibold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-xl text-muted hover:bg-paper hover:text-ink"
          >
            ×
          </button>
        </div>
        <div className="px-5 pb-3">
          <input
            type="search"
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlight(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHighlight((h) => Math.min(h + 1, rows.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHighlight((h) => Math.max(h - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                onPick(rows[active]);
              } else if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                onClose();
              }
            }}
            placeholder="Type a name or nickname…"
            aria-label="Search people"
            autoComplete="off"
            className="w-full rounded-xl border border-line bg-white px-3 py-2 text-base text-ink outline-none placeholder:text-muted focus:border-leaf focus:ring-2 focus:ring-leaf/25"
          />
          <p className="mt-1 text-[11px] text-muted">
            {words.length
              ? `${matches.length} of ${people.length} ${people.length === 1 ? "person" : "people"}`
              : `${people.length} ${people.length === 1 ? "person" : "people"}`}
          </p>
        </div>

        <ul ref={listRef} role="listbox" aria-label={title} className="flex-1 overflow-y-auto border-t border-line pb-3">
          {words.length > 0 && matches.length === 0 && (
            <li className="px-5 pt-3 pb-1 text-xs text-muted">No one in the tree matches “{query.trim()}”.</li>
          )}
          {rows.map((row, i) => {
            const isActive = i === active;
            const base = [
              "flex w-full cursor-pointer items-center gap-3 px-5 py-2 text-left text-sm",
              isActive ? "bg-paper" : "hover:bg-paper",
            ].join(" ");
            if (row.type === "none") {
              return (
                <li key="none" data-row={i} role="option" aria-selected={selectedId === ""}>
                  <button type="button" className={base} onClick={() => onPick(row)} onMouseEnter={() => setHighlight(i)}>
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-dashed border-line text-muted">
                      –
                    </span>
                    <span className="text-muted">{emptyLabel}</span>
                    {selectedId === "" && <Check />}
                  </button>
                </li>
              );
            }
            if (row.type === "new") {
              return (
                <li key="new" data-row={i} role="option" aria-selected={false}>
                  <button
                    type="button"
                    className={`${base} font-medium text-leaf-dark`}
                    onClick={() => onPick(row)}
                    onMouseEnter={() => setHighlight(i)}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-leaf-soft text-lg">+</span>
                    {row.name ? `Add “${row.name}” as a new person` : "Add a new person…"}
                  </button>
                </li>
              );
            }
            const person = byId.get(row.id)!;
            const years = lifespan(person);
            return (
              <li key={person.id} data-row={i} role="option" aria-selected={person.id === selectedId}>
                <button type="button" className={base} onClick={() => onPick(row)} onMouseEnter={() => setHighlight(i)}>
                  <Avatar person={person} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-ink">
                      <PersonName person={person} />
                    </span>
                    {(years || person.location) && (
                      <span className="block truncate text-[11px] text-muted">
                        {[years, person.location].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </span>
                  {person.id === selectedId && <Check />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function Check() {
  return (
    <span aria-hidden className="ml-auto text-leaf">
      ✓
    </span>
  );
}
