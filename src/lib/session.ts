import { useSyncExternalStore } from "react";
import type { Session } from "@supabase/supabase-js";
import { friendly, type Role } from "./remote";
import { closeRemoteFamily, onRemovedFromFamily, openRemoteFamily } from "./store";
import { signInLinkError, supabase } from "./supabase";

/**
 * Who is signed in and which family tree they have open. This drives which
 * screen the app shows: sign-in, the list of family trees, or the tree itself.
 */

export interface FamilySummary {
  id: string;
  name: string;
  role: Role;
}

export interface SessionState {
  phase: "loading" | "signedOut" | "choosing" | "opening" | "open";
  userId: string | null;
  email: string | null;
  /** Joined without an email: the account exists on this device only. */
  isGuest: boolean;
  families: FamilySummary[];
  /** May start new family trees (only approved accounts can). */
  canCreate: boolean;
  /** An invite the person arrived with and hasn't used yet. */
  inviteCode: string | null;
  error: string;
}

const PENDING_INVITE_KEY = "family-reunion:pending-invite";
const CURRENT_FAMILY_KEY = "family-reunion:current-family";

const SIGNED_OUT = { userId: null, email: null, isGuest: false, families: [], canCreate: false };

/** Demo mode has no accounts: the app goes straight to the tree. */
const LOCAL_STATE: SessionState = { ...SIGNED_OUT, phase: "open", inviteCode: null, error: "" };
const LOADING_STATE: SessionState = { ...SIGNED_OUT, phase: "loading", inviteCode: null, error: "" };
const INITIAL_STATE = supabase ? LOADING_STATE : LOCAL_STATE;

let state = INITIAL_STATE;
let started = false;
const listeners = new Set<() => void>();

function set(patch: Partial<SessionState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Storage is blocked: the invite or last-opened family just won't be remembered.
  }
}

const message = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong. Please try again.");

function authMessage(error: { message: string; code?: string }): string {
  switch (error.code) {
    case "over_email_send_rate_limit":
      return "Too many sign-in emails have been sent in the last hour. Please try again later.";
    case "email_address_not_authorized":
      return "Email sign-in isn’t set up for that address yet. If you were sent an invite link, you can join without an email.";
    case "anonymous_provider_disabled":
      return "Joining without an email is turned off for this app. Please sign in with your email instead.";
    case "otp_expired":
      return "That code has expired or was already used. Send a new one and try again.";
    case "over_request_rate_limit":
      return "Too many people have joined from this network in the last hour. Please try again in a little while.";
    default:
      return friendly(error);
  }
}

function start() {
  if (started || !supabase || typeof window === "undefined") return;
  started = true;

  // An invite link looks like /?join=CODE. Remember the code and tidy the address bar.
  const url = new URL(window.location.href);
  const code = url.searchParams.get("join");
  if (code) {
    write(PENDING_INVITE_KEY, code.trim());
    url.searchParams.delete("join");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }
  state = { ...state, inviteCode: read(PENDING_INVITE_KEY) };

  onRemovedFromFamily(() => {
    void leaveFamily("You’ve been removed from that family tree.");
  });

  supabase.auth.onAuthStateChange((_event, session) => {
    // Supabase warns against calling it again from inside this callback, so step out first.
    window.setTimeout(() => void onSession(session), 0);
  });
}

async function onSession(session: Session | null) {
  const userId = session?.user.id ?? null;
  if (state.phase !== "loading" && userId === state.userId) {
    // Token refresh, tab focus, or a guest who just confirmed an email: same person, so
    // only their email and guest status can have changed.
    if (session) set({ email: session.user.email || null, isGuest: session.user.is_anonymous ?? false });
    return;
  }

  if (!session) {
    closeRemoteFamily();
    // On first load, say so if a sign-in link brought them here but didn't work.
    set({ ...SIGNED_OUT, phase: "signedOut", error: state.phase === "loading" ? signInLinkError : "" });
    return;
  }
  set({
    userId,
    email: session.user.email ?? null,
    isGuest: session.user.is_anonymous ?? false,
  });
  await enter();
}

async function listFamilies(): Promise<FamilySummary[]> {
  const { data, error } = await supabase!
    .from("family_members")
    .select("role, families (id, name)")
    .eq("user_id", state.userId!);
  if (error) throw new Error(friendly(error));
  const rows = (data ?? []) as unknown as { role: Role; families: { id: string; name: string } | null }[];
  return rows
    .filter((row) => row.families)
    .map((row) => ({ id: row.families!.id, name: row.families!.name, role: row.role }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Whether this account may start trees. If the check itself fails, show the option and let the server decide. */
async function checkCanCreate(): Promise<boolean> {
  const { data, error } = await supabase!.rpc("can_create_family");
  return error ? true : data === true;
}

async function rpcFamilyId(fn: "join_family" | "create_family", args: Record<string, string>): Promise<string> {
  const { data, error } = await supabase!.rpc(fn, args);
  if (error) {
    if (/invite code not found/i.test(error.message)) {
      throw new Error("That invite code wasn’t recognised. Check it with whoever sent it to you.");
    }
    throw new Error(friendly(error));
  }
  return data as string;
}

/** After signing in: use a waiting invite, then open the right family tree. */
async function enter() {
  set({ phase: "opening", error: "" });
  let problem = "";
  try {
    const invite = read(PENDING_INVITE_KEY);
    if (invite) {
      write(PENDING_INVITE_KEY, null);
      set({ inviteCode: null });
      try {
        write(CURRENT_FAMILY_KEY, await rpcFamilyId("join_family", { code: invite }));
      } catch (e) {
        problem = message(e);
      }
    }
    const [families, canCreate] = await Promise.all([listFamilies(), checkCanCreate()]);
    set({ families, canCreate });
    const last = read(CURRENT_FAMILY_KEY);
    const target = families.find((f) => f.id === last) ?? (families.length === 1 ? families[0] : undefined);
    if (target && !problem) await openFamily(target.id);
    else set({ phase: "choosing", error: problem });
  } catch (e) {
    set({ phase: "choosing", error: message(e) });
  }
}

export function useSessionState(): SessionState {
  return useSyncExternalStore(
    (listener) => {
      start();
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => state,
    () => INITIAL_STATE,
  );
}

// ---------------------------------------------------------------------------
// Actions. Each throws an Error whose message can be shown as-is.
// ---------------------------------------------------------------------------

export async function sendSignInEmail(email: string) {
  const { error } = await supabase!.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });
  if (error) throw new Error(authMessage(error));
}

export async function verifyEmailCode(email: string, code: string) {
  const { error } = await supabase!.auth.verifyOtp({ email, token: code, type: "email" });
  if (error) throw new Error(authMessage(error));
}

/**
 * For a guest: attach an email to their account, keeping everything they have
 * (their trees, "This is me", what they added). Supabase emails a confirmation;
 * until it's confirmed they are still a guest.
 */
export async function addEmailToGuest(email: string) {
  const { error } = await supabase!.auth.updateUser({ email }, { emailRedirectTo: window.location.origin });
  if (!error) return;
  if (error.code === "email_exists" || /already (been )?registered|already exists/i.test(error.message)) {
    throw new Error(
      "That email already has its own account here. To use it, sign out and sign in with that email, then open the invite link again to join. This guest account’s “This is me” won’t carry over.",
    );
  }
  if (error.code === "email_address_not_authorized") {
    throw new Error(
      "The app can’t send email to that address yet. Ask whoever runs the family tree to finish setting up email.",
    );
  }
  throw new Error(authMessage(error));
}

/** The code from the confirmation email (its length is set in Supabase), if the email shows one. */
export async function confirmGuestEmail(email: string, code: string) {
  const { error } = await supabase!.auth.verifyOtp({ email, token: code, type: "email_change" });
  if (error) throw new Error(authMessage(error));
}

/**
 * After the guest tapped the link in the email (perhaps in another app or browser):
 * ask Supabase again whether the email is confirmed. True when it is.
 */
export async function checkGuestEmailConfirmed(): Promise<boolean> {
  const { data, error } = await supabase!.auth.refreshSession();
  if (error) throw new Error(authMessage(error));
  const user = data.user;
  if (user) set({ email: user.email || null, isGuest: user.is_anonymous ?? false });
  return !!user && !user.is_anonymous && !!user.email;
}

export async function continueAsGuest() {
  const { error } = await supabase!.auth.signInAnonymously();
  if (error) throw new Error(authMessage(error));
}

export async function signOut() {
  write(CURRENT_FAMILY_KEY, null);
  const { error } = await supabase!.auth.signOut();
  if (error) throw new Error(authMessage(error));
}

/** For someone who has a code rather than a link, before they have signed in. */
export function rememberInvite(code: string | null) {
  const cleaned = code?.trim() || null;
  write(PENDING_INVITE_KEY, cleaned);
  set({ inviteCode: cleaned, error: "" });
}

export async function openFamily(familyId: string) {
  set({ phase: "opening", error: "" });
  try {
    await openRemoteFamily(familyId, state.userId!);
    write(CURRENT_FAMILY_KEY, familyId);
    set({ phase: "open" });
  } catch (e) {
    write(CURRENT_FAMILY_KEY, null);
    set({ phase: "choosing", error: message(e) });
  }
}

export async function createFamily(name: string) {
  const familyId = await rpcFamilyId("create_family", { family_name: name });
  set({ families: await listFamilies() });
  await openFamily(familyId);
}

export async function joinWithCode(code: string) {
  const familyId = await rpcFamilyId("join_family", { code });
  set({ families: await listFamilies() });
  await openFamily(familyId);
}

/** Back to the list of family trees. */
export async function leaveFamily(reason = "") {
  closeRemoteFamily();
  write(CURRENT_FAMILY_KEY, null);
  set({ phase: "choosing", error: reason });
  try {
    set({ families: await listFamilies() });
  } catch (e) {
    set({ error: message(e) });
  }
}
