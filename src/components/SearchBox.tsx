"use client";

import { useMemo, useRef, useState } from "react";
import type { Person } from "@/lib/types";
import { Avatar, lifespan } from "./Avatar";

/** Lower-case, and without accents, so "jose" finds "José". */
const plain = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

const MAX_RESULTS = 8;

/** Find someone by typing part of their name or nickname. */
export function SearchBox({ people, onPick }: { people: Person[]; onPick(id: string): void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const searchable = useMemo(
    () =>
      people
        .map((person) => ({ person, text: plain(`${person.name} ${person.nickname ?? ""}`) }))
        .sort((a, b) => a.person.name.localeCompare(b.person.name)),
    [people],
  );

  const words = plain(query).split(/\s+/).filter(Boolean);
  const matches = words.length
    ? searchable.filter(({ text }) => words.every((word) => text.includes(word))).map(({ person }) => person)
    : [];
  const shown = matches.slice(0, MAX_RESULTS);

  const pick = (id: string) => {
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
    onPick(id);
  };

  return (
    <div
      className="relative"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && shown.length) pick(shown[0].id);
          if (e.key === "Escape") {
            setQuery("");
            setOpen(false);
          }
        }}
        placeholder="Find a person…"
        aria-label="Find a person by name"
        autoComplete="off"
        className="h-[38px] w-full rounded-xl border border-line bg-card px-3 text-base text-ink shadow-sm outline-none placeholder:text-muted focus:border-leaf focus:ring-2 focus:ring-leaf/25 sm:text-sm"
      />
      {open && words.length > 0 && (
        <div className="absolute inset-x-0 top-full z-10 mt-1 max-h-[50dvh] overflow-y-auto rounded-xl border border-line bg-card py-1 shadow-xl">
          {shown.length === 0 && <p className="px-3 py-2 text-sm text-muted">No one by that name.</p>}
          {shown.map((person) => {
            const years = lifespan(person);
            return (
              <button
                key={person.id}
                type="button"
                onClick={() => pick(person.id)}
                className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left hover:bg-paper"
              >
                <Avatar person={person} size={28} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink">
                    {person.name}
                    {person.nickname && <span className="font-normal text-muted italic"> “{person.nickname}”</span>}
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
              {matches.length - shown.length} more — keep typing to narrow it down.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
