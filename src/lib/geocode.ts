/**
 * Turns the free-text "Lives in" of a person ("Dayton, Ohio") into map
 * coordinates, using the free Photon search service built on OpenStreetMap.
 * Only the place text is sent, never anyone's name. Answers are remembered in
 * this browser so each place is only looked up once per device.
 */

export type LatLng = [lat: number, lng: number];

const CACHE_KEY = "family-reunion:places";
const ENDPOINT = "https://photon.komoot.io/api/";

let cache: Record<string, LatLng | null> | null = null;
const pending = new Map<string, Promise<LatLng | null>>();

/** "  Dayton,  OHIO " and "dayton, ohio" are the same place. */
export const placeKey = (text: string) => text.trim().replace(/\s+/g, " ").toLowerCase();

function load(): Record<string, LatLng | null> {
  if (!cache) {
    try {
      cache = JSON.parse(window.localStorage.getItem(CACHE_KEY) ?? "{}") as Record<string, LatLng | null>;
    } catch {
      cache = {};
    }
  }
  return cache;
}

function save() {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Storage is blocked or full: places are simply looked up again next time.
  }
}

/** Coordinates already known on this device: undefined means not looked up yet. */
export function knownPlace(text: string): LatLng | null | undefined {
  return load()[placeKey(text)];
}

/** Look a place up. Resolves to null when it can't be found; rejects when the service can't be reached. */
export function findPlace(text: string): Promise<LatLng | null> {
  const key = placeKey(text);
  const known = load()[key];
  if (known !== undefined) return Promise.resolve(known);

  let request = pending.get(key);
  if (!request) {
    request = (async () => {
      const response = await fetch(`${ENDPOINT}?limit=1&q=${encodeURIComponent(key)}`);
      if (!response.ok) throw new Error(`Place lookup failed (${response.status})`);
      const body = (await response.json()) as { features?: { geometry?: { coordinates?: number[] } }[] };
      const point = body.features?.[0]?.geometry?.coordinates;
      const found: LatLng | null =
        point && Number.isFinite(point[0]) && Number.isFinite(point[1]) ? [point[1], point[0]] : null;
      load()[key] = found;
      save();
      return found;
    })().finally(() => pending.delete(key));
    pending.set(key, request);
  }
  return request;
}

/** Record where a place is, e.g. when it was picked from the suggestions, so the map needs no lookup. */
export function rememberPlace(text: string, at: LatLng) {
  load()[placeKey(text)] = at;
  save();
}

export interface CitySuggestion {
  /** How the place is written into "Lives in", e.g. "League City, TX". */
  label: string;
  /** Extra detail to tell same-named places apart, e.g. "Texas, United States". */
  detail: string;
  at: LatLng;
}

const US_STATES: Record<string, string> = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA", Colorado: "CO",
  Connecticut: "CT", Delaware: "DE", "District of Columbia": "DC", Florida: "FL", Georgia: "GA",
  Hawaii: "HI", Idaho: "ID", Illinois: "IL", Indiana: "IN", Iowa: "IA", Kansas: "KS", Kentucky: "KY",
  Louisiana: "LA", Maine: "ME", Maryland: "MD", Massachusetts: "MA", Michigan: "MI", Minnesota: "MN",
  Mississippi: "MS", Missouri: "MO", Montana: "MT", Nebraska: "NE", Nevada: "NV", "New Hampshire": "NH",
  "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY", "North Carolina": "NC", "North Dakota": "ND",
  Ohio: "OH", Oklahoma: "OK", Oregon: "OR", Pennsylvania: "PA", "Rhode Island": "RI",
  "South Carolina": "SC", "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT", Vermont: "VT",
  Virginia: "VA", Washington: "WA", "West Virginia": "WV", Wisconsin: "WI", Wyoming: "WY",
  "Puerto Rico": "PR",
};

const TOWN_TYPES = new Set(["city", "town", "village", "hamlet", "municipality", "borough", "suburb"]);

interface PhotonFeature {
  geometry?: { coordinates?: number[] };
  properties?: { name?: string; state?: string; country?: string; countrycode?: string; osm_key?: string; osm_value?: string };
}

/**
 * Cities and towns whose name starts like `text`, US first. Only the typed
 * text is sent. Rejects when the service can't be reached or `signal` aborts.
 */
export async function suggestCities(text: string, signal?: AbortSignal): Promise<CitySuggestion[]> {
  const q = text.trim();
  if (q.length < 2) return [];
  const response = await fetch(
    `${ENDPOINT}?limit=12&lang=en&layer=city&lat=39&lon=-96&q=${encodeURIComponent(q)}`,
    { signal },
  );
  if (!response.ok) throw new Error(`Place lookup failed (${response.status})`);
  const body = (await response.json()) as { features?: PhotonFeature[] };
  const seen = new Set<string>();
  const results: (CitySuggestion & { us: boolean })[] = [];
  for (const feature of body.features ?? []) {
    const p = feature.properties ?? {};
    const point = feature.geometry?.coordinates;
    if (!p.name || p.osm_key !== "place" || !TOWN_TYPES.has(p.osm_value ?? "")) continue;
    if (!point || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) continue;
    const us = p.countrycode === "US";
    const region = us ? (p.state && US_STATES[p.state]) || p.state : p.state;
    const label = us
      ? [p.name, region].filter(Boolean).join(", ")
      : [p.name, p.state, p.country].filter(Boolean).join(", ");
    const key = placeKey(label);
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({ label, detail: [p.state, p.country].filter(Boolean).join(", "), at: [point[1], point[0]], us });
  }
  results.sort((a, b) => Number(b.us) - Number(a.us));
  return results.slice(0, 6).map(({ label, detail, at }) => ({ label, detail, at }));
}
