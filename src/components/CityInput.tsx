"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { placeKey, rememberPlace, suggestCities, type CitySuggestion } from "@/lib/geocode";
import { inputClass } from "./ui";

interface Option {
  label: string;
  detail: string;
  suggestion?: CitySuggestion;
}

const plain = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

/**
 * "Lives in" with a drop-down: places already used in the family first (so
 * everyone in one town is spelled the same), then matching cities from the map service.
 */
export function CityInput({
  value,
  onChange,
  familyPlaces,
}: {
  value: string;
  onChange(value: string): void;
  /** Every "Lives in" already in the family, as typed. */
  familyPlaces: string[];
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [remote, setRemote] = useState<{ query: string; results: CitySuggestion[] }>({ query: "", results: [] });

  const query = value.trim();

  // Ask the map service after a short pause in typing.
  useEffect(() => {
    if (!open || query.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      suggestCities(query, controller.signal)
        .then((results) => setRemote({ query, results }))
        .catch(() => {
          // Offline or aborted: the family's own places still show.
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, open]);

  const options = useMemo<Option[]>(() => {
    if (!query) return [];
    const words = plain(query).split(/[\s,]+/).filter(Boolean);
    const seen = new Set<string>();
    const out: Option[] = [];
    const counts = new Map<string, { label: string; count: number }>();
    for (const label of familyPlaces) {
      const key = placeKey(label);
      const entry = counts.get(key);
      if (entry) entry.count++;
      else counts.set(key, { label: label.trim(), count: 1 });
    }
    const family = [...counts.values()]
      .filter(({ label }) => words.every((word) => plain(label).includes(word)))
      .sort((a, b) => b.count - a.count);
    for (const { label, count } of family.slice(0, 4)) {
      seen.add(placeKey(label));
      out.push({ label, detail: `${count} in the family` });
    }
    if (remote.query === query) {
      for (const suggestion of remote.results) {
        if (seen.has(placeKey(suggestion.label))) continue;
        seen.add(placeKey(suggestion.label));
        out.push({ label: suggestion.label, detail: suggestion.detail, suggestion });
      }
    }
    // Nothing to offer when the box already says exactly the only match.
    if (out.length === 1 && placeKey(out[0].label) === placeKey(query)) return [];
    return out;
  }, [query, familyPlaces, remote]);

  const pick = (option: Option) => {
    if (option.suggestion) rememberPlace(option.label, option.suggestion.at);
    onChange(option.label);
    setOpen(false);
    setHighlight(-1);
  };

  const showList = open && options.length > 0;

  return (
    <div
      className="relative"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <input
        className={inputClass}
        placeholder="Start typing a city"
        value={value}
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setHighlight(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!showList) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((h) => (h + 1) % options.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => (h <= 0 ? options.length - 1 : h - 1));
          } else if (e.key === "Enter" && highlight >= 0) {
            e.preventDefault();
            pick(options[highlight]);
          } else if (e.key === "Escape") {
            e.preventDefault();
            setOpen(false);
          }
        }}
      />
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-xl border border-line bg-card py-1 shadow-xl"
        >
          {options.map((option, i) => (
            <li key={placeKey(option.label)} role="option" aria-selected={i === highlight}>
              <button
                type="button"
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(option)}
                className={[
                  "flex w-full cursor-pointer flex-col px-3 py-1.5 text-left hover:bg-paper",
                  i === highlight ? "bg-paper" : "",
                ].join(" ")}
              >
                <span className="text-sm text-ink">{option.label}</span>
                <span className="text-[11px] text-muted">{option.detail}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
