// SAMPLE CONTENT for the Home hub and app shell, copied from the team's design (home_transit_hub).
// The UI is frontend-only for now. When connecting the backend, replace each block with an API
// call — the "backend:" note on each says which one. Shapes are kept simple so swapping is easy.

export type Tone = "ok" | "warn" | "bad" | "neutral";

/** backend: GET /events → latest confirmed event (Pakka Check) */
export const shell = {
  city: "Mumbai MMR",
  activeCity: { name: "Mumbai Transit Region (MMR)", lines: "Metro • Western • Central • BEST", badge: "Unified" },
};

/** backend: GET /health + GET /events counts */
export const hero = {
  badge: "MMR Unified Mobility",
  title: "Welcome back, Commuter!",
  subtitle: "Plan and track trips across Mumbai Metro, Suburban rail, BEST buses and last-mile autos & taxis — around problems other commuters have reported and Pakka Check has verified.",
};

/** Quick trips (sample saved places — accounts aren't in the prototype). Each opens live results. */
export const frequentTrips = [
  { id: "office", title: "Home → Office", place: "Andheri to BKC", icon: "work", iconClass: "bg-primary-fixed text-on-primary-fixed",
    from: "Andheri station", to: "Jio World Centre, BKC" },
  { id: "match", title: "To the match", place: "Thane to Wankhede Stadium", icon: "sports_cricket", iconClass: "bg-secondary-container text-on-secondary-container",
    from: "Thane station", to: "Wankhede Stadium" },
]

export const TONE = {
  ok: { chip: "bg-primary-fixed text-on-primary-fixed", text: "text-primary", dot: "bg-primary", bar: "bg-primary" },
  warn: { chip: "bg-tertiary-fixed text-tertiary", text: "text-tertiary", dot: "bg-tertiary", bar: "bg-tertiary" },
  bad: { chip: "bg-error-container text-on-error-container", text: "text-error", dot: "bg-error", bar: "bg-error" },
  neutral: { chip: "bg-container text-on-surface", text: "text-secondary", dot: "bg-secondary", bar: "bg-secondary" },
} as const;
