"use client";

import { useEffect, useMemo, useState } from "react";
import { listMembers, removeMember, resetInviteCode, setMemberRole, type Member, type Role } from "@/lib/store";
import type { Family } from "@/lib/types";
import { Avatar } from "./Avatar";
import { ErrorNote, secondaryButton } from "./ui";

const errorText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong. Please try again.");

const joinedOn = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

/**
 * For the organizer and moderators: everyone who has joined this family tree,
 * with a way to remove them. The organizer can also make people moderators.
 */
export function MembersDialog({
  family,
  currentUserId,
  myRole,
  onClose,
}: {
  family: Family;
  currentUserId: string | null;
  myRole: Role;
  onClose(): void;
}) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    let live = true;
    listMembers()
      .then((list) => live && setMembers(list))
      .catch((e) => live && setError(errorText(e)));
    return () => {
      live = false;
    };
  }, [version]);

  const people = useMemo(() => new Map(family.people.map((p) => [p.id, p])), [family]);
  const addedBy = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of family.people) if (p.createdBy) counts.set(p.createdBy, (counts.get(p.createdBy) ?? 0) + 1);
    return counts;
  }, [family]);

  // Only the organizer hands out moderator status or removes a moderator.
  const canChangeRoles = myRole === "organizer";

  const labelFor = (member: Member) =>
    (member.personId && people.get(member.personId)?.name) || member.email || "this guest";

  const run = async (action: () => Promise<void>, done: string) => {
    setBusy(true);
    setError("");
    setNote("");
    try {
      await action();
      setNote(done);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = (member: Member) => {
    const added = addedBy.get(member.userId) ?? 0;
    const kept = added ? ` The ${added === 1 ? "person" : `${added} people`} they added will stay in the tree.` : "";
    if (!window.confirm(`Remove ${labelFor(member)} from this family tree? They’ll lose access straight away.${kept}`)) {
      return;
    }
    void run(async () => {
      await removeMember(member.userId);
      setVersion((v) => v + 1);
    }, "Removed. They could still rejoin with the current invite link, so reset it below if you don’t want that.");
  };

  const changeRole = (member: Member, role: "moderator" | "member") => {
    const name = labelFor(member);
    const question =
      role === "moderator"
        ? `Make ${name} a moderator? They’ll be able to see this list, remove members, remove anyone from the tree, rename the tree and reset the invite link. They can’t remove you or other moderators.`
        : `Take moderator status away from ${name}? They’ll go back to being a regular member.`;
    if (!window.confirm(question)) return;
    void run(
      async () => {
        await setMemberRole(member.userId, role);
        setVersion((v) => v + 1);
      },
      role === "moderator" ? "They’re now a moderator." : "They’re a regular member again.",
    );
  };

  const reset = () => {
    if (
      !window.confirm(
        "Make a new invite link? The current link and QR code will stop working. People who have already joined keep their access.",
      )
    ) {
      return;
    }
    void run(resetInviteCode, "The invite link has been reset. Use Invite to share the new one.");
  };

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-ink/40 sm:items-center sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Members"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-3xl bg-card shadow-2xl sm:rounded-3xl"
      >
        <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-2">
          <div>
            <h2 className="font-display text-2xl font-semibold text-ink">Members</h2>
            <p className="mt-1 text-sm text-muted">
              {members
                ? `${members.length} ${members.length === 1 ? "person has" : "people have"} joined this family tree. Only the organizer and moderators can see this list.`
                : "Everyone who has joined this family tree."}
            </p>
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

        <div className="flex-1 space-y-3 overflow-y-auto px-6 py-3">
          <ErrorNote>{error}</ErrorNote>
          {note && <p className="rounded-xl bg-leaf-soft px-3 py-2 text-sm text-leaf-dark">{note}</p>}
          {!members && !error && <p className="py-6 text-center text-sm text-muted">Loading…</p>}

          {members && (
            <ul className="divide-y divide-line rounded-2xl border border-line bg-white">
              {members.map((member) => {
                const person = member.personId ? people.get(member.personId) : undefined;
                const added = addedBy.get(member.userId) ?? 0;
                const isYou = member.userId === currentUserId;
                const details = [
                  member.email ?? "Joined by invite link, no email",
                  `joined ${joinedOn(member.joinedAt)}`,
                  added ? `added ${added} ${added === 1 ? "person" : "people"}` : "",
                ].filter(Boolean);
                return (
                  <li key={member.userId} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
                    <Avatar person={person ?? { id: member.userId, name: member.email ?? "?" }} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-x-2 text-sm font-semibold text-ink">
                        {person ? (
                          <span className="truncate">{person.name}</span>
                        ) : (
                          <span className="font-normal text-muted italic">Hasn’t picked who they are</span>
                        )}
                        {isYou && <Badge>You</Badge>}
                        {member.role === "organizer" && <Badge>Organizer</Badge>}
                        {member.role === "moderator" && <Badge>Moderator</Badge>}
                      </p>
                      <p className="text-xs break-words text-muted">{details.join(" · ")}</p>
                    </div>
                    {canChangeRoles && !isYou && member.role !== "organizer" && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => changeRole(member, member.role === "moderator" ? "member" : "moderator")}
                        className="shrink-0 cursor-pointer rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:border-leaf disabled:cursor-default disabled:opacity-60"
                      >
                        {member.role === "moderator" ? "Remove moderator" : "Make moderator"}
                      </button>
                    )}
                    {!isYou && (member.role === "member" || (canChangeRoles && member.role === "moderator")) && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => remove(member)}
                        className="shrink-0 cursor-pointer rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-clay hover:border-clay disabled:cursor-default disabled:opacity-60"
                      >
                        Remove
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-6 py-4">
          <p className="min-w-0 flex-1 basis-48 text-xs text-muted">
            Resetting the invite link stops the old link and QR code from working.
          </p>
          <button type="button" disabled={busy} onClick={reset} className={secondaryButton}>
            Reset invite link
          </button>
        </div>
      </div>
    </div>
  );
}

function Badge({ children }: { children: string }) {
  return (
    <span className="rounded-full bg-leaf-soft px-2 py-0.5 text-[10px] font-semibold tracking-wide text-leaf-dark uppercase">
      {children}
    </span>
  );
}
