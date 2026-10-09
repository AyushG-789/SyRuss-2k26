// Places a traveller can pick in the trip form: our POIs plus every rail/metro station.
// Anything outside this list isn't covered by the prototype network yet.

import poisMock from "@/mocks/pois.json";
import { stations } from "./api";
import type { Place } from "./types";

export interface PlaceOption extends Place {
  kind: "place" | "station";
  /** For stations: which network it is on (shown as an icon in the place picker). */
  mode?: "local" | "metro";
}

const pois = poisMock.pois as unknown as Record<string, { name: string; lat: number; lon: number }>;

export const PLACE_OPTIONS: PlaceOption[] = [
  ...Object.entries(pois).map(([id, p]) => ({ label: p.name, lat: p.lat, lon: p.lon, poi_id: id, kind: "place" as const })),
  ...Object.entries(stations)
    .filter(([, s]) => s.mode !== "bus")
    .map(([, s]) => ({ label: `${s.name} station`, lat: s.lat, lon: s.lon, poi_id: null, kind: "station" as const, mode: s.mode as "local" | "metro" })),
].sort((a, b) => a.label.localeCompare(b.label));

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const core = (p: PlaceOption) => norm(p.label).replace(/ station$/, "");
const words = (s: string) => norm(s).split(" ").filter((w) => w.length >= 3);

/**
 * Match what someone typed to a known place, forgivingly:
 * exact name → "<name> station" → a place whose name starts with the text → text that starts with
 * a place name ("Andheri West (SV Road)" → Andheri station) → most words in common ("BKC").
 * Ties go to the shorter (more general) name. Returns undefined if nothing is close.
 */
export function findPlace(label: string): PlaceOption | undefined {
  const q = norm(label);
  if (!q) return undefined;
  const shortest = (list: PlaceOption[]) => [...list].sort((a, b) => a.label.length - b.label.length)[0];
  const tiers: ((p: PlaceOption) => boolean)[] = [
    (p) => norm(p.label) === q,
    (p) => core(p) === q,
    (p) => core(p).startsWith(`${q} `),
    (p) => q.startsWith(`${core(p)} `),
  ];
  for (const tier of tiers) {
    const hits = PLACE_OPTIONS.filter(tier);
    if (hits.length) return shortest(hits);
  }
  const qw = new Set(words(label));
  let best: PlaceOption | undefined;
  let bestScore = 0;
  for (const p of PLACE_OPTIONS) {
    const score = words(p.label).filter((w) => qw.has(w)).length;
    if (score > bestScore || (score === bestScore && best && score > 0 && p.label.length < best.label.length)) {
      best = p;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : undefined;
}
