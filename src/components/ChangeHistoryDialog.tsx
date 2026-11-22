"use client";

import { useEffect, useMemo, useState } from "react";
import { listChanges, type Change } from "@/lib/store";
import { ErrorNote, inputClass, secondaryButton } from "./ui";

const errorText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong. Please try again.");

const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  nickname: "Nickname",
  gender: "Gender",
  birth_year: "Born",
  death_year: "Died",
  location: "Lives in",
  bio: "About",
  photo_path: "Photo",
  gallery_paths: "More photos",
  role: "Role",
  this_is_me: "This is me",
  invite_link: "Invite link",
};

const PHOTO_FIELDS = new Set(["photo_path", "gallery_paths"]);

const isEdit = (value: unknown): value is { from: unknown; to: unknown } =>
  typeof value === "object" && value !== null && !Array.isArray(value) && "from" in value && "to" in value;

const isEmpty = (value: unknown) =>
  value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);

function show(field: string, value: unknown): string {
  if (isEmpty(value)) return "(empty)";
  if (PHOTO_FIELDS.has(field)) return Array.isArray(value) ? `${value.length} photo${value.length === 1 ? "" : "s"}` : "a photo";
  return String(value);
}

/** Readable lines for one change, e.g. "Lives in: Dayton, OH → League City, TX". */
function describe(change: Change): string[] {
  if (!change.details) return [];
  return Object.entries(change.details).flatMap(([field, value]) => {
    const label = FIELD_LABELS[field] ?? field;
    if (isEdit(value)) {
      if (PHOTO_FIELDS.has(field)) {
        if (isEmpty(value.from)) return [`${label}: added`];
        if (isEmpty(value.to)) return [`${label}: removed`];
        return [`${label}: changed`];
      }
      return [`${label}: ${show(field, value.from)} → ${show(field, value.to)}`];
    }
    if (isEmpty(value)) return [];
    return [`${label}: ${show(field, value)}`];
  });
}

/** The short "what changed" for the list, e.g. "Lives in, About", "Added", "+ Parent link". */
function whatChanged(change: Change): string {
  const [verb, ...rest] = change.action.split(" ");
  const thing = rest.join(" ");
  if (verb === "edited") {
    const fields = Object.keys(change.details ?? {}).map((f) => FIELD_LABELS[f] ?? f);
    return fields.length ? fields.join(", ") : "Edited";
  }
  if (thing === "parent link" || thing === "spouse link") {
    return `${verb === "added" ? "+" : "−"} ${thing === "parent link" ? "Parent" : "Spouse"} link`;
  }
  if (thing === "person") return verb === "added" ? "Added" : "Removed";
  if (change.action === "joined tree") return "Joined";
  if (change.action === "left or removed from tree") return "Left";
  if (change.action === "created tree") return "Tree created";
  if (change.action === "deleted tree") return "Tree deleted";
  return change.action;
}

/** Field names a change touched, for the Field filter. */
function fieldsOf(change: Change): string[] {
  const what = whatChanged(change);
  return change.action.startsWith("edited") ? what.split(", ") : [what];
}

/** Emails are long on a phone: show the part before the @ in the list. */
const shortWho = (who: string | null) => (who ? who.replace(/@.*$/, "") : "Someone");

const sameYear = (d: Date) => d.getFullYear() === new Date().getFullYear();
const shortDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, sameYear(d) ? { month: "numeric", day: "numeric" } : { month: "numeric", day: "numeric", year: "2-digit" });
};
/** "6:11p": short enough to sit on the same line as the date. */
const shortTime = (iso: string) => {
  const d = new Date(iso);
  const h = d.getHours();
  return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, "0")}${h < 12 ? "a" : "p"}`;
};
const fullDateTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

const plain = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

const uniqueSorted = (values: string[]) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));

const PAGE = 500;
const ROW = "grid grid-cols-[5.25rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-x-2";

interface Filters {
  text: string;
  who: string;
  subject: string;
  field: string;
}
const NO_FILTERS: Filters = { text: "", who: "", subject: "", field: "" };

/** Site owner only: every change anyone has made, newest first. */
export function ChangeHistoryDialog({ onClose }: { onClose(): void }) {
  const [scope, setScope] = useState<"tree" | "all">("tree");
  const [result, setResult] = useState<{ scope: "tree" | "all"; changes: Change[]; more: boolean } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    listChanges(scope, null, PAGE)
      .then((changes) => {
        if (!live) return;
        setError("");
        setResult({ scope, changes, more: changes.length === PAGE });
      })
      .catch((e) => live && setError(errorText(e)));
    return () => {
      live = false;
    };
  }, [scope]);

  const shown = result?.scope === scope ? result : null;

  const loadMore = async () => {
    if (!shown) return;
    setLoadingMore(true);
    try {
      const older = await listChanges(scope, shown.changes[shown.changes.length - 1]?.id ?? null, PAGE);
      setResult({ scope, changes: [...shown.changes, ...older], more: older.length === PAGE });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <ChangeHistoryView
      scope={scope}
      onScope={setScope}
      changes={shown?.changes ?? null}
      more={shown?.more ?? false}
      loadingMore={loadingMore}
      onLoadMore={() => void loadMore()}
      error={error}
      onClose={onClose}
    />
  );
}

/** The screen itself, given the changes to show. */
export function ChangeHistoryView({
  scope,
  onScope,
  changes,
  more,
  loadingMore,
  onLoadMore,
  error,
  onClose,
}: {
  scope: "tree" | "all";
  onScope(scope: "tree" | "all"): void;
  changes: Change[] | null;
  more: boolean;
  loadingMore: boolean;
  onLoadMore(): void;
  error: string;
  onClose(): void;
}) {
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [openId, setOpenId] = useState<number | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const options = useMemo(() => {
    const list = changes ?? [];
    return {
      who: uniqueSorted(list.map((c) => c.who ?? "")),
      subject: uniqueSorted(list.map((c) => c.subject ?? "")),
      field: uniqueSorted(list.flatMap(fieldsOf)),
    };
  }, [changes]);

  const filtered = useMemo(() => {
    const words = plain(filters.text).split(/\s+/).filter(Boolean);
    return (changes ?? []).filter((c) => {
      if (filters.who && c.who !== filters.who) return false;
      if (filters.subject && c.subject !== filters.subject) return false;
      if (filters.field && !fieldsOf(c).includes(filters.field)) return false;
      if (words.length) {
        const text = plain([c.who, c.subject, c.tree, c.action, whatChanged(c), ...describe(c)].join(" "));
        if (!words.every((w) => text.includes(w))) return false;
      }
      return true;
    });
  }, [changes, filters]);

  const activeFilters = Object.values(filters).filter(Boolean).length;
  const dropdownFilters = [filters.who, filters.subject, filters.field].filter(Boolean).length;
  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));
  const selectClass = `${inputClass} py-1.5 text-sm`;

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-ink/40 sm:items-center sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Change history"
        onClick={(e) => e.stopPropagation()}
        className="flex h-[92dvh] w-full max-w-2xl flex-col rounded-t-3xl bg-card shadow-2xl sm:rounded-3xl"
      >
        <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-2 sm:px-6">
          <h2 className="font-display text-xl font-semibold text-ink">Change history</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-xl text-muted hover:bg-paper hover:text-ink"
          >
            ×
          </button>
        </div>

        <div className="space-y-2 border-b border-line px-4 pb-3 sm:px-6">
          <div className="flex items-center gap-2">
            <div role="group" aria-label="Which trees" className="inline-flex shrink-0 rounded-full border border-line bg-white p-0.5 text-xs">
              {(["tree", "all"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={scope === option}
                  onClick={() => onScope(option)}
                  className={[
                    "cursor-pointer rounded-full px-2.5 py-1",
                    scope === option ? "bg-leaf font-semibold text-white" : "text-ink hover:bg-paper",
                  ].join(" ")}
                >
                  {option === "tree" ? "This tree" : "All trees"}
                </button>
              ))}
            </div>
            <input
              type="search"
              value={filters.text}
              onChange={(e) => set({ text: e.target.value })}
              placeholder="Search…"
              aria-label="Search changes"
              className={`${inputClass} min-w-0 flex-1 py-1.5 text-sm`}
            />
            <button
              type="button"
              aria-expanded={showFilters}
              onClick={() => setShowFilters((v) => !v)}
              className={[
                "shrink-0 cursor-pointer rounded-full border px-3 py-1.5 text-xs font-semibold",
                showFilters || dropdownFilters ? "border-leaf text-leaf-dark" : "border-line text-ink",
              ].join(" ")}
            >
              Filter{dropdownFilters ? ` (${dropdownFilters})` : ""}
            </button>
          </div>

          {showFilters && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <label className="block text-xs text-muted">
                Who changed it
                <select className={selectClass} value={filters.who} onChange={(e) => set({ who: e.target.value })}>
                  <option value="">Anyone</option>
                  {options.who.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs text-muted">
                Who or what was changed
                <select className={selectClass} value={filters.subject} onChange={(e) => set({ subject: e.target.value })}>
                  <option value="">Anyone</option>
                  {options.subject.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs text-muted">
                Field
                <select className={selectClass} value={filters.field} onChange={(e) => set({ field: e.target.value })}>
                  <option value="">Any</option>
                  {options.field.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {changes && (
            <p className="flex items-center justify-between text-[11px] text-muted">
              <span>
                {activeFilters
                  ? `${filtered.length} of ${changes.length} change${changes.length === 1 ? "" : "s"}`
                  : `${changes.length} change${changes.length === 1 ? "" : "s"}`}
                {more && " (older ones not loaded yet)"} · Tap one for details
              </span>
              {activeFilters > 0 && (
                <button type="button" onClick={() => setFilters(NO_FILTERS)} className="cursor-pointer underline">
                  Clear filters
                </button>
              )}
            </p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto pb-4">
          <div className="px-4 sm:px-6">
            <ErrorNote>{error}</ErrorNote>
          </div>
          {!changes && !error && <p className="py-6 text-center text-sm text-muted">Loading…</p>}
          {changes && filtered.length === 0 && (
            <p className="py-6 text-center text-sm text-muted">
              {changes.length ? "No changes match those filters." : "No changes recorded yet."}
            </p>
          )}

          {filtered.length > 0 && (
            <>
              <div
                className={`${ROW} sticky top-0 z-10 border-b border-line bg-card px-4 py-1.5 text-[10px] font-semibold tracking-wide text-muted uppercase sm:px-6`}
              >
                <span>When</span>
                <span>Who</span>
                <span>Changed</span>
                <span>Field</span>
              </div>
              <ul className="divide-y divide-line">
                {filtered.map((change) => {
                  const open = openId === change.id;
                  const lines = describe(change);
                  return (
                    <li key={change.id} className={open ? "bg-paper" : ""}>
                      <button
                        type="button"
                        aria-expanded={open}
                        onClick={() => setOpenId(open ? null : change.id)}
                        className={`${ROW} w-full cursor-pointer px-4 py-2 text-left text-xs text-ink hover:bg-paper sm:px-6`}
                      >
                        <span className="truncate whitespace-nowrap text-muted tabular-nums">
                          {shortDate(change.at)}
                          {sameYear(new Date(change.at)) && ` ${shortTime(change.at)}`}
                        </span>
                        <span className="truncate font-medium" title={change.who ?? undefined}>
                          {shortWho(change.who)}
                        </span>
                        <span className="truncate" title={change.subject ?? undefined}>
                          {change.subject ?? "—"}
                        </span>
                        <span className="truncate text-muted" title={whatChanged(change)}>
                          {whatChanged(change)}
                        </span>
                      </button>
                      {open && (
                        <div className="space-y-1 px-4 pb-3 text-xs text-ink sm:px-6">
                          <p className="text-muted">{fullDateTime(change.at)}</p>
                          <p>
                            <span className="font-semibold">{change.who ?? "Someone"}</span> {change.action}
                            {change.subject && <> · {change.subject}</>}
                          </p>
                          {change.tree && <p className="text-muted">Tree: {change.tree}</p>}
                          {lines.length > 0 ? (
                            <ul className="space-y-0.5 rounded-xl border border-line bg-white px-3 py-2 break-words">
                              {lines.map((line, n) => (
                                <li key={n}>{line}</li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {more && (
            <div className="pt-3 text-center">
              <button type="button" disabled={loadingMore} onClick={onLoadMore} className={secondaryButton}>
                {loadingMore ? "Loading…" : "Load older changes"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
