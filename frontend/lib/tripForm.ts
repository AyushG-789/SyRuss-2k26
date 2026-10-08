// Trip request form state shared by the Home quick search and the Journey Planner.

import { findPlace, PLACE_OPTIONS } from "./places";
import type { Mode, Traveller } from "./types";

export type TimeMode = "leave" | "arrive";

export interface FormState {
  from: string;
  to: string;
  timeMode: TimeMode;
  /** "HH:MM", or NOW = leave at the demo clock's current time (decided by the backend). */
  time: string;
  hardDeadline: boolean;
  budget: string;
  maxWalk: string;
  maxTransfers: string;
  priority: Traveller["priority"];
  modes: Mode[];
  stepFree: boolean;
  heavyLuggage: boolean;
  avoidCrowds: boolean;
  language: Traveller["language"];
}

export const VEHICLE_MODES: { mode: Mode; label: string; icon: string }[] = [
  { mode: "local", label: "Local", icon: "train" },
  { mode: "metro", label: "Metro", icon: "subway" },
  { mode: "bus", label: "BEST bus", icon: "directions_bus" },
  { mode: "auto", label: "Auto", icon: "electric_rickshaw" },
  { mode: "taxi", label: "Taxi", icon: "local_taxi" },
  { mode: "cab", label: "App cab", icon: "directions_car" },
];

export const PRIORITIES: { value: Traveller["priority"]; label: string; hint: string; icon: string }[] = [
  { value: "balanced", label: "Optimal", hint: "Best balance of time, cost and reliability", icon: "auto_awesome" },
  { value: "fastest", label: "Fastest", hint: "Shortest door-to-door time", icon: "bolt" },
  { value: "cheapest", label: "Cheapest", hint: "Lowest fare", icon: "savings" },
  { value: "fewest_transfers", label: "Fewest changes", hint: "Fewer vehicle switches", icon: "sync_alt" },
  { value: "most_reliable", label: "Most reliable", hint: "Avoid anything reported", icon: "verified" },
];

export const NOW = "now";

export const EMPTY_FORM: FormState = {
  from: "",
  to: "",
  timeMode: "leave",
  time: "17:00",
  hardDeadline: false,
  budget: "",
  maxWalk: "15",
  maxTransfers: "2",
  priority: "balanced",
  modes: ["local", "metro", "bus", "taxi"],
  stepFree: false,
  heavyLuggage: false,
  avoidCrowds: false,
  language: "en",
};

/** Label the place pickers understand for a free-form place (snaps to the nearest known one). */
export function pickerLabel(p: { label: string; lat: number; lon: number } | null): string {
  if (!p) return "";
  const exact = findPlace(p.label);
  if (exact) return exact.label;
  const nearest = PLACE_OPTIONS.reduce((best, o) =>
    Math.hypot(o.lat - p.lat, o.lon - p.lon) < Math.hypot(best.lat - p.lat, best.lon - p.lon) ? o : best,
  );
  return nearest.label;
}

export function formFromTraveller(t: Traveller): FormState {
  const arrive = Boolean(t.arrive_by && t.hard_deadline);
  return {
    from: pickerLabel(t.origin),
    to: pickerLabel(t.destination),
    timeMode: arrive ? "arrive" : "leave",
    time: (arrive ? t.arrive_by : t.leave_at) ?? "17:00",
    hardDeadline: t.hard_deadline,
    budget: t.max_budget_inr ? String(t.max_budget_inr) : "",
    maxWalk: t.max_walk_min ? String(t.max_walk_min) : "",
    maxTransfers: t.max_transfers != null ? String(t.max_transfers) : "",
    priority: t.priority,
    modes: t.modes_allowed.filter((m) => m !== "walk"),
    stepFree: t.step_free,
    heavyLuggage: t.heavy_luggage,
    avoidCrowds: t.avoid_crowds,
    language: t.language,
  };
}

export function validateForm(f: FormState): string[] {
  const errors: string[] = [];
  const from = findPlace(f.from);
  const to = findPlace(f.to);
  if (!from) errors.push("Pick a starting point from the list.");
  if (!to) errors.push("Pick a destination from the list.");
  if (from && to && from.label === to.label) errors.push("Start and destination must be different.");
  if (f.time !== NOW && !/^\d{2}:\d{2}$/.test(f.time)) errors.push("Enter a time.");
  if (f.modes.length === 0) errors.push("Choose at least one way to travel besides walking.");
  for (const [value, name] of [[f.budget, "Budget"], [f.maxWalk, "Walking limit"], [f.maxTransfers, "Changes"]] as const) {
    if (value !== "" && !(Number(value) >= 0)) errors.push(`${name} must be a positive number.`);
  }
  return errors;
}

export function travellerFromForm(f: FormState): Traveller {
  const from = findPlace(f.from)!;
  const to = findPlace(f.to)!;
  const num = (v: string) => (v === "" ? null : Number(v));
  return {
    traveller_id: "CUSTOM",
    name: "Your trip",
    origin: { label: from.label, lat: from.lat, lon: from.lon, poi_id: from.poi_id },
    destination: { label: to.label, lat: to.lat, lon: to.lon, poi_id: to.poi_id },
    // leave_at null = "leave now": the backend plans from the demo clock's current time.
    leave_at: f.timeMode === "leave" && f.time !== NOW ? f.time : null,
    arrive_by: f.timeMode === "arrive" && f.time !== NOW ? f.time : null,
    hard_deadline: f.timeMode === "arrive" && f.hardDeadline,
    max_budget_inr: num(f.budget),
    max_walk_min: num(f.maxWalk),
    max_transfers: num(f.maxTransfers),
    priority: f.priority,
    modes_allowed: ["walk", ...f.modes],
    step_free: f.stepFree,
    heavy_luggage: f.heavyLuggage,
    avoid_crowds: f.avoidCrowds,
    language: f.language,
    itinerary: null,
  };
}
