"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { createFamily, joinWithCode, openFamily, signOut, type SessionState } from "@/lib/session";
import { KeepAccessDialog } from "./KeepAccessDialog";
import { ErrorNote, Screen, TreeMark, inputClass, primaryButton, secondaryButton } from "./ui";

const errorText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong. Please try again.");

/** Shown after signing in when there is no single obvious family tree to open. */
export function FamilyPicker({ session }: { session: SessionState }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [keepAccess, setKeepAccess] = useState(false);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  const onCreate = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim()) void run(() => createFamily(name.trim()));
  };

  const onJoin = (e: FormEvent) => {
    e.preventDefault();
    if (code.trim()) void run(() => joinWithCode(code.trim()));
  };

  const onSignOut = () => {
    if (
      session.isGuest &&
      !window.confirm(
        "You joined without an email, so signing out means you’ll need an invite link to get back in, and you’ll show up as someone new. To avoid that, choose “Sign up with email to make updates” first. Sign out anyway?",
      )
    ) {
      return;
    }
    void run(signOut);
  };

  return (
    <Screen>
      <TreeMark />
      <h1 className="mt-4 font-display text-3xl font-semibold">
        {session.families.length
          ? "Your family trees"
          : session.canCreate
            ? "Let’s set up your family tree"
            : "Join your family tree"}
      </h1>

      <div className="mt-4 space-y-6">
        <ErrorNote>{error || session.error}</ErrorNote>

        {session.families.length > 0 && (
          <ul className="space-y-2">
            {session.families.map((family) => (
              <li key={family.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void openFamily(family.id)}
                  className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-2xl border border-line bg-white px-4 py-3 text-left hover:border-leaf"
                >
                  <span className="font-semibold">{family.name}</span>
                  <span className="text-xs text-muted">{family.role === "organizer" ? "Organizer" : family.role === "moderator" ? "Moderator" : "Member"}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {session.canCreate && (
          <form onSubmit={onCreate} className="space-y-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Start a new family tree</span>
              <input
                className={inputClass}
                placeholder="The ______ Family"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <button type="submit" disabled={busy || !name.trim()} className={primaryButton}>
              Create tree
            </button>
          </form>
        )}

        <form onSubmit={onJoin} className={session.canCreate ? "space-y-2 border-t border-line pt-6" : "space-y-2"}>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Join a tree with an invite code</span>
            <input
              className={inputClass}
              placeholder="Invite code"
              autoCapitalize="none"
              autoCorrect="off"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          <button type="submit" disabled={busy || !code.trim()} className={secondaryButton}>
            Join
          </button>
        </form>

        <p className="border-t border-line pt-4 text-sm text-muted">
          {session.email ? `Signed in as ${session.email}` : "Signed in on this device without an email"} ·{" "}
          <button type="button" onClick={onSignOut} className="cursor-pointer underline">
            Sign out
          </button>
          {session.isGuest && (
            <>
              {" · "}
              <button type="button" onClick={() => setKeepAccess(true)} className="cursor-pointer font-semibold text-leaf-dark underline">
                Sign up with email to make updates
              </button>
            </>
          )}
        </p>
        {keepAccess && <KeepAccessDialog onClose={() => setKeepAccess(false)} />}
      </div>
    </Screen>
  );
}
