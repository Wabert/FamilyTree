"use client";

import type { FamilyIndex } from "@/lib/graph";
import type { Relationship } from "@/lib/relationship";
import type { Person } from "@/lib/types";
import { Avatar, lifespan } from "./Avatar";
import { RelationNote } from "./RelationNote";

/** The quick card shown when someone is tapped: who they are at a glance, with a way into their full details. */
export function PersonPanel({
  person,
  index,
  meId,
  relation,
  showRelation,
  onClose,
  onDetails,
}: {
  person: Person;
  index: FamilyIndex;
  meId: string | null;
  relation: Relationship | null;
  /** The viewer can turn relationship labels off in the menu. */
  showRelation: boolean;
  onClose(): void;
  onDetails(): void;
}) {
  const years = lifespan(person);
  const photoCount = person.gallery?.length ?? 0;

  return (
    <aside
      data-person-panel
      aria-label={`About ${person.name}`}
      className="absolute inset-x-0 bottom-0 z-10 flex max-h-[62%] flex-col rounded-t-3xl border border-line bg-card shadow-xl md:inset-x-auto md:top-4 md:right-4 md:bottom-auto md:max-h-[calc(100%-2rem)] md:w-[360px] md:rounded-3xl"
    >
      <div className="flex items-start gap-4 p-5 pb-3">
        <Avatar person={person} size={72} />
        <div className="min-w-0 flex-1 pt-1">
          <h2 className="font-display text-2xl leading-tight font-semibold text-ink">{person.name}</h2>
          {person.nickname && <p className="mt-0.5 text-sm text-ink italic">“{person.nickname}”</p>}
          {years && <p className="mt-1 text-sm text-muted">{years}</p>}
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

      <div className="flex-1 space-y-4 overflow-y-auto px-5 pb-5">
        {person.location && (
          <p className="flex items-center gap-2 text-sm text-ink">
            <PinIcon />
            {person.location}
          </p>
        )}

        {person.bio && (
          <p className="line-clamp-4 text-sm leading-relaxed whitespace-pre-line text-ink">{person.bio}</p>
        )}

        {showRelation && <RelationNote person={person} index={index} meId={meId} relation={relation} />}

        <button
          type="button"
          onClick={onDetails}
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-leaf px-5 py-2.5 text-sm font-semibold text-white hover:bg-leaf-dark"
        >
          Details
          {photoCount > 0 && (
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-medium">
              {photoCount} {photoCount === 1 ? "photo" : "photos"}
            </span>
          )}
        </button>
      </div>
    </aside>
  );
}

function PinIcon() {
  return (
    <svg aria-hidden viewBox="0 0 20 20" width="16" height="16" className="shrink-0 text-muted" fill="currentColor">
      <path d="M10 1.5a6 6 0 0 0-6 6c0 4.2 5.1 10.2 5.4 10.5a.8.8 0 0 0 1.2 0C10.9 17.7 16 11.7 16 7.5a6 6 0 0 0-6-6Zm0 8.3a2.3 2.3 0 1 1 0-4.6 2.3 2.3 0 0 1 0 4.6Z" />
    </svg>
  );
}
