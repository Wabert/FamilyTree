"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { continueAsGuest, rememberInvite, sendSignInEmail, verifyEmailCode } from "@/lib/session";
import { ErrorNote, Screen, TreeMark, inputClass, primaryButton, secondaryButton } from "./ui";

const errorText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong. Please try again.");

export function SignIn({ inviteCode, linkError }: { inviteCode: string | null; linkError: string }) {
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [typingInvite, setTypingInvite] = useState(false);
  const [invite, setInvite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const onEmail = (e: FormEvent) => {
    e.preventDefault();
    const address = email.trim();
    if (!address) return;
    void run(async () => {
      await sendSignInEmail(address);
      setSentTo(address);
    });
  };

  const onCode = (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    void run(() => verifyEmailCode(sentTo, code.trim()));
  };

  const onInvite = (e: FormEvent) => {
    e.preventDefault();
    if (!invite.trim()) return;
    rememberInvite(invite);
    setTypingInvite(false);
  };

  if (sentTo) {
    return (
      <Screen>
        <TreeMark />
        <h1 className="mt-4 font-display text-3xl font-semibold">Check your email</h1>
        <p className="mt-2 text-sm text-muted">
          We sent a sign-in link to <strong className="font-semibold text-ink">{sentTo}</strong>. Open it on this
          device and you’ll be signed in.
        </p>
        <form onSubmit={onCode} className="mt-6 space-y-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">If the email has a 6-digit code, enter it here</span>
            <input
              className={inputClass}
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          <ErrorNote>{error}</ErrorNote>
          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={busy || !code.trim()} className={primaryButton}>
              Sign in
            </button>
            <button
              type="button"
              onClick={() => {
                setSentTo("");
                setCode("");
                setError("");
              }}
              className={secondaryButton}
            >
              Use a different email
            </button>
          </div>
        </form>
      </Screen>
    );
  }

  return (
    <Screen>
      <TreeMark />
      <h1 className="mt-4 font-display text-3xl font-semibold">
        {inviteCode ? "You’re invited to the family tree" : "Family Reunion"}
      </h1>
      <p className="mt-2 text-sm text-muted">
        {inviteCode
          ? "Find yourself in the tree, add your photo, and see how you’re related to everyone."
          : "Build your family’s tree together and see how everyone is related."}
      </p>

      {inviteCode && (
        <div className="mt-6">
          <button type="button" disabled={busy} onClick={() => void run(continueAsGuest)} className={`${primaryButton} w-full`}>
            Join the family tree
          </button>
          <p className="mt-2 text-xs text-muted">
            No account needed. You’ll stay signed in on this device; to use more than one device, sign in with your
            email below instead.
          </p>
        </div>
      )}

      <form onSubmit={onEmail} className={`space-y-3 ${inviteCode ? "mt-6 border-t border-line pt-6" : "mt-6"}`}>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">
            {inviteCode ? "Or sign in with your email" : "Sign in with your email"}
          </span>
          <input
            className={inputClass}
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <ErrorNote>{error || linkError}</ErrorNote>
        <button type="submit" disabled={busy || !email.trim()} className={inviteCode ? secondaryButton : primaryButton}>
          Email me a sign-in link
        </button>
      </form>

      <div className="mt-6 border-t border-line pt-4 text-sm">
        {inviteCode ? (
          <button type="button" onClick={() => rememberInvite(null)} className="cursor-pointer text-muted underline">
            I’m not joining with an invite
          </button>
        ) : typingInvite ? (
          <form onSubmit={onInvite} className="flex gap-2">
            <input
              className={inputClass}
              placeholder="Invite code"
              autoFocus
              autoCapitalize="none"
              autoCorrect="off"
              value={invite}
              onChange={(e) => setInvite(e.target.value)}
            />
            <button type="submit" disabled={!invite.trim()} className={secondaryButton}>
              Next
            </button>
          </form>
        ) : (
          <button type="button" onClick={() => setTypingInvite(true)} className="cursor-pointer text-muted underline">
            I have an invite code
          </button>
        )}
      </div>
    </Screen>
  );
}
