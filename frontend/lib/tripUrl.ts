import type { Traveller } from "./types";

// A custom trip travels in the URL (/routes?t=<json>) so the page can be reloaded or shared.
// It only holds places and preferences — no personal data.

export function tripHref(traveller: Traveller): string {
  return `/routes?t=${encodeURIComponent(JSON.stringify(traveller))}`;
}

export function parseTrip(raw: string | null): Traveller | null {
  if (!raw) return null;
  try {
    const t = JSON.parse(raw) as Traveller;
    if (!t?.origin?.label || typeof t.origin.lat !== "number" || !Array.isArray(t.modes_allowed)) return null;
    return t;
  } catch {
    return null;
  }
}
