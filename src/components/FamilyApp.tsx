"use client";

import { useMemo, useRef, useState } from "react";
import { buildIndex } from "@/lib/graph";
import { relationship, type Relationship } from "@/lib/relationship";
import { leaveFamily, signOut, type SessionState } from "@/lib/session";
import {
  canManage,
  deletePerson,
  renameFamily,
  resetToSample,
  setMe,
  startEmptyFamily,
  useAppState,
} from "@/lib/store";
import { setShowRelations, setViewMode, useShowRelations, useViewMode, type ViewMode } from "@/lib/prefs";
import { ChangeHistoryDialog } from "./ChangeHistoryDialog";
import { InviteDialog } from "./InviteDialog";
import { KeepAccessDialog } from "./KeepAccessDialog";
import { ListView } from "./ListView";
import { MapView } from "./MapView";
import { MembersDialog } from "./MembersDialog";
import { SearchBox } from "./SearchBox";
import { PersonForm, type FormMode } from "./PersonForm";
import { PersonDetails } from "./PersonDetails";
import { PersonPanel } from "./PersonPanel";
import { TreeView, type TreeViewHandle } from "./TreeView";

const errorText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong. Please try again.");

const menuItem = "block w-full cursor-pointer px-4 py-2.5 text-left hover:bg-paper";

export function FamilyApp({ session }: { session: SessionState }) {
  const { family, meId, mode, role, inviteCode, userId } = useAppState();
  const shared = mode === "remote";
  const index = useMemo(() => buildIndex(family), [family]);
  const me = meId && index.byId.has(meId) ? meId : null;

  const showRelations = useShowRelations();
  const relations = useMemo(() => {
    if (!me || !showRelations) return null;
    return new Map<string, Relationship>(family.people.map((p) => [p.id, relationship(index, me, p.id)]));
  }, [family, index, me, showRelations]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** Whose full details screen is open; it only shows while they are still selected. */
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [form, setForm] = useState<FormMode | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [invite, setInvite] = useState<{ link: string; localOnly: boolean } | null>(null);
  const [notice, setNotice] = useState("");
  const [showMembers, setShowMembers] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showKeepAccess, setShowKeepAccess] = useState(false);
  const [focusTick, setFocusTick] = useState(0);
  const viewMode = useViewMode();
  const treeRef = useRef<TreeViewHandle>(null);
  const mainRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLDetailsElement>(null);

  const selected = selectedId ? index.byId.get(selectedId) : undefined;
  const sortedPeople = useMemo(
    () => [...family.people].sort((a, b) => a.name.localeCompare(b.name)),
    [family],
  );
  const manager = canManage(role);
  const canRemoveSelected = !shared || manager || (!!selected && selected.createdBy === userId);

  /** Run a change and show any failure in the banner. */
  const attempt = async (action: () => Promise<void> | void) => {
    try {
      await action();
      setNotice("");
    } catch (e) {
      setNotice(errorText(e));
    }
  };

  const closeMenu = () => menuRef.current?.removeAttribute("open");

  const openForm = (mode: FormMode) => {
    setFormKey((k) => k + 1);
    setForm(mode);
  };

  // Select someone and bring their card into the part of the tree that the
  // view switcher and search (on top) and their card (a bottom sheet on phones,
  // a side panel on wider screens) don't cover. Wait a beat so the card has
  // opened and any person who was just added has been laid out, then measure.
  // The tree measures again whenever its area changes size: on a phone the
  // keyboard is still closing when someone is picked from search.
  const coveredByOverlays = () => {
    const main = mainRef.current;
    if (!main) return {};
    const area = main.getBoundingClientRect();
    const toolbar = main.querySelector("[data-tree-toolbar]")?.getBoundingClientRect();
    const panel = main.querySelector("[data-person-panel]")?.getBoundingClientRect();
    const top = toolbar ? Math.max(0, toolbar.bottom - area.top) : 0;
    if (!panel) return { top };
    return window.matchMedia("(max-width: 767px)").matches
      ? { top, bottom: Math.max(0, area.bottom - panel.top) }
      : { top, right: Math.max(0, area.right - panel.left) };
  };

  const focusPerson = (id: string) => {
    setSelectedId(id);
    window.setTimeout(() => treeRef.current?.centerOn(id, coveredByOverlays), 60);
  };

  // Tapping a card on a phone would otherwise hide it behind the bottom sheet.
  const selectFromTree = (id: string) => {
    if (window.matchMedia("(max-width: 767px)").matches) focusPerson(id);
    else setSelectedId(id);
  };

  const claim = (id: string | null) => {
    void attempt(() => setMe(id));
    if (id) focusPerson(id);
  };

  const removeSelected = () => {
    if (!selected) return;
    const warning = shared
      ? `Remove ${selected.name} from the tree for everyone? Their links to other people will be removed too.`
      : `Remove ${selected.name} from the tree? Their links to other people will be removed too.`;
    if (!window.confirm(warning)) return;
    const id = selected.id;
    void attempt(async () => {
      await deletePerson(id);
      setSelectedId(null);
    });
  };

  const showInvite = () => {
    closeMenu();
    if (!inviteCode) return;
    const { origin, hostname } = window.location;
    setInvite({
      link: `${origin}/?join=${inviteCode}`,
      localOnly: hostname === "localhost" || hostname === "127.0.0.1",
    });
  };

  const rename = () => {
    closeMenu();
    const name = window.prompt("What should this family tree be called?", family.name);
    if (!name?.trim() || name.trim() === family.name) return;
    void attempt(() => renameFamily(name.trim()));
  };

  const switchFamily = () => {
    closeMenu();
    void leaveFamily();
  };

  const leave = () => {
    closeMenu();
    if (
      session.isGuest &&
      !window.confirm(
        "You joined without an email, so signing out means you’ll need the invite link to get back in, and you’ll show up as someone new. To avoid that, choose “Keep your access: add your email” in the ⋯ menu first. Sign out anyway?",
      )
    ) {
      return;
    }
    void attempt(signOut);
  };

  const loadSample = () => {
    closeMenu();
    if (!window.confirm("Replace the current tree with the sample Hartley family? This can’t be undone.")) return;
    void attempt(resetToSample);
    setSelectedId(null);
  };

  const startFresh = () => {
    closeMenu();
    const name = window.prompt("What should your family’s tree be called?", "The ______ Family");
    if (!name?.trim()) return;
    if (
      family.people.length &&
      !window.confirm("Start a new, empty tree? Everyone in the current tree will be removed. This can’t be undone.")
    ) {
      return;
    }
    void attempt(() => startEmptyFamily(name.trim()));
    setSelectedId(null);
  };

  return (
    <div className="flex h-dvh flex-col bg-paper text-ink">
      {/* Phones: the name and the menu on one line, the buttons on the next. Wider screens: one line. */}
      <header className="z-20 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line bg-card px-4 py-2 sm:px-6">
        <h1 className="mr-auto min-w-0 truncate font-display text-xl leading-tight font-semibold">{family.name}</h1>

        <div className="order-last flex w-full gap-2 sm:order-none sm:w-auto">
          {shared && (
            <button
              type="button"
              onClick={showInvite}
              className="cursor-pointer rounded-full border border-line bg-white px-4 py-1 text-sm font-semibold text-ink hover:border-leaf"
            >
              Invite
            </button>
          )}
          <button
            type="button"
            onClick={() => openForm({ type: "add" })}
            className="cursor-pointer rounded-full bg-leaf px-4 py-1 text-sm font-semibold text-white hover:bg-leaf-dark"
          >
            + Person
          </button>
        </div>

        <details ref={menuRef} className="relative">
          <summary
            aria-label="More options"
            className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-full border border-line bg-white text-lg text-ink hover:border-leaf [&::-webkit-details-marker]:hidden"
          >
            ⋯
          </summary>
          <div className="absolute right-0 z-30 mt-2 w-64 overflow-hidden rounded-2xl border border-line bg-card py-1 text-sm shadow-xl">
            {family.people.length > 0 && (
              <label className="block border-b border-line px-4 pt-2.5 pb-3">
                <span className="mb-1 block text-xs font-semibold tracking-wide text-muted uppercase">I am</span>
                <select
                  value={me ?? ""}
                  onChange={(e) => {
                    closeMenu();
                    claim(e.target.value || null);
                  }}
                  className="w-full cursor-pointer rounded-xl border border-line bg-white px-3 py-2 text-base font-medium text-ink outline-none focus:border-leaf sm:text-sm"
                >
                  <option value="">Choose…</option>
                  {sortedPeople.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {family.people.length > 0 && (
              <button
                type="button"
                role="switch"
                aria-checked={showRelations}
                onClick={() => setShowRelations(!showRelations)}
                className="flex w-full cursor-pointer items-center justify-between gap-3 border-b border-line px-4 py-2.5 text-left hover:bg-paper"
              >
                <span>Show how we’re related</span>
                <span
                  aria-hidden
                  className={[
                    "relative h-6 w-10 shrink-0 rounded-full transition-colors",
                    showRelations ? "bg-leaf" : "bg-line",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left]",
                      showRelations ? "left-[18px]" : "left-0.5",
                    ].join(" ")}
                  />
                </span>
              </button>
            )}
            {shared ? (
              <>
                <p className="border-b border-line px-4 py-2.5 text-xs text-muted">
                  {session.email ? `Signed in as ${session.email}` : "Joined on this device without an email"}
                </p>
                {session.isGuest && (
                  <button
                    type="button"
                    onClick={() => {
                      closeMenu();
                      setShowKeepAccess(true);
                    }}
                    className={`${menuItem} font-semibold text-leaf-dark`}
                  >
                    Keep your access: add your email
                  </button>
                )}
                <button type="button" onClick={showInvite} className={menuItem}>
                  Invite family
                </button>
                {manager && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        closeMenu();
                        setShowMembers(true);
                      }}
                      className={menuItem}
                    >
                      Manage members
                    </button>
                    <button type="button" onClick={rename} className={menuItem}>
                      Rename this tree
                    </button>
                  </>
                )}
                {session.canCreate && (
                  <button
                    type="button"
                    onClick={() => {
                      closeMenu();
                      setShowHistory(true);
                    }}
                    className={menuItem}
                  >
                    Change history
                  </button>
                )}
                <button type="button" onClick={switchFamily} className={menuItem}>
                  Switch or start another tree
                </button>
                <button type="button" onClick={leave} className={menuItem}>
                  Sign out
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={startFresh} className={menuItem}>
                  Start my own family’s tree
                </button>
                <button type="button" onClick={loadSample} className={menuItem}>
                  Load the sample family
                </button>
              </>
            )}
          </div>
        </details>
      </header>

      {notice && (
        <div role="alert" className="z-20 flex items-start gap-3 bg-clay px-4 py-2 text-sm text-white sm:px-6">
          <span className="flex-1">{notice}</span>
          <button type="button" onClick={() => setNotice("")} className="cursor-pointer underline">
            Dismiss
          </button>
        </div>
      )}

      <main ref={mainRef} className="relative flex-1 overflow-hidden">
        {family.people.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6">
            <div className="max-w-sm text-center">
              <h2 className="font-display text-2xl font-semibold">Start with the oldest relatives you know</h2>
              <p className="mt-2 text-sm text-muted">
                Add a grandparent or great-grandparent first, then add their children. Everyone else can find their
                spot from there.
              </p>
              <button
                type="button"
                onClick={() => openForm({ type: "add" })}
                className="mt-5 cursor-pointer rounded-full bg-leaf px-5 py-2.5 text-sm font-semibold text-white hover:bg-leaf-dark"
              >
                + Add the first person
              </button>
            </div>
          </div>
        ) : (
          <>
            {viewMode === "list" ? (
              <ListView
                family={family}
                meId={me}
                selectedId={selectedId}
                relations={relations}
                compact={!showRelations}
                panelOpen={!!selected}
                focusTick={focusTick}
                onSelect={setSelectedId}
              />
            ) : viewMode === "map" ? (
              <MapView family={family} selectedId={selectedId} onSelect={setSelectedId} />
            ) : (
              <TreeView
                ref={treeRef}
                family={family}
                meId={me}
                selectedId={selectedId}
                relations={relations}
                compact={!showRelations}
                onSelect={selectFromTree}
              />
            )}
            <div
              data-tree-toolbar
              className="pointer-events-none absolute inset-x-4 top-4 z-[5] flex items-start gap-2"
            >
              <div
                role="group"
                aria-label="How to show the family"
                className="pointer-events-auto flex shrink-0 overflow-hidden rounded-xl border border-line bg-card text-sm shadow-sm"
              >
                {(["tree", "list", "map"] as ViewMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={viewMode === mode}
                    onClick={() => setViewMode(mode)}
                    className={[
                      "cursor-pointer px-3 py-2 font-medium capitalize sm:px-3.5",
                      viewMode === mode ? "bg-leaf text-white" : "text-ink hover:bg-paper",
                    ].join(" ")}
                  >
                    {mode}
                  </button>
                ))}
              </div>
              <div className="pointer-events-auto min-w-0 flex-1 sm:max-w-64">
                <SearchBox
                  people={family.people}
                  onPick={(id) => {
                    setFocusTick((n) => n + 1);
                    focusPerson(id);
                  }}
                />
              </div>
            </div>
            {!me && showRelations && !selected && viewMode !== "map" && (
              <p className="pointer-events-none absolute bottom-4 left-1/2 w-max max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-full border border-line bg-card px-4 py-2 text-center text-sm text-ink shadow-sm">
                Choose who you are under <strong className="font-semibold">I am</strong> in the ⋯ menu to see how
                you’re related to everyone.
              </p>
            )}
          </>
        )}

        {selected && (
          <PersonPanel
            person={selected}
            index={index}
            meId={me}
            relation={relations?.get(selected.id) ?? null}
            showRelation={showRelations}
            onClose={() => setSelectedId(null)}
            onDetails={() => setDetailsId(selected.id)}
          />
        )}
      </main>

      {selected && detailsId === selected.id && (
        <PersonDetails
          person={selected}
          index={index}
          meId={me}
          relation={relations?.get(selected.id) ?? null}
          showRelation={showRelations}
          canRemove={canRemoveSelected}
          onClose={() => setDetailsId(null)}
          onSelect={(id) => {
            setDetailsId(id);
            focusPerson(id);
          }}
          onEdit={() => openForm({ type: "edit", id: selected.id })}
          onDelete={removeSelected}
        />
      )}

      {form && (
        <PersonForm
          key={formKey}
          mode={form}
          family={family}
          index={index}
          onClose={() => setForm(null)}
          onSaved={(id) => {
            // After an edit, go back to the details being edited; after adding
            // someone, show them in the tree.
            if (form.type === "add") setDetailsId(null);
            setForm(null);
            setNotice("");
            focusPerson(id);
          }}
        />
      )}

      {showMembers && shared && manager && (
        <MembersDialog family={family} currentUserId={userId} myRole={role} onClose={() => setShowMembers(false)} />
      )}

      {showHistory && shared && session.canCreate && <ChangeHistoryDialog onClose={() => setShowHistory(false)} />}

      {showKeepAccess && <KeepAccessDialog onClose={() => setShowKeepAccess(false)} />}

      {invite && inviteCode && (
        <InviteDialog
          familyName={family.name}
          link={invite.link}
          code={inviteCode}
          localOnly={invite.localOnly}
          onClose={() => setInvite(null)}
        />
      )}
    </div>
  );
}
