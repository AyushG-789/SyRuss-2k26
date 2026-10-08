// Single place the UI gets data from. NEXT_PUBLIC_USE_MOCKS (default true) decides whether we
// read frontend/mocks/*.json or call the FastAPI backend (SPEC.md §10).

import eventsMock from "@/mocks/events.json";
import linesMock from "@/mocks/lines.json";
import stationsMock from "@/mocks/stations.json";
import travellersMock from "@/mocks/travellers.json";
import type { DisruptionEvent, LineInfo, PlanResponse, RouteCard, StationInfo, Traveller } from "./types";

export const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS !== "false";
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// Static network data is always bundled (it is generated from data/ by scripts/export_frontend_data.py).
export const stations = stationsMock.stations as unknown as Record<string, StationInfo>;
export const lines = linesMock.lines as unknown as Record<string, LineInfo>;
export const travellers = travellersMock.travellers as unknown as Traveller[];

export const TRAVELLER_IDS = travellers.map((t) => t.traveller_id);

export function getTraveller(id: string): Traveller | undefined {
  return travellers.find((t) => t.traveller_id === id);
}

const mockPlans: Record<string, () => Promise<{ default: unknown }>> = {
  TR1: () => import("@/mocks/plan_TR1.json"),
  TR2: () => import("@/mocks/plan_TR2.json"),
  TR3: () => import("@/mocks/plan_TR3.json"),
  TR4: () => import("@/mocks/plan_TR4.json"),
  TR5: () => import("@/mocks/plan_TR5.json"),
};

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

/** Thrown in mock mode for trips we have no mock plan for (i.e. anything typed into the form). */
export class RoutingNotConnected extends Error {
  constructor() {
    super("The routing engine isn't connected yet");
  }
}

export function planRequest(traveller: Traveller) {
  return { traveller, mode: "aware" as const };
}

/** Plan with Pakka Check's live events (aware). The 5 demo travellers fall back to their saved
 *  sample plans only if the backend can't be reached. */
export async function getPlan(traveller: Traveller): Promise<PlanResponse & { sample?: boolean }> {
  try {
    return await post<PlanResponse>("/plan", planRequest(traveller));
  } catch (err) {
    const load = mockPlans[traveller.traveller_id];
    if (load) return { ...((await load()).default as PlanResponse), sample: true };
    throw USE_MOCKS ? new RoutingNotConnected() : err;
  }
}

/** What a schedule-only app would show for the same trip (reports ignored) — for comparison. */
export const getBaselinePlan = (traveller: Traveller) => post<PlanResponse>("/plan", { traveller, mode: "baseline" });

export async function getEvents(): Promise<DisruptionEvent[]> {
  return (await getLiveEvents()).events;
}

// ---- Live disruptions (Person B) ------------------------------------------------------------
// Map pins come from Pakka Check's GET /events when the backend is reachable, independently of
// USE_MOCKS (route cards stay on mocks until /plan exists). NEXT_PUBLIC_EVENTS_SOURCE:
//   "auto" (default) = try the backend, fall back to the mock file · "backend" · "mock"
const EVENTS_SOURCE = process.env.NEXT_PUBLIC_EVENTS_SOURCE ?? "auto";

export interface LiveEvents {
  events: DisruptionEvent[];
  source: "backend" | "mock";
  /** Demo-clock time the backend scored the events at (backend source only). */
  asOf?: string;
}

async function fetchJson<T>(path: string, timeoutMs: number): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_URL}${path}`, { signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function getLiveEvents(): Promise<LiveEvents> {
  const mock: LiveEvents = { events: eventsMock.events as unknown as DisruptionEvent[], source: "mock" };
  if (EVENTS_SOURCE === "mock") return mock;
  try {
    const [events, clockState] = await Promise.all([
      fetchJson<DisruptionEvent[]>("/events", 2000),
      fetchJson<{ now: string }>("/admin/clock", 2000),
    ]);
    return { events, source: "backend", asOf: clockState.now };
  } catch (err) {
    if (EVENTS_SOURCE === "backend") throw err;
    return mock;
  }
}

// ---- Demo controls (Person B, SPEC.md §10) --------------------------------------------------
export interface ClockState {
  now: string;
  iso: string;
  speed: number;
  mode: "scripted" | "manual";
}

export interface Preset {
  id: string;
  label: string;
  refs: string[];
  expect: string;
}

export interface TimelineItem {
  t: string;
  kind: "report" | "news" | "official" | "action";
  ref: string | null;
  label: string;
  state: "history" | "done" | "upcoming" | "not_injected" | "other_day";
  traveller_id: string | null;
}

export interface Timeline extends ClockState {
  start: string;
  end: string;
  items: TimelineItem[];
  injected: { ref_id: string; at: string }[];
}

export const getClock = () => fetchJson<ClockState>("/admin/clock", 2000);
export const getTimeline = () => fetchJson<Timeline>("/admin/timeline", 2000);
export const getPresets = () => fetchJson<Preset[]>("/admin/presets", 2000);
export const getBackendEvents = () => fetchJson<DisruptionEvent[]>("/events", 2000);

export const updateClock = (body: { set?: string; advance_min?: number; speed?: number }) =>
  post<ClockState>("/admin/clock", body);
export const resetDemo = (mode: ClockState["mode"]) => post<ClockState>("/admin/reset", { mode });
export const injectPreset = (preset: string) => post<ClockState>("/admin/inject", { preset });

// ---- Crowd reports (Person B, SPEC.md §10 POST /reports) ------------------------------------
export interface ReportIn {
  reporter_id: string;
  text: string;
  type: DisruptionEvent["type"];
  severity: DisruptionEvent["severity"];
  affected: { stop_ids: string[]; line_ids: string[]; transfer_ids: string[] };
}

export interface ReportOut {
  event_id: string;
  created_event: boolean;
  status: DisruptionEvent["status"];
  confidence: number;
  reported_at: string;
}

export const submitReport = (body: ReportIn) => post<ReportOut>("/reports", body);

// ---- Chatbot (SPEC.md §6, POST /chat) --------------------------------------------------------
export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

export interface ChatProblem {
  event_id: string;
  title: string;
  status: DisruptionEvent["status"];
  meaning: string;
  trust_pct: number;
  sources: string;
  on_this_route?: boolean;
}

export interface ChatOption {
  label: "fastest" | "optimal" | "cheapest";
  recommended: boolean;
  route: string;
  depart: string;
  arrive: string;
  duration_min: number;
  cost_inr: number;
  changes: number;
  walk_min: number;
  live_problems: ChatProblem[];
  blocked_by_confirmed_problem: boolean;
}

export interface ChatReply {
  reply: string;
  source: "gemini" | "template" | "fallback";
  model: string | null;
  tools_used: string[];
  trip: { traveller: Traveller; from: string; to: string; options: ChatOption[] } | null;
  problems: ChatProblem[] | null;
  note: string | null;
}

export const sendChat = (messages: ChatMessage[], journeyId?: string | null) =>
  post<ChatReply>("/chat", { messages, journey_id: journeyId ?? null });

// ---- Saved journeys + replan (B9, SPEC.md §8) ------------------------------------------------
export interface LegHit {
  leg_idx: number;
  event_id: string;
  title: string;
  status: DisruptionEvent["status"];
  confidence: number;
  blocked: boolean;
  delay_min: number;
}

export interface ReplanProposal {
  proposal_id: string;
  created_at: string;
  event_ids: string[];
  affected_leg_idx: number[];
  from_label: string;
  old_card: RouteCard;
  new_card: RouteCard;
  delta: { min: number; inr: number };
  old_blocked: boolean;
  message: string;
}

export interface Journey {
  journey_id: string;
  traveller: Traveller;
  card: RouteCard;
  status: "upcoming" | "active" | "completed";
  saved_at: string;
  proposal: ReplanProposal | null;
  notice: string | null;
  handled_event_ids: string[];
  live_hits: LegHit[];
  log: { at: string; kind: string; event_ids: string[]; detail: string }[];
}

export const saveJourney = (traveller: Traveller, card: RouteCard) => post<Journey>("/journeys", { traveller, card });
export const getJourney = (id: string) => fetchJson<Journey>(`/journeys/${id}`, 3000);
export const decideReplan = (id: string, accept: boolean) =>
  post<Journey>(`/journeys/${id}/replan/${accept ? "accept" : "reject"}`, {});

// ---- Disruption detail, transparency, evaluation, day planner --------------------------------
export interface EvidenceRow {
  ref_id: string;
  source_type: "crowd" | "news" | "official" | "weather";
  reporter_id: string | null;
  at: string;
  text: string;
  weight: number;
  contradicts: boolean;
  note: string;
  covers: string[];
}
export interface EventDetail {
  event: DisruptionEvent;
  breakdown: { support: number; decay: number; contradiction: number; summary: string; evidence: EvidenceRow[] };
}
export const getEventDetail = (id: string) => fetchJson<EventDetail>(`/events/${id}`, 4000);

export interface Transparency {
  as_of: string;
  sources: { id: string; name: string; weight: number; how: string; data: string; mode: string }[];
  policy: Record<string, unknown> & {
    source_weight: Record<string, number>;
    thresholds?: Record<string, number>;
  };
  formula: string;
  routing: Record<string, string>;
  assumptions: string[];
  data: Record<string, unknown> & { stations: number; lines: number; pois: number; transfers: number; reporters: number };
  ai: { chatbot: string; model: string; number_check: boolean; fallback: string };
  event_log: { event_id: string; type: string; status: DisruptionEvent["status"]; confidence: number; first_seen: string;
    last_seen: string; expires_at: string; flags: string[]; summary: string }[];
  decisions: { journey_id: string; traveller: string; at: string; kind: string; event_ids: string[]; detail: string }[];
}
export const getTransparency = () => fetchJson<Transparency>("/transparency", 5000);

export interface EvalSide { route: string; cost_inr: number; walk_min: number; late: boolean; planned_arrive: string;
  real_arrive: string; extra_min: number; hit_by: { event: string; effect: string; extra_min: number }[] }
export interface EvalTrip { traveller_id: string; name: string; label: string; from: string; to: string | null;
  leave_at: string; arrive_by: string | null; replans: { at: string; events: string[]; message: string; caused_by_fake_report: boolean }[];
  schedule_only: EvalSide; travelbuddy: EvalSide }
export interface EvalResult {
  travellers: number; trips_compared: number;
  schedule_only: { late_or_failed: number; avg_extra_min: number; total_cost_inr: number; total_walk_min: number };
  travelbuddy: { late_or_failed: number; avg_extra_min: number; total_cost_inr: number; total_walk_min: number;
    replans: number; false_reroutes_from_fake_reports: number };
  extra_cost_inr: number; extra_walk_min: number;
  classification: { checked_at: string; correct: number; total: number; mismatches: unknown[] };
  trips: EvalTrip[]; method: string;
}
export const getEval = () => fetchJson<EvalResult>("/eval", 30000);

export interface ItineraryStopPlan {
  poi_id: string; name: string; must_visit: boolean; fixed_time: string | null; opens: string | null; closes: string | null;
  arrive: string; visit_start: string; leave: string; wait_min: number; visit_min: number; slack_min: number; tight: boolean;
  leg: { route: string; depart: string; arrive: string; duration_min: number; cost_inr: number; reliability: number;
    event_ids: string[]; card: RouteCard };
}
export interface ItineraryPlan {
  feasible: boolean; error?: string; weekday?: string; day_start?: string; day_end?: string;
  stops?: ItineraryStopPlan[]; dropped?: { poi_id: string; name: string; reason: string }[];
  total_travel_min?: number; total_cost_inr?: number; ends_at?: string; warnings?: string[]; as_of?: string;
}
export const planItinerary = (traveller: Traveller) => post<ItineraryPlan>("/itinerary", { traveller });
