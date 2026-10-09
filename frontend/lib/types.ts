// TypeScript mirror of backend/app/schemas.py — field names MUST match SPEC.md §3.

export type Mode = "local" | "metro" | "bus" | "walk" | "auto" | "taxi" | "cab" | "ferry";
export type DisruptionType =
  | "delay" | "closure" | "lift_out" | "diversion" | "crowding"
  | "waterlogging" | "mega_block" | "running_normally" | "not_a_disruption";
export type EventStatus = "confirmed" | "possible" | "ignored" | "expired" | "coordinated";
export type SourceType = "crowd" | "news" | "official" | "weather";
export type PlanLabel = "fastest" | "optimal" | "cheapest";

export interface Affected {
  line_ids: string[];
  stop_ids: string[];
  transfer_ids: string[];
}

export interface Evidence {
  source_type: SourceType;
  ref_id: string;
  reporter_id: string | null;
  weight: number;
  at: string;
  contradicts: boolean;
  /** ref_ids folded into this one (repeat reporter / coordinated burst) */
  covers?: string[];
}

export interface DisruptionEvent {
  event_id: string;
  type: DisruptionType;
  severity: "low" | "medium" | "high";
  affected: Affected;
  first_seen: string;
  last_seen: string;
  confidence: number;
  status: EventStatus;
  expires_at: string;
  evidence: Evidence[];
  flags: string[];
  expected_delay_min: number;
}

export interface Place {
  label: string;
  lat: number;
  lon: number;
  poi_id?: string | null;
}

/** How to show a demo traveller's story (data/travellers.json → "demo"). */
export interface DemoStory {
  kind: "plan" | "track" | "itinerary";
  /** Demo-clock time the story starts at. */
  clock: string;
  /** Which option to start for a "track" story. */
  card: "fastest" | "optimal" | "cheapest" | null;
  /** When the interesting thing happens. */
  moment: string;
  /** What to point at. */
  watch: string;
}

export interface Traveller {
  traveller_id: string;
  name: string;
  story?: string;
  demo_hook?: string;
  demo?: DemoStory;
  origin: Place;
  destination: Place | null;
  leave_at: string | null;
  arrive_by: string | null;
  hard_deadline: boolean;
  max_budget_inr: number | null;
  max_walk_min: number | null;
  max_transfers: number | null;
  priority: "fastest" | "cheapest" | "fewest_transfers" | "most_reliable" | "balanced";
  modes_allowed: Mode[];
  step_free: boolean;
  heavy_luggage: boolean;
  avoid_crowds: boolean;
  language: "en" | "hi" | "mr";
  itinerary?: { day_start: string; day_end: string; stops: { poi_id: string; must_visit: boolean; fixed_time?: string | null; visit_min?: number | null }[] } | null;
}

export interface Leg {
  mode: Mode;
  line_id: string | null;
  from_id: string; // stop id, or "origin" / "destination"
  to_id: string;
  depart: string;
  arrive: string;
  duration_min: number;
  cost_inr: number;
  walk_m: number;
  step_free: boolean;
  event_ids: string[];
  risk: number;
}

export interface RouteCard {
  plan_id: string;
  label: PlanLabel;
  recommended: boolean;
  legs: Leg[];
  duration_min: number;
  cost_inr: number;
  transfers: number;
  walk_min: number;
  reliability: number;
  reliability_colour: "green" | "yellow" | "red";
  score: number;
  reason: string;
  facts: Record<string, unknown>;
}

export interface RejectedOption {
  summary: string;
  /** English, stable wording — RouteResults reads it to suggest fixes. */
  reason: string;
  /** The same reason in the traveller's language, for display. */
  message?: string | null;
}

export interface PlanResponse {
  cards: RouteCard[];
  rejected: RejectedOption[];
  /** Optional extras the UI shows when present */
  as_of?: string;
  destination?: Place;
  notes?: string[];
}

export interface StationInfo {
  name: string;
  mode: "local" | "metro" | "bus" | "ferry";
  lat: number;
  lon: number;
  step_free: boolean;
}

export interface LineInfo {
  name: string;
  mode: "local" | "metro" | "bus" | "ferry";
  color: string;
  stations: string[];
}
