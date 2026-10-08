// The trip chosen on Route Results, handed to Live Trip Tracking (browser-only, per tab).
// Becomes POST /journeys when the replan monitor (B9) exists.

import type { Place, RouteCard, Traveller } from "./types";

export interface SavedTrip {
  traveller: Traveller;
  destination: Place | null;
  card: RouteCard;
  resultsHref: string;
  savedAt: string;
}

const KEY = "travelbuddy.trip";

export function saveTrip(trip: SavedTrip): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(trip));
  } catch {
    // storage blocked (private mode) — tracking falls back to the demo trip
  }
}

export function loadTrip(): SavedTrip | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SavedTrip) : null;
  } catch {
    return null;
  }
}

export function clearTrip(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
