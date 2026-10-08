// The trip chosen on Route Results, handed to Live Trip Tracking. It is also saved on the backend
// (POST /journeys) so the replan monitor (B9) watches it; `journeyId` links the two. The id is kept
// in localStorage too, so the chatbot can answer "what about my trip?".

import type { Place, RouteCard, Traveller } from "./types";

export interface SavedTrip {
  traveller: Traveller;
  destination: Place | null;
  card: RouteCard;
  resultsHref: string;
  savedAt: string;
  journeyId?: string | null;
}

const KEY = "travelbuddy.trip";

export function saveTrip(trip: SavedTrip): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(trip));
    if (trip.journeyId) localStorage.setItem("travelbuddy.journey", trip.journeyId);
    else localStorage.removeItem("travelbuddy.journey");
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
    localStorage.removeItem("travelbuddy.journey");
  } catch {
    // ignore
  }
}

/** Start tracking a trip: save it on the backend (if reachable) and in this tab. */
export async function startTrip(trip: Omit<SavedTrip, "journeyId">): Promise<SavedTrip> {
  let journeyId: string | null = null;
  try {
    const { saveJourney } = await import("./api");
    journeyId = (await saveJourney(trip.traveller, trip.card)).journey_id;
  } catch {
    // backend offline: tracking still works on this device, just without replan alerts
  }
  const saved = { ...trip, journeyId };
  saveTrip(saved);
  return saved;
}
