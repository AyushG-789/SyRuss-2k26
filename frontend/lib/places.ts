// Places a traveller can pick in the trip form: our POIs plus every rail/metro station.
// Anything outside this list isn't covered by the prototype network yet.

import poisMock from "@/mocks/pois.json";
import { stations } from "./api";
import type { Place } from "./types";

export interface PlaceOption extends Place {
  kind: "place" | "station";
}

const pois = poisMock.pois as unknown as Record<string, { name: string; lat: number; lon: number }>;

export const PLACE_OPTIONS: PlaceOption[] = [
  ...Object.entries(pois).map(([id, p]) => ({ label: p.name, lat: p.lat, lon: p.lon, poi_id: id, kind: "place" as const })),
  ...Object.entries(stations)
    .filter(([, s]) => s.mode !== "bus")
    .map(([, s]) => ({ label: `${s.name} station`, lat: s.lat, lon: s.lon, poi_id: null, kind: "station" as const })),
].sort((a, b) => a.label.localeCompare(b.label));

export function findPlace(label: string): PlaceOption | undefined {
  const key = label.trim().toLowerCase();
  return PLACE_OPTIONS.find((p) => p.label.toLowerCase() === key);
}
