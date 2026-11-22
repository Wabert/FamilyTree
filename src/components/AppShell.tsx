"use client";

import { useSessionState } from "@/lib/session";
import { FamilyApp } from "./FamilyApp";
import { FamilyPicker } from "./FamilyPicker";
import { SignIn } from "./SignIn";

/** Picks the screen: sign in, choose a family tree, or the tree itself. */
export function AppShell() {
  const session = useSessionState();

  if (session.phase === "loading" || session.phase === "opening") {
    return (
      <div className="flex h-dvh items-center justify-center bg-paper text-sm text-muted" role="status">
        Opening the family tree…
      </div>
    );
  }
  if (session.phase === "signedOut") return <SignIn inviteCode={session.inviteCode} linkError={session.error} />;
  if (session.phase === "choosing") return <FamilyPicker session={session} />;
  return <FamilyApp session={session} />;
}
