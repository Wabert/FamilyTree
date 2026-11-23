"use client";

import { oldestFirst, type FamilyIndex } from "@/lib/graph";
import { orderSpouses } from "@/lib/marriage";
import type { Relationship } from "@/lib/relationship";
import type { Person } from "@/lib/types";
import { Avatar, lifespan } from "./Avatar";
import { firstName } from "./FocusView";
import { RelationNote } from "./RelationNote";

/**
 * The quick card shown when someone is tapped: who they are at a glance, their
 * closest family to hop to, and ways into their full details and Focus view.
 */
export function PersonPanel({
  person,
  index,
  meId,
  relation,
  showRelation,
  onClose,
  onDetails,
  onGo,
  onFocus,
}: {
  person: Person;
  index: FamilyIndex;
  meId: string | null;
  relation: Relationship | null;
  /** The viewer can turn relationship labels off in the menu. */
  showRelation: boolean;
  onClose(): void;
  onDetails(): void;
  /** Tapping a relative's name: move to them. */
  onGo(id: string): void;
  /** Switch to Focus view, on this person. */
  onFocus(): void;
}) {
  const years = lifespan(person);
  const photoCount = person.gallery?.length ?? 0;

  // Current spouse first; children oldest first, like everywhere else.
  const parents = index.parentsOf(person.id);
  const spouses = orderSpouses(index, person.id, index.spousesOf(person.id)).reverse();
  const children = [...index.childrenOf(person.id)].sort(oldestFirst(index));
  const relatives = (
    [
      [parents.length > 1 ? "Parents" : "Parent", parents],
      [spouses.length > 1 ? "Spouses" : "Spouse", spouses],
      [children.length > 1 ? "Children" : "Child", children],
    ] as const
  ).filter(([, ids]) => ids.length > 0);

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

        {relatives.length > 0 && (
          <dl className="space-y-1.5">
            {relatives.map(([label, ids]) => (
              <div key={label} className="flex items-start gap-2">
                <dt className="w-[4.25rem] shrink-0 pt-2 text-[11px] font-semibold tracking-wide text-muted uppercase">
                  {label}
                </dt>
                <dd className="flex min-w-0 flex-wrap gap-1.5">
                  {ids.map((id) => {
                    const relative = index.byId.get(id);
                    if (!relative) return null;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => onGo(id)}
                        aria-label={`Go to ${relative.name}`}
                        title={relative.name}
                        className="flex max-w-full cursor-pointer items-center gap-1.5 rounded-full border border-line bg-white py-1 pr-3 pl-1 text-sm font-medium text-ink hover:border-leaf active:bg-leaf-soft"
                      >
                        <Avatar person={relative} size={24} />
                        {/* First names keep the card short on a phone; the group says which John. */}
                        <span className="truncate">{firstName(relative)}</span>
                      </button>
                    );
                  })}
                </dd>
              </div>
            ))}
          </dl>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onDetails}
            className="flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-2 rounded-full bg-leaf px-4 py-2.5 text-sm font-semibold text-white hover:bg-leaf-dark"
          >
            Details
            {photoCount > 0 && (
              <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-medium whitespace-nowrap">
                {photoCount} {photoCount === 1 ? "photo" : "photos"}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={onFocus}
            title="Show just this person with their parents, siblings and children"
            className="min-w-0 flex-1 cursor-pointer truncate rounded-full border border-leaf bg-white px-4 py-2.5 text-sm font-semibold text-leaf-dark hover:bg-leaf-soft"
          >
            Focus on {firstName(person) || "them"}
          </button>
        </div>
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
