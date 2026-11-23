"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Person } from "@/lib/types";
import { Avatar, lifespan } from "./Avatar";
import { PersonName } from "./PersonPicker";

/** Lower-case, and without accents, so "jose" finds "José". */
const plain = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

/** Enough to scroll through comfortably; typing narrows it further. */
const MAX_SHOWN = 300;

/**
 * Find someone: tap to see everyone, or type part of a name, nickname, birth
 * year or city to narrow the list, like the parent and spouse pickers.
 */
export function SearchBox({ people, onPick }: { people: Person[]; onPick(id: string): void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const searchable = useMemo(
    () =>
      people
        .map((person) => ({
          person,
          text: plain([person.name, person.nickname ?? "", person.birthYear ?? "", person.location ?? ""].join(" ")),
        }))
        .sort((a, b) => a.person.name.localeCompare(b.person.name)),
    [people],
  );

  const words = plain(query).split(/\s+/).filter(Boolean);
  const matches = words.length
    ? searchable.filter(({ text }) => words.every((word) => text.includes(word))).map(({ person }) => person)
    : searchable.map(({ person }) => person);
  const shown = matches.slice(0, MAX_SHOWN);
  const active = Math.min(highlight, shown.length - 1);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-row="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const pick = (id: string) => {
    setQuery("");
    setOpen(false);
    setHighlight(0);
    inputRef.current?.blur();
    onPick(id);
  };

  return (
    <div
      className="relative"
      onBlur={(e) => {
        const box = e.currentTarget;
        if (box.contains(e.relatedTarget)) return;
        // Phones often blur the box before the tap on a name arrives (buttons there
        // don't take focus), so close a moment later and let the tap land first.
        window.setTimeout(() => {
          if (!box.contains(document.activeElement)) setOpen(false);
        }, 200);
      }}
    >
      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setHighlight(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setHighlight((h) => Math.min(h + 1, shown.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (e.key === "Enter" && open && shown[active]) {
            e.preventDefault();
            pick(shown[active].id);
          } else if (e.key === "Escape") {
            setQuery("");
            setOpen(false);
          }
        }}
        placeholder="Find a person…"
        aria-label="Find a person by name"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        className="h-[38px] w-full rounded-xl border border-line bg-card px-3 text-base text-ink shadow-sm outline-none placeholder:text-muted focus:border-leaf focus:ring-2 focus:ring-leaf/25 sm:text-sm"
      />
      {open && people.length > 0 && (
        <div
          // Keep the box focused while tapping in the list, so the tap isn't lost.
          onMouseDown={(e) => e.preventDefault()}
          className="absolute top-full right-0 z-30 mt-1 flex max-h-[60dvh] w-[max(100%,16rem)] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-line bg-card shadow-xl">
          <p className="border-b border-line px-3 py-1.5 text-[11px] text-muted">
            {words.length
              ? `${matches.length} of ${people.length} ${people.length === 1 ? "person" : "people"}`
              : `${people.length} ${people.length === 1 ? "person" : "people"} · type a name, nickname, year or city`}
          </p>
          <div ref={listRef} id={listId} role="listbox" aria-label="People" className="overflow-y-auto py-1">
            {shown.length === 0 && <p className="px-3 py-2 text-sm text-muted">No one matches “{query.trim()}”.</p>}
            {shown.map((person, i) => {
              const years = lifespan(person);
              return (
                <button
                  key={person.id}
                  data-row={i}
                  role="option"
                  aria-selected={i === active}
                  type="button"
                  onClick={() => pick(person.id)}
                  onMouseEnter={() => setHighlight(i)}
                  className={[
                    "flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left",
                    i === active ? "bg-paper" : "hover:bg-paper",
                  ].join(" ")}
                >
                  <Avatar person={person} size={28} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ink">
                      <PersonName person={person} />
                    </span>
                    {(years || person.location) && (
                      <span className="block truncate text-[11px] text-muted">
                        {[years, person.location].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
            {matches.length > shown.length && (
              <p className="px-3 py-1.5 text-[11px] text-muted">
                {matches.length - shown.length} more. Keep typing to narrow it down.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
