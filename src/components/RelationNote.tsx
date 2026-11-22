"use client";

import type { FamilyIndex } from "@/lib/graph";
import type { Relationship } from "@/lib/relationship";
import type { Person } from "@/lib/types";

function joinNames(names: string[]) {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * "Ann is your second cousin". Shared by the card and the details screen.
 * Who the viewer is gets chosen only from the "I am" picker in the menu.
 */
export function RelationNote({
  person,
  index,
  meId,
  relation,
}: {
  person: Person;
  index: FamilyIndex;
  meId: string | null;
  relation: Relationship | null;
}) {
  const firstName = person.name.trim().split(/\s+/)[0] || "This person";
  const ancestors = (relation?.commonAncestorIds ?? [])
    .map((id) => index.byId.get(id)?.name)
    .filter((name): name is string => Boolean(name));

  return (
    <div className="rounded-2xl bg-leaf-soft px-4 py-3 text-sm text-leaf-dark">
      {person.id === meId ? (
        <p className="font-medium">This is you.</p>
      ) : relation ? (
        <>
          <p>
            {firstName} is <strong className="font-semibold">{relation.phrase}</strong>.
          </p>
          {ancestors.length > 0 && <p className="mt-1 opacity-80">You both descend from {joinNames(ancestors)}.</p>}
        </>
      ) : (
        <p>Choose who you are under “I am” in the ⋯ menu to see how you’re related to everyone.</p>
      )}
    </div>
  );
}
