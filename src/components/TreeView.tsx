"use client";

import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, Ref } from "react";
import { COMPACT_CARDS, computeLayout, REGULAR_CARDS } from "@/lib/layout";
import type { Relationship } from "@/lib/relationship";
import type { Family } from "@/lib/types";
import { Avatar, lifespan } from "./Avatar";

export interface TreeViewHandle {
  /**
   * `covered` measures how much of the tree area the toolbar and details panel
   * hide, in pixels. It is asked again whenever the tree area changes size (a
   * phone's keyboard closing, the screen turning), so the person stays centred
   * until the viewer moves the tree themselves.
   */
  centerOn(id: string, covered?: () => Covered): void;
}

interface Covered {
  top?: number;
  right?: number;
  bottom?: number;
}

interface View {
  x: number;
  y: number;
  k: number;
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 1.6;
const FOCUS_ZOOM = 0.7;
const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);

function zoomAbout(view: View, px: number, py: number, nextK: number): View {
  const k = clamp(nextK, MIN_ZOOM, MAX_ZOOM);
  const ratio = k / view.k;
  return { k, x: px - (px - view.x) * ratio, y: py - (py - view.y) * ratio };
}

export function TreeView({
  family,
  meId,
  selectedId,
  relations,
  compact,
  onSelect,
  ref,
}: {
  family: Family;
  meId: string | null;
  selectedId: string | null;
  relations: Map<string, Relationship> | null;
  /** Smaller cards, used when relationship labels are turned off. */
  compact: boolean;
  onSelect(id: string): void;
  ref?: Ref<TreeViewHandle>;
}) {
  const layout = useMemo(() => computeLayout(family, compact ? COMPACT_CARDS : REGULAR_CARDS), [family, compact]);
  const { cardW: CARD_W, cardH: CARD_H } = layout;
  const people = useMemo(() => new Map(family.people.map((p) => [p.id, p])), [family]);

  const containerRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View | null>(null);
  const [smooth, setSmooth] = useState(false);

  const userMoved = useRef(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const dragged = useRef(false);

  /** The person the tree was last asked to centre on, until the viewer moves it. */
  const focus = useRef<{ id: string; covered?: () => Covered } | null>(null);

  // Switching between regular and compact cards redraws the whole tree, so fit
  // it to the screen again. (Runs before the fitting effect below.)
  useEffect(() => {
    userMoved.current = false;
    focus.current = null;
  }, [compact]);

  const centerFocus = useCallback(() => {
    const el = containerRef.current;
    const target = focus.current;
    const node = target && layout.nodes.find((n) => n.id === target.id);
    if (!el || !node) return;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const covered = target.covered?.() ?? {};
    const top = covered.top ?? 0;
    const width = rect.width - (covered.right ?? 0);
    const height = rect.height - top - (covered.bottom ?? 0);
    userMoved.current = true;
    setSmooth(true);
    setView((v) => {
      // Close enough to read the names, far enough to see who is around them.
      const k = Math.max(v?.k ?? 1, FOCUS_ZOOM);
      return {
        k,
        x: width / 2 - (node.x + layout.cardW / 2) * k,
        y: top + height / 2 - (node.y + layout.cardH / 2) * k,
      };
    });
  }, [layout]);

  // Fit the whole tree on screen until the viewer starts moving it themselves.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const fit = () => {
      // On a phone the tree area is still short when someone is picked from
      // search (the keyboard is on its way out), so centre again once it settles.
      if (focus.current) return centerFocus();
      if (userMoved.current) return;
      const { width, height } = el.getBoundingClientRect();
      if (!width || !height || !layout.width) return;
      const pad = 28;
      const k = clamp(
        Math.min((width - pad * 2) / layout.width, (height - pad * 2) / layout.height),
        0.5,
        1,
      );
      const fitsWide = layout.width * k <= width - pad * 2;
      const fitsTall = layout.height * k <= height - pad * 2;
      // On a small screen, open on the viewer's own branch rather than the top of the tree.
      const mine = layout.nodes.find((n) => n.id === meId);
      const focusX = mine ? mine.x + layout.cardW / 2 : layout.focus.x;
      setView({
        k,
        x: fitsWide ? (width - layout.width * k) / 2 : width / 2 - focusX * k,
        y: fitsTall ? (height - layout.height * k) / 2 : pad,
      });
    };
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [layout, meId, centerFocus]);

  // Wheel needs a non-passive listener so the page itself doesn't scroll or zoom.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      userMoved.current = true;
      focus.current = null;
      setSmooth(false);
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      setView((v) => v && zoomAbout(v, px, py, v.k * Math.exp(-e.deltaY * 0.0015)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      centerOn(id, covered) {
        focus.current = { id, covered };
        centerFocus();
      },
    }),
    [centerFocus],
  );

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      dragStart.current = { x: e.clientX, y: e.clientY };
      dragged.current = false;
    }
    setSmooth(false);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };

    if (pointers.current.size === 1) {
      const start = dragStart.current!;
      if (!dragged.current && Math.hypot(cur.x - start.x, cur.y - start.y) > 6) {
        dragged.current = true;
        userMoved.current = true;
        focus.current = null;
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      if (dragged.current) {
        const dx = cur.x - prev.x;
        const dy = cur.y - prev.y;
        setView((v) => v && { ...v, x: v.x + dx, y: v.y + dy });
      }
    } else if (pointers.current.size === 2) {
      // Pinch: zoom about the midpoint of the two fingers and follow it.
      const other = [...pointers.current.entries()].find(([id]) => id !== e.pointerId)![1];
      const rect = e.currentTarget.getBoundingClientRect();
      const before = Math.hypot(prev.x - other.x, prev.y - other.y);
      const after = Math.hypot(cur.x - other.x, cur.y - other.y);
      const midX = (cur.x + other.x) / 2 - rect.left;
      const midY = (cur.y + other.y) / 2 - rect.top;
      const dx = (cur.x - prev.x) / 2;
      const dy = (cur.y - prev.y) / 2;
      dragged.current = true;
      userMoved.current = true;
      focus.current = null;
      if (before > 0) {
        setView((v) => {
          if (!v) return v;
          const zoomed = zoomAbout(v, midX, midY, v.k * (after / before));
          return { ...zoomed, x: zoomed.x + dx, y: zoomed.y + dy };
        });
      }
    }
    pointers.current.set(e.pointerId, cur);
  };

  const onPointerEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
  };

  return (
    <div
      ref={containerRef}
      className="tree-surface absolute inset-0 cursor-grab touch-none overflow-hidden select-none active:cursor-grabbing"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    >
      <div
        className="absolute top-0 left-0 origin-top-left"
        style={{
          width: layout.width,
          height: layout.height,
          transform: view ? `translate(${view.x}px, ${view.y}px) scale(${view.k})` : undefined,
          opacity: view ? 1 : 0,
          transition: smooth ? "transform 280ms ease-out" : undefined,
        }}
      >
        <svg
          width={layout.width}
          height={layout.height}
          className="pointer-events-none absolute top-0 left-0 overflow-visible"
          fill="none"
          stroke="var(--color-line)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {layout.couples.map((c) => {
            if (!c.divorced) {
              return (
                <line key={c.key} x1={c.x1} x2={c.x2} y1={c.y} y2={c.y}>
                  <title>{c.title}</title>
                </line>
              );
            }
            // Divorced or split up: a dashed line broken by two slashes.
            const mid = (c.x1 + c.x2) / 2;
            return (
              <g key={c.key}>
                <title>{c.title}</title>
                <line x1={c.x1} x2={c.x2} y1={c.y} y2={c.y} strokeDasharray="2 3" />
                <path
                  d={`M${mid - 4},${c.y + 5} L${mid - 1},${c.y - 5} M${mid + 1},${c.y + 5} L${mid + 4},${c.y - 5}`}
                  stroke="var(--color-muted)"
                  strokeWidth={1.5}
                />
              </g>
            );
          })}
          {layout.paths.map((p) => (
            <path key={p.key} d={p.d} strokeDasharray={p.dashed ? "5 6" : undefined} />
          ))}
        </svg>

        {layout.nodes.map((node) => {
          const person = people.get(node.id);
          if (!person) return null;
          const isMe = node.id === meId;
          const isSelected = node.id === selectedId;
          const relation = relations?.get(node.id);
          const years = lifespan(person);
          return (
            <button
              key={node.id}
              type="button"
              onClick={() => {
                if (!dragged.current) onSelect(node.id);
              }}
              aria-pressed={isSelected}
              className={[
                "absolute flex cursor-pointer flex-col items-center rounded-2xl border px-2 text-center transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leaf",
                // People who have died: a quieter card, so the living stand out a little.
                person.deathYear ? "bg-memorial" : "bg-card shadow-sm",
                isSelected ? "border-ink ring-2 ring-ink" : isMe ? "border-leaf ring-2 ring-leaf" : "border-line",
                compact ? "pt-2.5 pb-1.5" : "pt-3 pb-2",
              ].join(" ")}
              style={{ left: node.x, top: node.y, width: CARD_W, height: CARD_H }}
            >
              <span className={person.deathYear ? "opacity-75 grayscale-[60%]" : undefined}>
                <Avatar person={person} size={compact ? 44 : 56} />
              </span>
              <span
                className={`${compact ? "mt-1.5" : "mt-2"} line-clamp-2 text-[13px] leading-tight font-semibold ${person.deathYear ? "text-ink/70" : "text-ink"}`}
              >
                {person.name}
              </span>
              {(person.nickname || years) && (
                <span className="mt-0.5 max-w-full truncate text-[11px] text-muted">
                  {person.nickname && <span className="italic">“{person.nickname}”</span>}
                  {person.nickname && years && " · "}
                  {years}
                </span>
              )}
              {relation && (
                <span
                  className={[
                    "mt-auto line-clamp-2 max-w-full rounded-lg px-2 py-0.5 text-[10px] leading-tight font-medium",
                    relation.kind === "self"
                      ? "bg-leaf text-white"
                      : relation.kind === "none"
                        ? "bg-paper text-muted"
                        : "bg-leaf-soft text-leaf-dark",
                  ].join(" ")}
                  title={relation.label}
                >
                  {relation.label}
                </span>
              )}
            </button>
          );
        })}
      </div>

    </div>
  );
}
