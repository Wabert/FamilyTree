"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef, useState } from "react";
import type { LayerGroup, Map as LeafletMap } from "leaflet";
import { findPlace, placeKey, type LatLng } from "@/lib/geocode";
import type { Family, Person } from "@/lib/types";
import { Avatar, lifespan } from "./Avatar";

type Leaflet = typeof import("leaflet");

interface Place {
  key: string;
  /** The place as someone typed it, e.g. "Dayton, Ohio". */
  label: string;
  people: Person[];
}

/** One map pin: every spelling that lands on the same spot ("League City, TX", "League City, Texas"). */
interface Pin {
  id: string;
  at: LatLng;
  label: string;
  keys: Set<string>;
  people: Person[];
}

/** Everyone with a "Lives in", shown as one numbered pin per place. */
export function MapView({
  family,
  selectedId,
  onSelect,
}: {
  family: Family;
  selectedId: string | null;
  onSelect(id: string): void;
}) {
  const places = useMemo(() => {
    const byKey = new Map<string, Place>();
    for (const person of family.people) {
      const label = person.location?.trim();
      if (!label) continue;
      const key = placeKey(label);
      const place = byKey.get(key);
      if (place) place.people.push(person);
      else byKey.set(key, { key, label, people: [person] });
    }
    return [...byKey.values()];
  }, [family]);

  // key -> coordinates, or null when the place couldn't be found. Missing = still looking.
  const [coords, setCoords] = useState<Record<string, LatLng | null>>({});
  const [offline, setOffline] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [mapVersion, setMapVersion] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<{ L: Leaflet; map: LeafletMap; pins: LayerGroup } | null>(null);
  const userMoved = useRef(false);

  // Different spellings of one city geocode to the same point; without merging,
  // their pins sit exactly on top of each other and only one count shows.
  const pins = useMemo(() => {
    const byPoint = new Map<string, Pin & { best: number }>();
    for (const place of places) {
      const at = coords[place.key];
      if (!at) continue;
      const id = `${at[0].toFixed(3)},${at[1].toFixed(3)}`;
      const pin = byPoint.get(id);
      if (!pin) {
        byPoint.set(id, { id, at, label: place.label, keys: new Set([place.key]), people: [...place.people], best: place.people.length });
        continue;
      }
      pin.keys.add(place.key);
      pin.people.push(...place.people);
      if (place.people.length > pin.best) {
        pin.best = place.people.length;
        pin.label = place.label;
      }
    }
    for (const pin of byPoint.values()) pin.people.sort((a, b) => a.name.localeCompare(b.name));
    return [...byPoint.values()];
  }, [places, coords]);

  // When someone is chosen elsewhere (search, details panel), show their place.
  const [shownSelection, setShownSelection] = useState<string | null>(null);
  if (selectedId !== shownSelection) {
    setShownSelection(selectedId);
    const location = family.people.find((p) => p.id === selectedId)?.location?.trim();
    if (location) setActiveKey(placeKey(location));
  }

  // Look places up one at a time, to go easy on the free lookup service.
  useEffect(() => {
    let live = true;
    void (async () => {
      for (const place of places) {
        if (!live) return;
        try {
          const at = await findPlace(place.label);
          if (live) setCoords((known) => (place.key in known ? known : { ...known, [place.key]: at }));
        } catch {
          if (live) setOffline(true);
          return;
        }
      }
    })();
    return () => {
      live = false;
    };
  }, [places]);

  // Create the map once the component is on screen (Leaflet needs the browser).
  useEffect(() => {
    const el = containerRef.current;
    let cancelled = false;
    let map: LeafletMap | undefined;
    const moved = () => {
      userMoved.current = true;
    };
    void import("leaflet").then((mod) => {
      if (cancelled || !el) return;
      const L = (mod as unknown as { default?: Leaflet }).default ?? mod;
      map = L.map(el, { zoomControl: false, worldCopyJump: true }).setView([39, -96], 4);
      L.control.zoom({ position: "bottomright" }).addTo(map);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);
      map.on("dragstart", moved);
      mapRef.current = { L, map, pins: L.layerGroup().addTo(map) };
      setMapVersion((v) => v + 1);
    });
    el?.addEventListener("wheel", moved, { passive: true });
    return () => {
      cancelled = true;
      el?.removeEventListener("wheel", moved);
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  // Draw a pin per place, and keep everything in view until the viewer moves the map.
  useEffect(() => {
    const current = mapRef.current;
    if (!current) return;
    const { L, map, pins: layer } = current;
    layer.clearLayers();
    const points: LatLng[] = [];
    for (const pin of pins) {
      const { at } = pin;
      const isActive = activeKey !== null && pin.keys.has(activeKey);
      points.push(at);
      const count = pin.people.length;
      L.marker(at, {
        title: `${pin.label}: ${count} ${count === 1 ? "person" : "people"}`,
        zIndexOffset: isActive ? 1000 : 0,
        icon: L.divIcon({
          className: "",
          html: `<span class="map-pin${isActive ? " map-pin-active" : ""}">${count}</span>`,
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        }),
      })
        .on("click", () => {
          userMoved.current = true;
          setActiveKey([...pin.keys][0]);
        })
        .addTo(layer);
    }
    if (!userMoved.current && points.length) {
      map.fitBounds(L.latLngBounds(points).pad(0.3), { maxZoom: 9, animate: false });
    }
  }, [mapVersion, pins, activeKey]);

  // Move to the place of whoever was just chosen.
  const selectedPlace = family.people.find((p) => p.id === selectedId)?.location?.trim();
  const selectedAt = (selectedPlace && coords[placeKey(selectedPlace)]) || null;
  useEffect(() => {
    const current = mapRef.current;
    if (!current || !selectedAt) return;
    userMoved.current = true;
    current.map.flyTo(selectedAt, Math.max(current.map.getZoom(), 7), { duration: 0.6 });
  }, [selectedId, selectedAt, mapVersion]);

  const active = activeKey === null ? undefined : pins.find((pin) => pin.keys.has(activeKey));
  const looking = places.filter((place) => !(place.key in coords)).length;
  const notFound = places.filter((place) => coords[place.key] === null);
  const noCity = family.people.filter((p) => !p.location?.trim()).length;
  const onMap = places.filter((place) => coords[place.key]).reduce((sum, place) => sum + place.people.length, 0);

  return (
    <div className="absolute inset-0 isolate">
      <div ref={containerRef} className="h-full w-full bg-paper" />

      <div className="absolute bottom-6 left-4 z-[1000] w-[min(20rem,calc(100%-5rem))]">
        {active ? (
          <div className="flex max-h-[45dvh] flex-col rounded-2xl border border-line bg-card shadow-xl">
            <div className="flex items-start justify-between gap-2 px-4 pt-3 pb-1">
              <div className="min-w-0">
                <h2 className="truncate font-display text-lg leading-tight font-semibold text-ink">{active.label}</h2>
                <p className="text-xs text-muted">
                  {active.people.length} {active.people.length === 1 ? "person" : "people"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveKey(null)}
                aria-label="Close"
                className="-mt-1 -mr-2 flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-lg text-muted hover:bg-paper hover:text-ink"
              >
                ×
              </button>
            </div>
            <ul className="overflow-y-auto px-2 pb-2">
              {active.people.map((person) => (
                <li key={person.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(person.id)}
                    className={[
                      "flex w-full cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 text-left hover:bg-paper",
                      person.id === selectedId ? "bg-leaf-soft" : "",
                    ].join(" ")}
                  >
                    <Avatar person={person} size={30} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ink">
                        {person.name}
                        {person.nickname && <span className="font-normal text-muted italic"> “{person.nickname}”</span>}
                      </span>
                      {lifespan(person) && <span className="block text-[11px] text-muted">{lifespan(person)}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="rounded-2xl border border-line bg-card px-4 py-2.5 text-xs text-muted shadow-sm">
            <p className="text-sm font-medium text-ink">
              {places.length === 0
                ? "No one has a city yet"
                : `${onMap} of ${family.people.length} ${family.people.length === 1 ? "person" : "people"} on the map`}
            </p>
            {places.length === 0 && <p>Add “Lives in” to people’s details and they’ll appear here.</p>}
            {looking > 0 && !offline && <p>Finding {looking === 1 ? "1 place" : `${looking} places`}…</p>}
            {offline && <p className="text-clay">Couldn’t look up places. Check your connection and reopen the map.</p>}
            {notFound.length > 0 && <p>Not found: {notFound.map((place) => place.label).join("; ")}</p>}
            {places.length > 0 && noCity > 0 && (
              <p>
                {noCity} {noCity === 1 ? "person has" : "people have"} no city yet.
              </p>
            )}
            {onMap > 0 && <p>Tap a pin to see who lives there.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
