"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { siblingsOf, type FamilyIndex } from "@/lib/graph";
import type { Relationship } from "@/lib/relationship";
import { MAX_GALLERY, type Person } from "@/lib/types";
import { Avatar, lifespan } from "./Avatar";
import { RelationNote } from "./RelationNote";

const GENDER_LABEL = { male: "Male", female: "Female", other: "Other" } as const;

/** Everything about one person: facts, notes, extra photos, family, and the actions that change them. */
export function PersonDetails({
  person,
  index,
  meId,
  relation,
  showRelation,
  canRemove,
  onClose,
  onSelect,
  onEdit,
  onDelete,
}: {
  person: Person;
  index: FamilyIndex;
  meId: string | null;
  relation: Relationship | null;
  /** The viewer can turn relationship labels off in the menu. */
  showRelation: boolean;
  canRemove: boolean;
  onClose(): void;
  onSelect(id: string): void;
  onEdit(): void;
  onDelete(): void;
}) {
  const [viewing, setViewing] = useState<number | null>(null);
  const parents = index.parentsOf(person.id);
  const gallery = person.gallery ?? [];

  const facts: [string, string | number][] = [];
  if (person.birthYear) facts.push(["Born", person.birthYear]);
  if (person.deathYear) facts.push(["Died", person.deathYear]);
  if (person.gender) facts.push(["Gender", GENDER_LABEL[person.gender]]);
  if (person.location) facts.push(["Lives in", person.location]);

  const groups: [string, string[]][] = [
    ["Parents", parents],
    ["Spouse", index.spousesOf(person.id)],
    ["Siblings", siblingsOf(index, person.id)],
    ["Children", index.childrenOf(person.id)],
  ];

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-ink/40 sm:items-center sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Details for ${person.name}`}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92dvh] w-full max-w-2xl flex-col rounded-t-3xl bg-card shadow-2xl sm:rounded-3xl"
      >
        <div className="flex items-start gap-4 px-6 pt-6 pb-4">
          <Avatar person={person} size={96} />
          <div className="min-w-0 flex-1 pt-1">
            <h2 className="font-display text-3xl leading-tight font-semibold text-ink">{person.name}</h2>
            {person.nickname && <p className="mt-1 text-base text-ink italic">“{person.nickname}”</p>}
            {lifespan(person) && <p className="mt-1 text-sm text-muted">{lifespan(person)}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close details"
            className="-mt-1 -mr-2 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-xl text-muted hover:bg-paper hover:text-ink"
          >
            ×
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 pb-6">
          {showRelation && <RelationNote person={person} index={index} meId={meId} relation={relation} />}

          {facts.length > 0 && (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
              {facts.map(([label, value]) => (
                <div key={label} className={label === "Lives in" ? "col-span-2" : undefined}>
                  <dt className="text-xs font-semibold tracking-wide text-muted uppercase">{label}</dt>
                  <dd className="mt-0.5 text-sm text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          )}

          {person.bio && (
            <Section title="About">
              <p className="text-sm leading-relaxed whitespace-pre-line text-ink">{person.bio}</p>
            </Section>
          )}

          <Section title="Photos">
            {gallery.length ? (
              <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {gallery.map((url, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setViewing(i)}
                    aria-label={`View photo ${i + 1} of ${person.name}`}
                    className="aspect-square cursor-zoom-in overflow-hidden rounded-xl border border-line bg-paper"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- user-supplied data or signed URL */}
                    <img src={url} alt="" className="h-full w-full object-cover" draggable={false} />
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted">
                Photos are reduced in size and quality when they’re uploaded, so these aren’t the full original
                pictures.
              </p>
              </>
            ) : (
              <p className="text-sm text-muted">
                No photos yet. Add up to {MAX_GALLERY} with{" "}
                <button type="button" onClick={onEdit} className="cursor-pointer text-leaf-dark underline">
                  Edit details
                </button>
                .
              </p>
            )}
          </Section>

          {groups.map(([title, ids]) =>
            ids.length ? (
              <Section key={title} title={title}>
                <div className="flex flex-wrap gap-2">
                  {ids.map((id) => {
                    const relative = index.byId.get(id);
                    if (!relative) return null;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => onSelect(id)}
                        className="flex cursor-pointer items-center gap-2 rounded-full border border-line bg-white py-1 pr-3 pl-1 text-sm text-ink hover:border-leaf"
                      >
                        <Avatar person={relative} size={24} />
                        {relative.name}
                      </button>
                    );
                  })}
                </div>
              </Section>
            ) : null,
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line px-6 py-4">
          {canRemove ? (
            <button
              type="button"
              onClick={onDelete}
              className="cursor-pointer text-sm text-clay underline-offset-2 hover:underline"
            >
              Remove from tree
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={onEdit}
            className="cursor-pointer rounded-full bg-leaf px-5 py-2 text-sm font-semibold text-white hover:bg-leaf-dark"
          >
            Edit details
          </button>
        </div>
      </div>

      {viewing !== null && gallery[viewing] && (
        <PhotoViewer
          photos={gallery}
          index={viewing}
          name={person.name}
          onChange={setViewing}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}

/** One photo at full size, with previous / next and keyboard arrows. */
function PhotoViewer({
  photos,
  index,
  name,
  onChange,
  onClose,
}: {
  photos: string[];
  index: number;
  name: string;
  onChange(index: number): void;
  onClose(): void;
}) {
  const count = photos.length;
  const step = (by: number) => onChange((index + by + count) % count);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") onChange((index - 1 + count) % count);
      else if (e.key === "ArrowRight") onChange((index + 1) % count);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, count, onChange, onClose]);

  const navButton =
    "absolute top-1/2 flex h-11 w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-black/50 text-2xl text-white hover:bg-black/70";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Photo ${index + 1} of ${count} of ${name}`}
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/85 p-4"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- user-supplied data or signed URL */}
      <img
        src={photos[index]}
        alt={`Photo ${index + 1} of ${name}`}
        onClick={(e) => e.stopPropagation()}
        className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
      />
      <button
        type="button"
        onClick={onClose}
        aria-label="Close photo"
        className="absolute top-4 right-4 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-black/50 text-2xl text-white hover:bg-black/70"
      >
        ×
      </button>
      {count > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous photo"
            onClick={(e) => {
              e.stopPropagation();
              step(-1);
            }}
            className={`${navButton} left-4`}
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Next photo"
            onClick={(e) => {
              e.stopPropagation();
              step(1);
            }}
            className={`${navButton} right-4`}
          >
            ›
          </button>
        </>
      )}
      <div className="pointer-events-none absolute inset-x-4 bottom-4 flex flex-col items-center gap-2 text-center text-white">
        {count > 1 && (
          <p className="rounded-full bg-black/50 px-3 py-1 text-sm">
            {index + 1} / {count}
          </p>
        )}
        <p className="rounded-full bg-black/50 px-3 py-1 text-xs">Reduced-quality copy, not the original photo</p>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">{title}</h3>
      {children}
    </section>
  );
}
