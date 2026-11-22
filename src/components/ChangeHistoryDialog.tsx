"use client";

import { useEffect, useState } from "react";
import { listChanges, type Change } from "@/lib/store";
import { ErrorNote, secondaryButton } from "./ui";

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
    if (isEmpty(value) || field === "name") return [];
    return [`${label}: ${show(field, value)}`];
  });
}

const dayOf = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

const PAGE = 100;

/** Site owner only: every change anyone has made, newest first. */
export function ChangeHistoryDialog({ onClose }: { onClose(): void }) {
  const [scope, setScope] = useState<"tree" | "all">("tree");
  const [result, setResult] = useState<{ scope: "tree" | "all"; changes: Change[]; more: boolean } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    listChanges(scope, null)
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
      const older = await listChanges(scope, shown.changes[shown.changes.length - 1]?.id ?? null);
      setResult({ scope, changes: [...shown.changes, ...older], more: older.length === PAGE });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-ink/40 sm:items-center sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Change history"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-3xl bg-card shadow-2xl sm:rounded-3xl"
      >
        <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-2">
          <div>
            <h2 className="font-display text-2xl font-semibold text-ink">Change history</h2>
            <p className="mt-1 text-sm text-muted">Every change anyone has made. Only you can see this.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mt-1 -mr-1 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-xl text-muted hover:bg-paper hover:text-ink"
          >
            ×
          </button>
        </div>

        <div className="px-6 pb-2">
          <div role="group" aria-label="Which trees" className="inline-flex rounded-full border border-line bg-white p-0.5 text-sm">
            {(["tree", "all"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={scope === option}
                onClick={() => setScope(option)}
                className={[
                  "cursor-pointer rounded-full px-3 py-1",
                  scope === option ? "bg-leaf font-semibold text-white" : "text-ink hover:bg-paper",
                ].join(" ")}
              >
                {option === "tree" ? "This tree" : "All trees"}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pt-1 pb-4">
          <ErrorNote>{error}</ErrorNote>
          {!shown && !error && <p className="py-6 text-center text-sm text-muted">Loading…</p>}
          {shown && shown.changes.length === 0 && (
            <p className="py-6 text-center text-sm text-muted">No changes recorded yet.</p>
          )}

          {shown && shown.changes.length > 0 && (
            <ol className="space-y-1">
              {shown.changes.map((change, i) => {
                const day = dayOf(change.at);
                const header = i === 0 || day !== dayOf(shown.changes[i - 1].at);
                const lines = describe(change);
                return (
                  <li key={change.id}>
                    {header && (
                      <h3 className="sticky top-0 bg-card pt-3 pb-1 text-xs font-semibold tracking-wide text-muted uppercase">
                        {day}
                      </h3>
                    )}
                    <div className="rounded-xl border border-line bg-white px-3 py-2">
                      <p className="text-sm text-ink">
                        <span className="font-semibold">{change.who ?? "Someone"}</span> {change.action}
                        {change.subject && <> · {change.subject}</>}
                      </p>
                      {lines.length > 0 && (
                        <ul className="mt-0.5 space-y-0.5 text-xs break-words text-ink/80">
                          {lines.map((line, n) => (
                            <li key={n}>{line}</li>
                          ))}
                        </ul>
                      )}
                      <p className="mt-0.5 text-[11px] text-muted">
                        {timeOf(change.at)}
                        {scope === "all" && change.tree && <> · {change.tree}</>}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          {shown?.more && (
            <div className="pt-3 text-center">
              <button type="button" disabled={loadingMore} onClick={() => void loadMore()} className={secondaryButton}>
                {loadingMore ? "Loading…" : "Show older changes"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
