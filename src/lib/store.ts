import { useSyncExternalStore } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import * as remote from "./remote";
import type { Change, Member, PersonFields, Role } from "./remote";
import { sampleFamily } from "./sample-family";
import { supabase } from "./supabase";
import type { Family } from "./types";

/**
 * The family tree the app is showing, and every way of changing it.
 *
 * Two modes, decided by whether a Supabase project is configured:
 *  - "remote": the tree lives in Supabase and is shared by everyone who joined.
 *  - "local":  demo mode; the tree is saved in this browser's localStorage only.
 *
 * Every change function is async and throws an Error with a message that can be
 * shown to the person as-is.
 */

export type { Change, Member, PersonFields, Role };
export const canManage = remote.canManage;

export interface AppState {
  mode: "local" | "remote";
  family: Family;
  /** Which person the current viewer has said they are. */
  meId: string | null;
  role: Role;
  /** Remote mode only. */
  familyId: string | null;
  inviteCode: string | null;
  userId: string | null;
}

export interface PersonLinks {
  parentIds: string[];
  spouseId: string | null;
}

const EMPTY_FAMILY: Family = { name: "", people: [], parentLinks: [], spouseLinks: [] };

const SAMPLE_STATE: AppState = {
  mode: "local",
  family: sampleFamily,
  meId: null,
  role: "organizer",
  familyId: null,
  inviteCode: null,
  userId: null,
};

const CLOSED_REMOTE_STATE: AppState = {
  mode: "remote",
  family: EMPTY_FAMILY,
  meId: null,
  role: "member",
  familyId: null,
  inviteCode: null,
  userId: null,
};

const INITIAL_STATE = supabase ? CLOSED_REMOTE_STATE : SAMPLE_STATE;

let state: AppState = INITIAL_STATE;
const listeners = new Set<() => void>();

function setState(next: AppState) {
  state = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  if (!supabase) loadLocal();
  return state;
}

export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, getSnapshot, () => INITIAL_STATE);
}

// ---------------------------------------------------------------------------
// Local (demo) mode
// ---------------------------------------------------------------------------

const STORAGE_KEY = "family-reunion:v1";
const STORAGE_FULL =
  "This browser’s storage is full, so that change may not be kept after a reload. Try removing a few photos.";

let localLoaded = false;

function loadLocal() {
  if (localLoaded || typeof window === "undefined") return;
  localLoaded = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<AppState>;
    if (Array.isArray(parsed?.family?.people)) {
      state = { ...SAMPLE_STATE, family: parsed.family!, meId: parsed.meId ?? null };
    }
  } catch {
    // Unreadable or blocked storage: carry on with the sample family.
  }
}

function commitLocal(next: Pick<AppState, "family" | "meId">) {
  setState({ ...SAMPLE_STATE, ...next });
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ family: next.family, meId: next.meId }));
  } catch {
    throw new Error(STORAGE_FULL);
  }
}

const samePair = (aId: string, bId: string) => (link: { aId: string; bId: string }) =>
  (link.aId === aId && link.bId === bId) || (link.aId === bId && link.bId === aId);

export function resetToSample() {
  commitLocal({ family: sampleFamily, meId: null });
}

export function startEmptyFamily(name: string) {
  commitLocal({ family: { ...EMPTY_FAMILY, name }, meId: null });
}

// ---------------------------------------------------------------------------
// Remote (shared) mode
// ---------------------------------------------------------------------------

let photoPaths = new Map<string, string>();
let galleryPaths = new Map<string, string[]>();
let galleryReady = true;
let channel: RealtimeChannel | null = null;
let reloadTimer: ReturnType<typeof setTimeout> | undefined;

/** The open remote family, or a clear error if there isn't one. */
function open() {
  if (!supabase || !state.familyId || !state.userId) {
    throw new Error("The family tree isn’t open. Please reload the page.");
  }
  return { db: supabase, familyId: state.familyId, userId: state.userId };
}

async function reload() {
  const { db, familyId, userId } = open();
  const loaded = await remote.loadFamily(db, familyId, userId);
  if (state.familyId !== familyId) return; // a different family was opened meanwhile
  photoPaths = loaded.photoPaths;
  galleryPaths = loaded.galleryPaths;
  galleryReady = loaded.galleryReady;
  setState({
    mode: "remote",
    family: loaded.family,
    meId: loaded.meId,
    role: loaded.role,
    inviteCode: loaded.inviteCode,
    familyId,
    userId,
  });
}

/** Several rows usually change together, so wait for the burst to finish. */
function reloadSoon() {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    reload().catch(() => {
      // A missed refresh is harmless: the next change or page load catches up.
    });
  }, 300);
}

/** A removal somewhere in the database: refresh only if it names someone in this tree. */
function reloadIfOurs(payload: { old: Record<string, unknown> }) {
  const ids = new Set(state.family.people.map((p) => p.id));
  if (Object.values(payload.old).some((value) => typeof value === "string" && ids.has(value))) reloadSoon();
}

let removedHandler: (() => void) | null = null;

/** Called when the organizer removes this viewer from the open family tree. */
export function onRemovedFromFamily(handler: () => void) {
  removedHandler = handler;
}

function checkStillMember(payload: { old: Record<string, unknown> }) {
  if (payload.old.family_id === state.familyId && payload.old.user_id === state.userId) removedHandler?.();
}

export async function openRemoteFamily(familyId: string, userId: string) {
  if (!supabase) throw new Error("No shared database is configured.");
  closeRemoteFamily();
  const loaded = await remote.loadFamily(supabase, familyId, userId);
  photoPaths = loaded.photoPaths;
  galleryPaths = loaded.galleryPaths;
  galleryReady = loaded.galleryReady;
  setState({
    mode: "remote",
    family: loaded.family,
    meId: loaded.meId,
    role: loaded.role,
    inviteCode: loaded.inviteCode,
    familyId,
    userId,
  });

  // Refresh whenever anyone else changes this tree.
  const mine = `family_id=eq.${familyId}`;
  channel = supabase
    .channel(`family-${familyId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "people", filter: mine }, reloadSoon)
    .on("postgres_changes", { event: "*", schema: "public", table: "parent_links", filter: mine }, reloadSoon)
    .on("postgres_changes", { event: "*", schema: "public", table: "spouse_links", filter: mine }, reloadSoon)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "families", filter: `id=eq.${familyId}` }, reloadSoon)
    // Supabase can't filter removals by family: they arrive for every family and
    // carry only the removed row's ids, so we check them against this tree.
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "people" }, reloadIfOurs)
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "parent_links" }, reloadIfOurs)
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "spouse_links" }, reloadIfOurs)
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "family_members" }, checkStillMember)
    // Picks up being made (or unmade) a moderator without a page reload.
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "family_members", filter: mine }, reloadSoon)
    .subscribe();
}

export function closeRemoteFamily() {
  clearTimeout(reloadTimer);
  if (channel && supabase) void supabase.removeChannel(channel);
  channel = null;
  photoPaths = new Map();
  galleryPaths = new Map();
  if (state.mode === "remote" && state.familyId) setState(CLOSED_REMOTE_STATE);
}

/**
 * Storage paths for a person's extra photos as the form left them: new pictures
 * (data URLs) are uploaded, ones already saved are matched back to their paths.
 * Undefined when the database can't store extra photos yet and none were added.
 */
async function saveGallery(
  db: NonNullable<typeof supabase>,
  familyId: string,
  id: string,
  gallery: string[] | undefined,
): Promise<string[] | undefined> {
  const wanted = gallery ?? [];
  if (!galleryReady) {
    if (wanted.some((url) => url.startsWith("data:"))) {
      throw new Error("Extra photos can’t be saved until the organizer runs the latest database update.");
    }
    return undefined;
  }
  const savedUrls = state.family.people.find((p) => p.id === id)?.gallery ?? [];
  const savedPaths = galleryPaths.get(id) ?? [];
  const paths = await Promise.all(
    wanted.map((url, i) =>
      url.startsWith("data:")
        ? remote.uploadPhoto(db, familyId, id, url, `-${i + 1}`)
        : Promise.resolve(savedPaths[savedUrls.indexOf(url)]),
    ),
  );
  return paths.filter((path): path is string => Boolean(path));
}

// ---------------------------------------------------------------------------
// Changes (both modes)
// ---------------------------------------------------------------------------

export async function setMe(id: string | null): Promise<void> {
  if (state.mode === "local") {
    commitLocal({ family: state.family, meId: id });
    return;
  }
  const { db, familyId, userId } = open();
  await remote.setClaim(db, familyId, userId, id);
  setState({ ...state, meId: id });
}

export async function addPerson(fields: PersonFields, links: PersonLinks & { childId?: string }): Promise<string> {
  const id = crypto.randomUUID();
  const parentPairs = [
    ...links.parentIds.map((parentId) => ({ parentId, childId: id })),
    ...(links.childId ? [{ parentId: id, childId: links.childId }] : []),
  ];

  if (state.mode === "local") {
    const { family } = state;
    commitLocal({
      meId: state.meId,
      family: {
        ...family,
        people: [...family.people, { ...fields, id }],
        parentLinks: [...family.parentLinks, ...parentPairs],
        spouseLinks: links.spouseId ? [...family.spouseLinks, { aId: id, bId: links.spouseId }] : family.spouseLinks,
      },
    });
    return id;
  }

  const { db, familyId, userId } = open();
  const photoPath = fields.photo?.startsWith("data:")
    ? await remote.uploadPhoto(db, familyId, id, fields.photo)
    : null;
  const gallery = await saveGallery(db, familyId, id, fields.gallery);
  await remote.insertPerson(db, familyId, userId, id, fields, photoPath, gallery);
  try {
    await remote.addParentLinks(db, familyId, parentPairs);
    if (links.spouseId) await remote.addSpouseLink(db, familyId, id, links.spouseId);
  } finally {
    await reload(); // show the new person even if linking them failed
  }
  return id;
}

export async function updatePerson(
  id: string,
  fields: PersonFields,
  links: PersonLinks & { previousSpouseId: string | null },
): Promise<void> {
  const { family } = state;
  const spouseChanged = links.spouseId !== links.previousSpouseId;

  if (state.mode === "local") {
    let spouseLinks = family.spouseLinks;
    if (spouseChanged) {
      if (links.previousSpouseId) {
        spouseLinks = spouseLinks.filter((link) => !samePair(id, links.previousSpouseId!)(link));
      }
      if (links.spouseId && !spouseLinks.some(samePair(id, links.spouseId))) {
        spouseLinks = [...spouseLinks, { aId: id, bId: links.spouseId }];
      }
    }
    commitLocal({
      meId: state.meId,
      family: {
        ...family,
        people: family.people.map((p) => (p.id === id ? { ...fields, id } : p)),
        parentLinks: [
          ...family.parentLinks.filter((link) => link.childId !== id),
          ...links.parentIds.map((parentId) => ({ parentId, childId: id })),
        ],
        spouseLinks,
      },
    });
    return;
  }

  const { db, familyId } = open();
  const oldPath = photoPaths.get(id) ?? null;
  let photoPath = oldPath;
  if (!fields.photo) photoPath = null;
  else if (fields.photo.startsWith("data:")) photoPath = await remote.uploadPhoto(db, familyId, id, fields.photo);
  const oldGallery = galleryPaths.get(id) ?? [];
  const gallery = await saveGallery(db, familyId, id, fields.gallery);

  try {
    await remote.updatePersonRow(db, id, fields, photoPath, gallery);

    const currentParents = family.parentLinks.filter((l) => l.childId === id).map((l) => l.parentId);
    await remote.removeParentLinks(db, id, currentParents.filter((p) => !links.parentIds.includes(p)));
    await remote.addParentLinks(
      db,
      familyId,
      links.parentIds.filter((p) => !currentParents.includes(p)).map((parentId) => ({ parentId, childId: id })),
    );

    if (spouseChanged) {
      if (links.previousSpouseId) await remote.removeSpouseLink(db, id, links.previousSpouseId);
      if (links.spouseId) await remote.addSpouseLink(db, familyId, id, links.spouseId);
    }
    if (oldPath && oldPath !== photoPath) void remote.removePhoto(db, oldPath);
    if (gallery) void remote.removePhoto(db, ...oldGallery.filter((path) => !gallery.includes(path)));
  } finally {
    await reload();
  }
}

export async function deletePerson(id: string): Promise<void> {
  if (state.mode === "local") {
    const { family } = state;
    commitLocal({
      meId: state.meId === id ? null : state.meId,
      family: {
        ...family,
        people: family.people.filter((p) => p.id !== id),
        parentLinks: family.parentLinks.filter((l) => l.parentId !== id && l.childId !== id),
        spouseLinks: family.spouseLinks.filter((l) => l.aId !== id && l.bId !== id),
      },
    });
    return;
  }
  const { db } = open();
  const photoPath = photoPaths.get(id);
  const gallery = galleryPaths.get(id) ?? [];
  await remote.deletePersonRow(db, id);
  void remote.removePhoto(db, ...(photoPath ? [photoPath] : []), ...gallery);
  await reload();
}

export async function renameFamily(name: string): Promise<void> {
  if (state.mode === "local") {
    commitLocal({ family: { ...state.family, name }, meId: state.meId });
    return;
  }
  const { db, familyId } = open();
  await remote.renameFamilyRow(db, familyId, name);
  setState({ ...state, family: { ...state.family, name } });
}

// ---------------------------------------------------------------------------
// Organizer tools (shared trees only)
// ---------------------------------------------------------------------------

export async function listMembers(): Promise<Member[]> {
  const { db, familyId } = open();
  return remote.listMembers(db, familyId);
}

/** Site owner only: the private change log, for the open tree or for every tree. */
export async function listChanges(scope: "tree" | "all", beforeId: number | null): Promise<Change[]> {
  const { db, familyId } = open();
  return remote.listChanges(db, { familyId: scope === "tree" ? familyId : null, beforeId });
}

export async function removeMember(memberUserId: string): Promise<void> {
  const { db, familyId } = open();
  await remote.removeMember(db, familyId, memberUserId);
}

/** Replace the invite code so the old link and QR code stop working. */
export async function resetInviteCode(): Promise<void> {
  const { db, familyId } = open();
  const inviteCode = await remote.resetInviteCode(db, familyId);
  if (state.familyId === familyId) setState({ ...state, inviteCode });
}

/** Organizer only: make a member a moderator, or an ordinary member again. */
export async function setMemberRole(memberUserId: string, role: "moderator" | "member"): Promise<void> {
  const { db, familyId } = open();
  await remote.setMemberRole(db, familyId, memberUserId, role);
}
