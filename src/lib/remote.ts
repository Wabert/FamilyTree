import type { SupabaseClient } from "@supabase/supabase-js";
import type { Family, Gender, Person } from "./types";

/** Every Supabase read and write for one family tree. No app state lives here. */

/**
 * organizer: started the tree; can do everything and can't be removed.
 * moderator: chosen by the organizer; can do what the organizer can, except
 *            change roles or remove other moderators.
 * member:    everyone else who joined.
 */
export type Role = "organizer" | "moderator" | "member";

/** Organizers and moderators share the management tools. */
export const canManage = (role: Role) => role === "organizer" || role === "moderator";
export type PersonFields = Omit<Person, "id" | "createdBy">;

export interface LoadedFamily {
  family: Family;
  meId: string | null;
  inviteCode: string;
  role: Role;
  /** Person id -> path of their photo in storage. */
  photoPaths: Map<string, string>;
  /** Person id -> storage paths of their extra photos, in the same order as `Person.gallery`. */
  galleryPaths: Map<string, string[]>;
  /** False until the database has had update-4-photo-gallery.sql. */
  galleryReady: boolean;
}

/** Someone who has joined the family tree, as shown to the organizer. */
export interface Member {
  userId: string;
  /** Missing for people who joined from the invite link without an email. */
  email: string | null;
  isGuest: boolean;
  role: Role;
  /** The person in the tree they said they are, if any. */
  personId: string | null;
  joinedAt: string;
}

interface PersonRow {
  id: string;
  name: string;
  nickname: string | null;
  gender: Gender | null;
  birth_year: number | null;
  death_year: number | null;
  photo_path: string | null;
  gallery_paths?: string[] | null;
  location: string | null;
  bio: string | null;
  created_by: string | null;
}

interface DbError {
  message: string;
  code?: string;
}

const PHOTOS = "photos";
const PERSON_COLUMNS = "id, name, nickname, gender, birth_year, death_year, photo_path, location, bio, created_by";
const PAGE = 1000;
const ONE_DAY = 60 * 60 * 24;

export function friendly(error: DbError): string {
  if (error.code === "42501") return "You don’t have permission to do that in this family tree.";
  if (error.code === "23503") return "Someone that change depends on was just removed. Please try again.";
  if (/failed to fetch|network/i.test(error.message)) {
    return "Couldn’t reach the server. Check your connection and try again.";
  }
  return error.message;
}

function check<T>(result: { data: T; error: DbError | null }): T {
  if (result.error) throw new Error(friendly(result.error));
  return result.data;
}

/** Supabase returns at most 1,000 rows per request, so read big tables in pages. */
async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown; error: DbError | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const batch = (check(await page(from, from + PAGE - 1)) as T[] | null) ?? [];
    rows.push(...batch);
    if (batch.length < PAGE) return rows;
  }
}

/** Remembered after the first load, so a database without update 4 is only asked once. */
let galleryColumnMissing = false;

function fetchPeople(db: SupabaseClient, familyId: string, withGallery: boolean) {
  return fetchAll<PersonRow>((from, to) =>
    db
      .from("people")
      .select(withGallery ? `${PERSON_COLUMNS}, gallery_paths` : PERSON_COLUMNS)
      .eq("family_id", familyId)
      .order("created_at")
      .order("id")
      .range(from, to),
  );
}

/** People with their extra photos, or without them if the database hasn't had update 4 yet. */
async function loadPeople(db: SupabaseClient, familyId: string): Promise<{ rows: PersonRow[]; galleryReady: boolean }> {
  if (!galleryColumnMissing) {
    try {
      return { rows: await fetchPeople(db, familyId, true), galleryReady: true };
    } catch (e) {
      if (!(e instanceof Error && /gallery_paths/.test(e.message))) throw e;
      galleryColumnMissing = true;
    }
  }
  return { rows: await fetchPeople(db, familyId, false), galleryReady: false };
}

export async function loadFamily(db: SupabaseClient, familyId: string, userId: string): Promise<LoadedFamily> {
  const [familyRow, memberRow, { rows: peopleRows, galleryReady }, parentRows, spouseRows] = await Promise.all([
    db.from("families").select("name, invite_code").eq("id", familyId).single(),
    db.from("family_members").select("person_id, role").eq("family_id", familyId).eq("user_id", userId).single(),
    loadPeople(db, familyId),
    fetchAll<{ parent_id: string; child_id: string }>((from, to) =>
      db
        .from("parent_links")
        .select("parent_id, child_id")
        .eq("family_id", familyId)
        .order("parent_id")
        .order("child_id")
        .range(from, to),
    ),
    fetchAll<{ a_id: string; b_id: string }>((from, to) =>
      db.from("spouse_links").select("a_id, b_id").eq("family_id", familyId).order("a_id").order("b_id").range(from, to),
    ),
  ]);
  const family = check(familyRow) as { name: string; invite_code: string };
  const member = check(memberRow) as { person_id: string | null; role: Role };

  const photoPaths = new Map<string, string>();
  const galleryPaths = new Map<string, string[]>();
  for (const row of peopleRows) {
    if (row.photo_path) photoPaths.set(row.id, row.photo_path);
    if (row.gallery_paths?.length) galleryPaths.set(row.id, row.gallery_paths);
  }

  // The bucket is private, so photos are shown through short-lived signed links.
  const photoUrls = new Map<string, string>();
  const paths = [...new Set([...photoPaths.values(), ...[...galleryPaths.values()].flat()])];
  for (let i = 0; i < paths.length; i += 100) {
    const { data } = await db.storage.from(PHOTOS).createSignedUrls(paths.slice(i, i + 100), ONE_DAY);
    for (const item of data ?? []) {
      if (item.path && item.signedUrl) photoUrls.set(item.path, item.signedUrl);
    }
  }

  const people: Person[] = peopleRows.map((row) => {
    // A photo whose link couldn't be made is left out, and its path with it, so
    // `gallery` and `galleryPaths` stay in step.
    const shown = (galleryPaths.get(row.id) ?? []).filter((path) => photoUrls.has(path));
    if (shown.length) galleryPaths.set(row.id, shown);
    else galleryPaths.delete(row.id);
    return {
      id: row.id,
      name: row.name,
      nickname: row.nickname ?? undefined,
      gender: row.gender ?? undefined,
      birthYear: row.birth_year ?? undefined,
      deathYear: row.death_year ?? undefined,
      photo: row.photo_path ? photoUrls.get(row.photo_path) : undefined,
      gallery: shown.length ? shown.map((path) => photoUrls.get(path)!) : undefined,
      location: row.location ?? undefined,
      bio: row.bio ?? undefined,
      createdBy: row.created_by ?? undefined,
    };
  });

  return {
    family: {
      name: family.name,
      people,
      parentLinks: parentRows.map((r) => ({ parentId: r.parent_id, childId: r.child_id })),
      spouseLinks: spouseRows.map((r) => ({ aId: r.a_id, bId: r.b_id })),
    },
    meId: member.person_id,
    inviteCode: family.invite_code,
    role: member.role,
    photoPaths,
    galleryPaths,
    galleryReady,
  };
}

/** `galleryPaths` is left out entirely when the database doesn't have that column yet. */
const personColumns = (fields: PersonFields, photoPath: string | null, galleryPaths?: string[]) => ({
  ...(galleryPaths ? { gallery_paths: galleryPaths } : {}),
  name: fields.name,
  nickname: fields.nickname ?? null,
  gender: fields.gender ?? null,
  birth_year: fields.birthYear ?? null,
  death_year: fields.deathYear ?? null,
  location: fields.location ?? null,
  bio: fields.bio ?? null,
  photo_path: photoPath,
});

export async function uploadPhoto(
  db: SupabaseClient,
  familyId: string,
  personId: string,
  dataUrl: string,
  /** Tells apart several photos uploaded for the same person at once. */
  suffix = "",
): Promise<string> {
  const blob = await (await fetch(dataUrl)).blob();
  const path = `${familyId}/${personId}-${Date.now()}${suffix}.jpg`;
  const { error } = await db.storage.from(PHOTOS).upload(path, blob, { contentType: "image/jpeg" });
  if (error) throw new Error(`The photo couldn’t be uploaded: ${friendly(error)}`);
  return path;
}

/** Best effort: a leftover file is harmless, so failures are ignored. */
export async function removePhoto(db: SupabaseClient, ...paths: string[]) {
  if (paths.length) await db.storage.from(PHOTOS).remove(paths);
}

export async function insertPerson(
  db: SupabaseClient,
  familyId: string,
  userId: string,
  id: string,
  fields: PersonFields,
  photoPath: string | null,
  galleryPaths?: string[],
) {
  check(
    await db
      .from("people")
      .insert({ id, family_id: familyId, created_by: userId, ...personColumns(fields, photoPath, galleryPaths) }),
  );
}

export async function updatePersonRow(
  db: SupabaseClient,
  id: string,
  fields: PersonFields,
  photoPath: string | null,
  galleryPaths?: string[],
) {
  check(await db.from("people").update(personColumns(fields, photoPath, galleryPaths)).eq("id", id));
}

export async function deletePersonRow(db: SupabaseClient, id: string) {
  // Ask for the row back: a delete blocked by the access rules removes nothing and reports no error.
  const removed = check(await db.from("people").delete().eq("id", id).select("id")) as { id: string }[] | null;
  if (!removed?.length) {
    throw new Error("Only the organizer, a moderator, or the person who added them can remove someone from the tree.");
  }
}

export async function addParentLinks(db: SupabaseClient, familyId: string, pairs: { parentId: string; childId: string }[]) {
  if (!pairs.length) return;
  check(
    await db
      .from("parent_links")
      .upsert(
        pairs.map((p) => ({ family_id: familyId, parent_id: p.parentId, child_id: p.childId })),
        { onConflict: "parent_id,child_id", ignoreDuplicates: true },
      ),
  );
}

export async function removeParentLinks(db: SupabaseClient, childId: string, parentIds: string[]) {
  if (!parentIds.length) return;
  check(await db.from("parent_links").delete().eq("child_id", childId).in("parent_id", parentIds));
}

/** The table stores each couple once, smaller id first. */
const ordered = (x: string, y: string) => (x < y ? { a_id: x, b_id: y } : { a_id: y, b_id: x });

export async function addSpouseLink(db: SupabaseClient, familyId: string, x: string, y: string) {
  check(
    await db
      .from("spouse_links")
      .upsert({ family_id: familyId, ...ordered(x, y) }, { onConflict: "a_id,b_id", ignoreDuplicates: true }),
  );
}

export async function removeSpouseLink(db: SupabaseClient, x: string, y: string) {
  const pair = ordered(x, y);
  check(await db.from("spouse_links").delete().eq("a_id", pair.a_id).eq("b_id", pair.b_id));
}

export async function setClaim(db: SupabaseClient, familyId: string, userId: string, personId: string | null) {
  check(
    await db.from("family_members").update({ person_id: personId }).eq("family_id", familyId).eq("user_id", userId),
  );
}

export async function renameFamilyRow(db: SupabaseClient, familyId: string, name: string) {
  const renamed = check(await db.from("families").update({ name }).eq("id", familyId).select("id")) as
    | { id: string }[]
    | null;
  if (!renamed?.length) throw new Error("Only the organizer or a moderator can rename the family tree.");
}

// ---------------------------------------------------------------------------
// Organizer tools
// ---------------------------------------------------------------------------

const organizerOnly = (error: DbError) =>
  /function .* does not exist|could not find the function/i.test(error.message)
    ? "The database needs its latest update before members can be managed."
    : friendly(error);

export async function listMembers(db: SupabaseClient, familyId: string): Promise<Member[]> {
  const { data, error } = await db.rpc("list_family_members", { fid: familyId });
  if (error) throw new Error(organizerOnly(error));
  const rows = (data ?? []) as {
    user_id: string;
    email: string | null;
    is_guest: boolean;
    role: Role;
    person_id: string | null;
    joined_at: string;
  }[];
  return rows.map((row) => ({
    userId: row.user_id,
    email: row.email || null,
    isGuest: row.is_guest,
    role: row.role,
    personId: row.person_id,
    joinedAt: row.joined_at,
  }));
}

export async function removeMember(db: SupabaseClient, familyId: string, memberUserId: string) {
  const { error } = await db.rpc("remove_family_member", { fid: familyId, member: memberUserId });
  if (error) throw new Error(organizerOnly(error));
}

/** Makes a new invite code, so the old link and QR code stop working. */
export async function resetInviteCode(db: SupabaseClient, familyId: string): Promise<string> {
  const { data, error } = await db.rpc("reset_invite_code", { fid: familyId });
  if (error) throw new Error(organizerOnly(error));
  return data as string;
}

/** Organizer only: make a member a moderator, or an ordinary member again. */
export async function setMemberRole(
  db: SupabaseClient,
  familyId: string,
  memberUserId: string,
  role: "moderator" | "member",
) {
  const { error } = await db.rpc("set_member_role", { fid: familyId, member: memberUserId, new_role: role });
  if (error) throw new Error(organizerOnly(error));
}

// ---------------------------------------------------------------------------
// Owner tools
// ---------------------------------------------------------------------------

/** One entry in the private change log (supabase/update-6 and update-7). */
export interface Change {
  id: number;
  at: string;
  tree: string | null;
  who: string | null;
  action: string;
  subject: string | null;
  /** Edits: {field: {from, to}}. Additions and removals: {field: value}. */
  details: Record<string, unknown> | null;
  familyId: string | null;
}

/** Newest first. Only approved tree creators get an answer; everyone else is refused by the database. */
export async function listChanges(
  db: SupabaseClient,
  options: { familyId?: string | null; beforeId?: number | null; limit?: number },
): Promise<Change[]> {
  const { data, error } = await db.rpc("list_changes", {
    fid: options.familyId ?? null,
    before_id: options.beforeId ?? null,
    max_rows: options.limit ?? 100,
  });
  if (error) {
    throw new Error(
      /function .* does not exist|could not find the function/i.test(error.message)
        ? "The database needs update 7 before the change history can be shown."
        : /only the site owner/i.test(error.message)
          ? "Only the site owner can see the change history."
          : friendly(error),
    );
  }
  const rows = (data ?? []) as {
    id: number;
    at: string;
    tree: string | null;
    who: string | null;
    action: string;
    subject: string | null;
    details: Record<string, unknown> | null;
    family_id: string | null;
  }[];
  return rows.map((row) => ({ ...row, familyId: row.family_id }));
}
