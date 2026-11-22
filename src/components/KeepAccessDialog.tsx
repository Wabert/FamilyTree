"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { addEmailToGuest, checkGuestEmailConfirmed, confirmGuestEmail } from "@/lib/session";
import { ErrorNote, inputClass, primaryButton, secondaryButton } from "./ui";

const errorText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong. Please try again.");

/**
 * For someone who joined from an invite link without an email: add one, so
 * they can sign back in from any phone or browser as the same person.
 */
export function KeepAccessDialog({ onClose }: { onClose(): void }) {
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setNote("");
    try {
      await action();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const send = (e: FormEvent) => {
    e.preventDefault();
    const address = email.trim();
    if (!address) return;
    void run(async () => {
      await addEmailToGuest(address);
      setSentTo(address);
    });
  };

  const confirmCode = (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    void run(async () => {
      await confirmGuestEmail(sentTo, code.trim());
      setDone(true);
    });
  };

  const checkLink = () =>
    void run(async () => {
      if (await checkGuestEmailConfirmed()) setDone(true);
      else setNote("Not confirmed yet. Tap the link in the email first, then try again.");
    });

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-ink/40 sm:items-center sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Keep your access"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92dvh] w-full max-w-md flex-col rounded-t-3xl bg-card shadow-2xl sm:rounded-3xl"
      >
        <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-2">
          <h2 className="font-display text-2xl font-semibold text-ink">{done ? "You’re all set" : "Keep your access"}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mt-1 -mr-1 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-xl text-muted hover:bg-paper hover:text-ink"
          >
            ×
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-6 pb-6">
          <ErrorNote>{error}</ErrorNote>
          {note && <p className="rounded-xl bg-paper px-3 py-2 text-sm text-ink">{note}</p>}

          {done ? (
            <>
              <p className="text-sm text-ink">
                Your email is saved{sentTo ? <> as <strong className="font-semibold">{sentTo}</strong></> : null}. You can
                now sign in with it on any phone or browser and you’ll be right back in your family tree, as the same
                person.
              </p>
              <button type="button" onClick={onClose} className={primaryButton}>
                Done
              </button>
            </>
          ) : sentTo ? (
            <>
              <p className="text-sm text-ink">
                We sent an email to <strong className="font-semibold">{sentTo}</strong>. Tap the link in it to confirm.
                If it shows a code instead, type it here.
              </p>
              <form onSubmit={confirmCode} className="flex gap-2">
                <input
                  className={`${inputClass} min-w-0 flex-1`}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="Code from the email"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
                <button type="submit" disabled={busy || !code.trim()} className={primaryButton}>
                  Confirm
                </button>
              </form>
              <div className="flex flex-wrap gap-2 border-t border-line pt-4">
                <button type="button" disabled={busy} onClick={checkLink} className={secondaryButton}>
                  I tapped the link
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setSentTo("");
                    setCode("");
                    setError("");
                    setNote("");
                  }}
                  className="cursor-pointer px-2 text-sm text-muted underline-offset-2 hover:underline"
                >
                  Use a different email
                </button>
              </div>
              <p className="text-xs text-muted">
                Nothing arriving? Check your spam folder. Until it’s confirmed you’re still signed in here as before.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-ink">
                You joined on this device without an email, so your access lives only in this browser. If you switch
                phones, use a different browser, or clear your browsing data, you’d need a new invite link and would
                show up as someone new.
              </p>
              <p className="text-sm text-ink">
                Add your email and you can sign back in anywhere as the same person. Everything stays as it is: your
                trees, who you said you are, and what you’ve added.
              </p>
              <form onSubmit={send} className="space-y-2">
                <input
                  type="email"
                  className={inputClass}
                  placeholder="you@example.com"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <button type="submit" disabled={busy || !email.trim()} className={primaryButton}>
                  {busy ? "Sending…" : "Send confirmation"}
                </button>
              </form>
              <p className="text-xs text-muted">We only use it to let you sign in. Other relatives don’t see it; the tree’s organizer and moderators can.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
