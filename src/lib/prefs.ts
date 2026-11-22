import { useSyncExternalStore } from "react";

/** How the family is shown: the drawn tree, a compact indented list, or a map of where people live. */
export type ViewMode = "tree" | "list" | "map";
const MODES: ViewMode[] = ["tree", "list", "map"];

const KEY = "family-reunion:view";
const listeners = new Set<() => void>();
let current: ViewMode | null = null;

function get(): ViewMode {
  if (current === null) {
    try {
      const saved = window.localStorage.getItem(KEY) as ViewMode | null;
      current = saved && MODES.includes(saved) ? saved : "tree";
    } catch {
      current = "tree";
    }
  }
  return current;
}

export function setViewMode(mode: ViewMode) {
  current = mode;
  try {
    window.localStorage.setItem(KEY, mode);
  } catch {
    // Storage is blocked: the choice just won't be remembered next time.
  }
  listeners.forEach((listener) => listener());
}

/** The viewer's choice, remembered on this device. */
export function useViewMode(): ViewMode {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    get,
    () => "tree",
  );
}

/** Whether "your cousin", "your aunt" and so on are shown on cards and details. On unless turned off. */
const RELATIONS_KEY = "family-reunion:show-relations";
const relationListeners = new Set<() => void>();
let showRelations: boolean | null = null;

function getShowRelations(): boolean {
  if (showRelations === null) {
    try {
      showRelations = window.localStorage.getItem(RELATIONS_KEY) !== "off";
    } catch {
      showRelations = true;
    }
  }
  return showRelations;
}

export function setShowRelations(show: boolean) {
  showRelations = show;
  try {
    window.localStorage.setItem(RELATIONS_KEY, show ? "on" : "off");
  } catch {
    // Storage is blocked: the choice just won't be remembered next time.
  }
  relationListeners.forEach((listener) => listener());
}

/** The viewer's choice, remembered on this device. */
export function useShowRelations(): boolean {
  return useSyncExternalStore(
    (listener) => {
      relationListeners.add(listener);
      return () => {
        relationListeners.delete(listener);
      };
    },
    getShowRelations,
    () => true,
  );
}

/**
 * In Tree mode: the whole drawn tree, or Focus (one person with their
 * grandparents, parents, siblings, spouse and children). Focus starts as the
 * default on phones and whole tree on bigger screens, until the viewer picks.
 */
export type TreeStyle = "whole" | "focus";
const TREE_STYLE_KEY = "family-reunion:tree-style";
const treeStyleListeners = new Set<() => void>();
let treeStyle: TreeStyle | null = null;

function getTreeStyle(): TreeStyle {
  if (treeStyle === null) {
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem(TREE_STYLE_KEY);
    } catch {
      // Storage blocked: fall back to the screen-size default.
    }
    treeStyle =
      saved === "whole" || saved === "focus"
        ? saved
        : window.matchMedia("(max-width: 767px)").matches
          ? "focus"
          : "whole";
  }
  return treeStyle;
}

export function setTreeStyle(style: TreeStyle) {
  treeStyle = style;
  try {
    window.localStorage.setItem(TREE_STYLE_KEY, style);
  } catch {
    // Storage is blocked: the choice just won't be remembered next time.
  }
  treeStyleListeners.forEach((listener) => listener());
}

/** The viewer's choice, remembered on this device. */
export function useTreeStyle(): TreeStyle {
  return useSyncExternalStore(
    (listener) => {
      treeStyleListeners.add(listener);
      return () => {
        treeStyleListeners.delete(listener);
      };
    },
    getTreeStyle,
    () => "whole",
  );
}
