"use client";

import { useMemo, useState } from "react";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import { descendantsOf, type FamilyIndex } from "@/lib/graph";
import { orderSpouses } from "@/lib/marriage";
import { toPhotoDataUrl, toSquareDataUrl } from "@/lib/images";
import { addPerson, updatePerson, type PersonFields, type SpouseEntry } from "@/lib/store";
import { MAX_GALLERY, type Family, type Gender, type MarriageStatus, type Person } from "@/lib/types";
import { Avatar } from "./Avatar";
import { PersonName, PersonPicker, type PickerChoice } from "./PersonPicker";
import { CityInput } from "./CityInput";
import { inputClass } from "./ui";

export type FormMode =
  | { type: "add"; parentIds?: string[]; spouseId?: string; childId?: string }
  | { type: "edit"; id: string };

export function PersonForm({
  mode,
  family,
  index,
  onClose,
  onSaved,
}: {
  mode: FormMode;
  family: Family;
  index: FamilyIndex;
  onClose(): void;
  onSaved(id: string): void;
}) {
  const editing = mode.type === "edit" ? index.byId.get(mode.id) : undefined;
  const editId = mode.type === "edit" ? mode.id : null;
  const initialParents = editId ? index.parentsOf(editId) : mode.type === "add" ? (mode.parentIds ?? []) : [];
  const initialSpouses: SpouseRow[] = editId
    ? orderSpouses(index, editId, index.spousesOf(editId))
        .reverse()
        .map((id) => {
          const link = index.marriage(editId, id);
          return {
            key: id,
            id,
            newName: "",
            status: link?.status ?? "married",
            startYear: link?.startYear?.toString() ?? "",
            endYear: link?.endYear?.toString() ?? "",
          };
        })
    : mode.type === "add" && mode.spouseId
      ? [{ ...emptySpouse(), id: mode.spouseId }]
      : [];
  const childOf = mode.type === "add" && mode.childId ? index.byId.get(mode.childId) : undefined;

  const [name, setName] = useState(editing?.name ?? "");
  const [nickname, setNickname] = useState(editing?.nickname ?? "");
  const [gender, setGender] = useState<Gender | "">(editing?.gender ?? "");
  const [birthYear, setBirthYear] = useState(editing?.birthYear?.toString() ?? "");
  const [deathYear, setDeathYear] = useState(editing?.deathYear?.toString() ?? "");
  const [location, setLocation] = useState(editing?.location ?? "");
  const familyPlaces = useMemo(
    () => family.people.flatMap((p) => (p.id !== editId && p.location?.trim() ? [p.location] : [])),
    [family, editId],
  );
  const [bio, setBio] = useState(editing?.bio ?? "");
  const [photo, setPhoto] = useState(editing?.photo ?? "");
  const [gallery, setGallery] = useState<string[]>(editing?.gallery ?? []);
  const [readingPhotos, setReadingPhotos] = useState(false);
  const [parent1, setParent1] = useState(initialParents[0] ?? "");
  const [parent2, setParent2] = useState(initialParents[1] ?? "");
  const [spouses, setSpouses] = useState<SpouseRow[]>(initialSpouses.length ? initialSpouses : [emptySpouse()]);
  const updateSpouse = (key: string, patch: Partial<SpouseRow>) =>
    setSpouses((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  // Names typed for "+ Add a new person…" in the parent pickers. They're created on save.
  const [newNames, setNewNames] = useState({ parent1: "", parent2: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Nobody can be their own ancestor, so hide descendants from the parent pickers.
  const candidates = useMemo(() => {
    const blocked = editId ? descendantsOf(index, editId) : new Set<string>();
    if (editId) blocked.add(editId);
    return family.people
      .filter((p) => !blocked.has(p.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [family, index, editId]);
  const others = useMemo(
    () => family.people.filter((p) => p.id !== editId).sort((a, b) => a.name.localeCompare(b.name)),
    [family, editId],
  );

  const onPhoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setPhoto(await toSquareDataUrl(file));
      setError("");
    } catch {
      setError("That photo couldn’t be read. Try a JPEG or PNG.");
    }
  };

  const onGalleryPhotos = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])].slice(0, MAX_GALLERY - gallery.length);
    e.target.value = "";
    if (!files.length) return;
    setReadingPhotos(true);
    const results = await Promise.allSettled(files.map((file) => toPhotoDataUrl(file)));
    const added = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    setGallery((current) => [...current, ...added].slice(0, MAX_GALLERY));
    setError(added.length < files.length ? "Some of those photos couldn’t be read. Try JPEG or PNG files." : "");
    setReadingPhotos(false);
  };

  const parseYear = (value: string, label: string): number | undefined | null => {
    if (!value.trim()) return undefined;
    const year = Number(value);
    if (!Number.isInteger(year) || year < 1000 || year > new Date().getFullYear()) {
      setError(`${label} should be a four-digit year, like 1968.`);
      return null;
    }
    return year;
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving || readingPhotos) return;
    if (!name.trim()) {
      setError("Please enter a name.");
      return;
    }
    const born = parseYear(birthYear, "Birth year");
    if (born === null) return;
    const died = parseYear(deathYear, "Year of death");
    if (died === null) return;
    if (born && died && died < born) {
      setError("Year of death can’t be before the birth year.");
      return;
    }

    const fields: PersonFields = {
      name: name.trim(),
      nickname: nickname.trim() || undefined,
      gender: gender || undefined,
      birthYear: born,
      deathYear: died,
      location: location.trim() || undefined,
      bio: bio.trim() || undefined,
      photo: photo || undefined,
      gallery: gallery.length ? gallery : undefined,
    };
    const picks = [
      { slot: "parent1", value: parent1, set: setParent1 },
      { slot: "parent2", value: parent2, set: setParent2 },
    ] as const;
    const chosenSpouses = spouses.filter((row) => row.id);
    if (
      picks.some((pick) => pick.value === NEW_PERSON && !newNames[pick.slot].trim()) ||
      chosenSpouses.some((row) => row.id === NEW_PERSON && !row.newName.trim())
    ) {
      setError("Please enter the new person’s name, or pick someone else from the list.");
      return;
    }
    const marriages: { row: SpouseRow; startYear?: number; endYear?: number }[] = [];
    for (const row of chosenSpouses) {
      const startYear = parseYear(row.startYear, row.status === "partners" ? "The year they got together" : "Year married");
      if (startYear === null) return;
      const endYear = row.status === "divorced" ? parseYear(row.endYear, "Year divorced") : undefined;
      if (endYear === null) return;
      if (startYear && endYear && endYear < startYear) {
        setError("The year they divorced can’t be before the year they married.");
        return;
      }
      marriages.push({ row, startYear, endYear });
    }

    setSaving(true);
    setError("");
    try {
      // Add anyone new first, and remember them so a retry doesn't add them twice.
      const ids = { parent1, parent2 };
      for (const pick of picks) {
        if (pick.value !== NEW_PERSON) continue;
        ids[pick.slot] = await addPerson({ name: newNames[pick.slot].trim() }, { parentIds: [], spouses: [] });
        pick.set(ids[pick.slot]);
      }
      const spouseEntries: SpouseEntry[] = [];
      for (const { row, startYear, endYear } of marriages) {
        let id = row.id;
        if (id === NEW_PERSON) {
          id = await addPerson({ name: row.newName.trim() }, { parentIds: [], spouses: [] });
          updateSpouse(row.key, { id });
        }
        if (spouseEntries.some((entry) => entry.id === id)) continue;
        spouseEntries.push({ id, status: row.status, startYear, endYear });
      }
      const parentIds = [...new Set([ids.parent1, ids.parent2].filter(Boolean))];
      if (editId) {
        await updatePerson(editId, fields, { parentIds, spouses: spouseEntries });
        onSaved(editId);
      } else {
        onSaved(await addPerson(fields, { parentIds, spouses: spouseEntries, childId: childOf?.id }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "That couldn’t be saved. Please try again.");
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-6"
      onClick={onClose}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-label={editing ? `Edit ${editing.name}` : "Add a person"}
        onSubmit={onSubmit}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-3xl bg-card shadow-2xl sm:rounded-3xl"
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-2">
          <h2 className="font-display text-2xl font-semibold text-ink">
            {editing ? "Edit details" : "Add a person"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-xl text-muted hover:bg-paper hover:text-ink"
          >
            ×
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-3">
          {childOf && (
            <p className="rounded-xl bg-leaf-soft px-3 py-2 text-sm text-leaf-dark">
              This person will be added as a parent of {childOf.name}.
            </p>
          )}

          <div className="flex items-center gap-4">
            <Avatar person={{ id: editId ?? "new", name: name || "?", photo: photo || undefined }} size={72} />
            <div className="flex flex-wrap gap-2">
              <label className="cursor-pointer rounded-full border border-line bg-white px-3 py-1.5 text-sm font-medium text-ink hover:border-leaf">
                {photo ? "Change photo" : "Add a photo"}
                <input type="file" accept="image/*" onChange={onPhoto} className="sr-only" />
              </label>
              {photo && (
                <button
                  type="button"
                  onClick={() => setPhoto("")}
                  className="cursor-pointer px-2 text-sm text-muted underline"
                >
                  Remove
                </button>
              )}
            </div>
          </div>

          <Field label="Full name">
            <input
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              autoComplete="off"
            />
          </Field>

          <fieldset className="space-y-3 rounded-2xl border border-line p-4">
            <legend className="px-1 text-xs font-semibold tracking-wide text-muted uppercase">
              Where they fit in the tree
            </legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <PersonSelect
                label="Parent"
                emptyLabel="Not in the tree"
                value={parent1}
                onChange={setParent1}
                people={candidates.filter((p) => p.id !== parent2)}
                newName={newNames.parent1}
                onNewName={(value) => setNewNames((names) => ({ ...names, parent1: value }))}
              />
              <PersonSelect
                label="Other parent"
                emptyLabel="Not in the tree"
                value={parent2}
                onChange={setParent2}
                people={candidates.filter((p) => p.id !== parent1)}
                newName={newNames.parent2}
                onNewName={(value) => setNewNames((names) => ({ ...names, parent2: value }))}
              />
            </div>
            {spouses.map((row, i) => (
              <div key={row.key} className={i > 0 ? "space-y-2 border-t border-line pt-3" : "space-y-2"}>
                <PersonSelect
                  label={i === 0 ? "Spouse or partner" : "Another spouse or partner"}
                  emptyLabel="None"
                  value={row.id}
                  onChange={(id) => updateSpouse(row.key, { id })}
                  people={others.filter((p) => p.id === row.id || !spouses.some((other) => other.id === p.id))}
                  newName={row.newName}
                  onNewName={(newName) => updateSpouse(row.key, { newName })}
                />
                {row.id && (
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="min-w-36 flex-1">
                      <span className="mb-1 block text-xs font-medium text-muted">Status</span>
                      <select
                        className={inputClass}
                        value={row.status}
                        onChange={(e) => updateSpouse(row.key, { status: e.target.value as MarriageStatus })}
                      >
                        <option value="married">Married</option>
                        <option value="divorced">Divorced</option>
                        <option value="partners">Partners (not married)</option>
                      </select>
                    </label>
                    <label className="w-24">
                      <span className="mb-1 block text-xs font-medium text-muted">
                        {row.status === "partners" ? "Since" : "Married"}
                      </span>
                      <input
                        className={inputClass}
                        inputMode="numeric"
                        placeholder="Year"
                        value={row.startYear}
                        onChange={(e) => updateSpouse(row.key, { startYear: e.target.value })}
                      />
                    </label>
                    {row.status === "divorced" && (
                      <label className="w-24">
                        <span className="mb-1 block text-xs font-medium text-muted">Divorced</span>
                        <input
                          className={inputClass}
                          inputMode="numeric"
                          placeholder="Year"
                          value={row.endYear}
                          onChange={(e) => updateSpouse(row.key, { endYear: e.target.value })}
                        />
                      </label>
                    )}
                    {spouses.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setSpouses((rows) => rows.filter((r) => r.key !== row.key))}
                        className="cursor-pointer px-1 pb-2 text-xs font-medium text-clay hover:underline"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
            {spouses.every((row) => row.id) && (
              <button
                type="button"
                onClick={() => setSpouses((rows) => [...rows, emptySpouse()])}
                className="cursor-pointer text-sm font-medium text-leaf-dark hover:underline"
              >
                + Add another spouse or partner
              </button>
            )}
            <p className="text-xs text-muted">
              If a spouse has passed away, keep them as Married and add their year of death to their own details.
              They’ll be shown as a late husband or wife.
            </p>
          </fieldset>

          <Field label="Nickname">
            <input
              className={inputClass}
              placeholder="What the family calls them (optional)"
              maxLength={60}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              autoComplete="off"
            />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Gender">
              <select
                className={inputClass}
                value={gender}
                onChange={(e) => setGender(e.target.value as Gender | "")}
              >
                <option value="">—</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <Field label="Born">
              <input
                className={inputClass}
                inputMode="numeric"
                placeholder="Year"
                value={birthYear}
                onChange={(e) => setBirthYear(e.target.value)}
              />
            </Field>
            <Field label="Died">
              <input
                className={inputClass}
                inputMode="numeric"
                placeholder="Year"
                value={deathYear}
                onChange={(e) => setDeathYear(e.target.value)}
              />
            </Field>
          </div>

          <Field label="Lives in">
            <CityInput value={location} onChange={setLocation} familyPlaces={familyPlaces} />
          </Field>

          <Field label="About">
            <textarea
              className={`${inputClass} min-h-20 resize-y`}
              placeholder="A sentence or two the family would enjoy"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
            />
          </Field>

          <fieldset className="rounded-2xl border border-line p-4">
            <legend className="px-1 text-xs font-semibold tracking-wide text-muted uppercase">
              More photos ({gallery.length} of {MAX_GALLERY})
            </legend>
            <p className="mb-3 text-sm text-muted">Shown on their details screen, besides the profile picture.</p>
            <div className="grid grid-cols-4 gap-2">
              {gallery.map((url, i) => (
                <div key={i} className="relative aspect-square overflow-hidden rounded-xl border border-line bg-paper">
                  {/* eslint-disable-next-line @next/next/no-img-element -- user-supplied data or signed URL */}
                  <img src={url} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" draggable={false} />
                  <button
                    type="button"
                    onClick={() => setGallery((current) => current.filter((_, j) => j !== i))}
                    aria-label={`Remove photo ${i + 1}`}
                    className="absolute top-1 right-1 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-black/60 text-base text-white hover:bg-black/80"
                  >
                    ×
                  </button>
                </div>
              ))}
              {gallery.length < MAX_GALLERY && (
                <label className="flex aspect-square cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-line text-center text-xs font-medium text-muted hover:border-leaf hover:text-leaf-dark">
                  <span aria-hidden className="text-2xl leading-none">
                    +
                  </span>
                  {readingPhotos ? "Adding…" : "Add photos"}
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={onGalleryPhotos}
                    disabled={readingPhotos}
                    className="sr-only"
                  />
                </label>
              )}
            </div>
          </fieldset>

          {error && (
            <p role="alert" className="rounded-xl bg-clay/10 px-3 py-2 text-sm text-clay">
              {error}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-line px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-full px-4 py-2 text-sm font-medium text-muted hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || readingPhotos}
            className="cursor-pointer rounded-full bg-leaf px-5 py-2 text-sm font-semibold text-white hover:bg-leaf-dark disabled:cursor-default disabled:opacity-60"
          >
            {saving ? "Saving…" : editing ? "Save" : "Add to tree"}
          </button>
        </div>
      </form>
    </div>
  );
}

const NEW_PERSON = "__new__";

/** One spouse in the form, with the years as typed. */
interface SpouseRow {
  key: string;
  id: string;
  newName: string;
  status: MarriageStatus;
  startYear: string;
  endYear: string;
}

const emptySpouse = (): SpouseRow => ({
  key: crypto.randomUUID(),
  id: "",
  newName: "",
  status: "married",
  startYear: "",
  endYear: "",
});

/** A button showing who is chosen; tapping it opens a searchable list of everyone in the tree. */
function PersonSelect({
  label,
  emptyLabel,
  value,
  onChange,
  people,
  newName,
  onNewName,
}: {
  label: string;
  emptyLabel: string;
  value: string;
  onChange(value: string): void;
  people: Person[];
  newName: string;
  onNewName(name: string): void;
}) {
  const [open, setOpen] = useState(false);
  const chosen = value && value !== NEW_PERSON ? people.find((p) => p.id === value) : undefined;

  const pick = (choice: PickerChoice) => {
    setOpen(false);
    if (choice.type === "none") onChange("");
    else if (choice.type === "person") onChange(choice.id);
    else {
      onChange(NEW_PERSON);
      if (choice.name) onNewName(choice.name);
    }
  };

  return (
    <div>
      <span className="mb-1 block text-sm font-medium text-ink">{label}</span>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`${label}: ${chosen ? chosen.name : value === NEW_PERSON ? "a new person" : emptyLabel}. Tap to change.`}
        className={`${inputClass} flex cursor-pointer items-center gap-2 text-left`}
      >
        {chosen ? (
          <>
            <Avatar person={chosen} size={24} />
            <span className="min-w-0 flex-1 truncate">
              <PersonName person={chosen} />
              {chosen.birthYear && <span className="text-muted"> · b. {chosen.birthYear}</span>}
            </span>
          </>
        ) : (
          <span className="min-w-0 flex-1 truncate text-muted">
            {value === NEW_PERSON ? "+ A new person (type their name below)" : emptyLabel}
          </span>
        )}
        <span aria-hidden className="shrink-0 text-muted">
          ⌕
        </span>
      </button>
      {value === NEW_PERSON && (
        <input
          className={`${inputClass} mt-2`}
          aria-label={`${label}: new person’s full name`}
          placeholder="Their full name"
          value={newName}
          onChange={(e) => onNewName(e.target.value)}
          autoFocus={!newName}
          autoComplete="off"
        />
      )}
      {open && (
        <PersonPicker
          title={label}
          emptyLabel={emptyLabel}
          people={people}
          selectedId={value === NEW_PERSON ? "__none__" : value}
          onPick={pick}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-ink">{label}</span>
      {children}
    </label>
  );
}
