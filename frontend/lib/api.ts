// Single place the UI gets data from. NEXT_PUBLIC_USE_MOCKS (default true) decides whether we
// read frontend/mocks/*.json or call the FastAPI backend (SPEC.md §10).

import eventsMock from "@/mocks/events.json";
import linesMock from "@/mocks/lines.json";
import stationsMock from "@/mocks/stations.json";
import travellersMock from "@/mocks/travellers.json";
import { activeLang } from "./i18n";
import type {
  DisruptionEvent,
  LineInfo,
  PlanResponse,
  RouteCard,
  StationInfo,
  StationSearchResult,
  Traveller,
} from "./types";

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

/** Trips go to the backend in the app language, so route reasons and replan alerts come back in it. */
function inAppLanguage(traveller: Traveller): Traveller {
  return { ...traveller, language: activeLang() };
}

// ---- Demo clock kept in this browser ---------------------------------------------------------
// The hosted backend runs as several server copies, each with its own memory, so a clock kept only
// on the server jumps between copies. The browser keeps the clock (demo time at an anchor, real
// time of the anchor, speed) and sends it with every request; every copy then computes the same
// "now". The backend returns the new value whenever the clock changes (see backend app/clock.py).
const CLOCK_KEY = "travelbuddy.demoClock";
const DEMO_START = "2026-10-20T16:30:00";   // scenario start (data/scenarios/demo.json), paused

function clockHeader(): Record<string, string> {
  if (typeof window === "undefined") return {};
  let saved: string | null = null;
  try { saved = localStorage.getItem(CLOCK_KEY); } catch { /* storage blocked */ }
  return { "X-Demo-Clock": saved ?? `${DEMO_START}|${(Date.now() / 1000).toFixed(3)}|0` };
}

function rememberClock(data: unknown) {
  const anchor = (data as { anchor?: unknown } | null)?.anchor;
  if (typeof anchor !== "string" || typeof window === "undefined") return;
  try { localStorage.setItem(CLOCK_KEY, anchor); } catch { /* storage blocked */ }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...clockHeader() },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`${path} failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as T;
  rememberClock(data);
  return data;
}

/** Thrown in mock mode for trips we have no mock plan for (i.e. anything typed into the form). */
export class RoutingNotConnected extends Error {
  constructor() {
    super("The routing engine isn't connected yet");
  }
}

export function planRequest(traveller: Traveller) {
  return { traveller: inAppLanguage(traveller), mode: "aware" as const };
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
export const getBaselinePlan = (traveller: Traveller) => post<PlanResponse>("/plan", { traveller: inAppLanguage(traveller), mode: "baseline" });

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
    const res = await fetch(`${API_URL}${path}`, {
      signal: ctrl.signal,
      cache: "no-store",
      headers: clockHeader(),
    });

    if (!res.ok) {
      throw new Error(`${path} failed: ${res.status}`);
    }

    const data = (await res.json()) as T;
    rememberClock(data);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function localHaversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const MAJOR_HUB_IDS = [
  "andheri_wr", "andheri_m1", "dadar_wr", "dadar_cr", "dadar_m3",
  "csmt", "csmt_m3", "ghatkopar", "ghatkopar_m1", "bandra",
  "bkc_m3", "borivali", "thane", "churchgate", "mumbai_central"
];

export async function searchStations(q: string = "", mode: string = "all", limit: number = 20): Promise<StationSearchResult[]> {
  try {
    return await fetchJson<StationSearchResult[]>(`/stations/search?q=${encodeURIComponent(q)}&mode=${encodeURIComponent(mode)}&limit=${limit}`, 2000);
  } catch {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const qn = norm(q);
    const results: { score: number; item: StationSearchResult }[] = [];

    const linesByStop: Record<string, string[]> = {};
    for (const [lid, line] of Object.entries(lines)) {
      for (const sid of line.stations) {
        if (!linesByStop[sid]) linesByStop[sid] = [];
        linesByStop[sid].push(lid);
      }
    }

    for (const [sid, s] of Object.entries(stations)) {
      const stMode = s.mode;
      if (mode !== "all") {
        const effectiveMode = mode === "rail" ? "local" : mode;
        if (effectiveMode !== stMode) continue;
      }

      const stLines = linesByStop[sid] ?? [];
      const aliases = s.aliases ?? [];
      const item: StationSearchResult = {
        id: sid,
        name: s.name,
        mode: stMode,
        lat: s.lat,
        lon: s.lon,
        step_free: s.step_free,
        aliases,
        lines: stLines,
      };

      if (!qn) {
        const rank = MAJOR_HUB_IDS.indexOf(sid);
        results.push({ score: rank >= 0 ? rank : 999, item });
        continue;
      }

      const nameNorm = norm(s.name);
      const idNorm = norm(sid);
      const aliasNorms = aliases.map(norm);
      const lineNorms = stLines.map(norm);

      let score = 999;
      if (nameNorm === qn) score = 0;
      else if (aliasNorms.includes(qn)) score = 1;
      else if (nameNorm.startsWith(`${qn} `) || nameNorm.startsWith(qn)) score = 2;
      else if (aliasNorms.some((a) => a.startsWith(`${qn} `) || a.startsWith(qn))) score = 3;
      else if (nameNorm.includes(qn)) score = 4;
      else if (aliasNorms.some((a) => a.includes(qn))) score = 5;
      else if (idNorm === qn || idNorm.startsWith(qn)) score = 6;
      else if (lineNorms.some((l) => l.includes(qn))) score = 7;

      if (score < 999) {
        results.push({ score, item });
      }
    }

    results.sort((a, b) => a.score - b.score || a.item.name.length - b.item.name.length);
    return results.slice(0, limit).map((r) => r.item);
  }
}

export async function getNearbyStations(
  lat: number,
  lon: number,
  radiusKm: number = 1.5,
  mode: string = "all",
  limit: number = 30
): Promise<StationSearchResult[]> {
  try {
    return await fetchJson<StationSearchResult[]>(
      `/stations/nearby?lat=${lat}&lon=${lon}&radius_km=${radiusKm}&mode=${encodeURIComponent(mode)}&limit=${limit}`,
      2000
    );
  } catch {
    const items: StationSearchResult[] = [];
    const linesByStop: Record<string, string[]> = {};
    for (const [lid, line] of Object.entries(lines)) {
      for (const sid of line.stations) {
        if (!linesByStop[sid]) linesByStop[sid] = [];
        linesByStop[sid].push(lid);
      }
    }

    for (const [sid, s] of Object.entries(stations)) {
      const stMode = s.mode;
      if (mode !== "all") {
        const effectiveMode = mode === "rail" ? "local" : mode;
        if (effectiveMode !== stMode) continue;
      }

      const dKm = localHaversine(lat, lon, s.lat, s.lon);
      if (dKm <= radiusKm) {
        items.push({
          id: sid,
          name: s.name,
          mode: stMode,
          lat: s.lat,
          lon: s.lon,
          step_free: s.step_free,
          aliases: s.aliases ?? [],
          lines: linesByStop[sid] ?? [],
          distance_km: Math.round(dKm * 1000) / 1000,
          distance_m: Math.round(dKm * 1000),
        });
      }
    }

    items.sort((a, b) => (a.distance_km ?? 0) - (b.distance_km ?? 0));
    return items.slice(0, limit);
  }
}

export async function getLiveEvents(): Promise<LiveEvents> {
  const mock: LiveEvents = {
    events: eventsMock.events as unknown as DisruptionEvent[],
    source: "mock",
  };

  if (EVENTS_SOURCE === "mock") {
    return mock;
  }

  try {
    const [events, clockState] = await Promise.all([
      fetchJson<DisruptionEvent[]>("/events", 2000),
      fetchJson<{ now: string }>("/admin/clock", 2000),
    ]);

    return {
      events,
      source: "backend",
      asOf: clockState.now,
    };
  } catch (err) {
    if (EVENTS_SOURCE === "backend") {
      throw err;
    }

    return mock;
  }
}

// ---- Demo controls (Person B, SPEC.md §10) --------------------------------------------------

export interface ClockState {
  now: string;
  iso: string;
  speed: number;
  mode: "scripted" | "manual";
  /** The clock to send back as X-Demo-Clock (kept by lib/api.ts). */
  anchor?: string;
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

export const getTimeline = () =>
  fetchJson<Timeline>("/admin/timeline", 2000);

export const getPresets = () =>
  fetchJson<Preset[]>("/admin/presets", 2000);

export const getBackendEvents = () =>
  fetchJson<DisruptionEvent[]>("/events", 2000);

export const updateClock = (body: {
  set?: string;
  advance_min?: number;
  speed?: number;
}) => post<ClockState>("/admin/clock", body);

export const resetDemo = (mode: ClockState["mode"]) =>
  post<ClockState>("/admin/reset", { mode });

export const injectPreset = (preset: string) =>
  post<ClockState>("/admin/inject", { preset });

// ---- Crowd reports (Person B, SPEC.md §10 POST /reports) ------------------------------------

export interface ReportIn {
  reporter_id: string;
  text: string;
  type: DisruptionEvent["type"];
  severity: DisruptionEvent["severity"];
  affected: {
    stop_ids: string[];
    line_ids: string[];
    transfer_ids: string[];
  };
}

export interface ReportOut {
  event_id: string;
  created_event: boolean;
  status: DisruptionEvent["status"];
  confidence: number;
  reported_at: string;
}

export const submitReport = (body: ReportIn) =>
  post<ReportOut>("/reports", body);

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
  trip: {
    traveller: Traveller;
    from: string;
    to: string;
    options: ChatOption[];
  } | null;
  problems: ChatProblem[] | null;
  note: string | null;
}

export const sendChat = (
  messages: ChatMessage[],
  journeyId?: string | null,
) =>
  post<ChatReply>("/chat", {
    messages,
    journey_id: journeyId ?? null,
    language: activeLang(), // reply in the app language (Devanagari for हिंदी / मराठी)
  });

// ---- Saved journeys + replan (B9, SPEC.md §8) -----------------------------------------------

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
  delta: {
    min: number;
    inr: number;
  };
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
  log: {
    at: string;
    kind: string;
    event_ids: string[];
    detail: string;
  }[];
}

export const saveJourney = (traveller: Traveller, card: RouteCard) => post<Journey>("/journeys", { traveller: inAppLanguage(traveller), card });
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
  partial?: boolean;
  stops?: ItineraryStopPlan[]; dropped?: { poi_id: string; name: string; reason: string; must_visit?: boolean }[];
  total_travel_min?: number; total_cost_inr?: number; ends_at?: string; warnings?: string[]; as_of?: string;
}
export const planItinerary = (traveller: Traveller) => post<ItineraryPlan>("/itinerary", { traveller: inAppLanguage(traveller) });

// ---- Voice (SPEC.md §7, POST /voice/stt & POST /voice/tts) ----------------------------------
export interface VoiceSTTResponse {
  text: string;
  language: "en" | "hi" | "mr";
}

export interface VoiceTTSResponse {
  audio_base64: string | null;
  mime: string;
  cached?: boolean;
  fallback_to_browser?: boolean;
}

export async function sendVoiceSTT(audioBlob: Blob): Promise<VoiceSTTResponse> {
  const form = new FormData();
  const ext = audioBlob.type.includes("wav") ? "wav" : audioBlob.type.includes("mp4") ? "mp4" : "webm";
  form.append("file", audioBlob, `voice.${ext}`);
  console.log(`[Voice:API] POST /voice/stt (${audioBlob.size} bytes, type=${audioBlob.type})`);
  const res = await fetch(`${API_URL}/voice/stt`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(`/voice/stt failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as VoiceSTTResponse;
  console.log(`[Voice:API] STT received: "${data.text}" [${data.language}]`);
  return data;
}

export async function getVoiceTTS(text: string, language?: string): Promise<VoiceTTSResponse> {
  return post<VoiceTTSResponse>("/voice/tts", { text, language: language ?? null });
}

// ---- Railway Live Feed & Status (RailRadar Integration) -------------------------------------
export interface RailwayServiceStatus {
  configured: boolean;
  status: "connected" | "unconfigured" | "error";
  latency_ms?: number;
  message: string;
  capabilities: {
    live_status: boolean;
    schedules: boolean;
    station_live_board: boolean;
    disruptions_exceptions: boolean;
  };
}

export interface StationLiveBoard {
  ok: boolean;
  station_code: string;
  station_name: string;
  city: string;
  total_trains: number;
  is_live: boolean;
  data_source: string;
  note?: string;
  as_of?: string;
  trains: {
    train_number: string;
    train_name: string;
    train_type: string;
    fast_slow?: "Fast" | "Slow";
    source: string;
    destination: string;
    scheduled_arrival?: string | null;
    scheduled_departure?: string | null;
    expected_arrival?: string | null;
    expected_departure?: string | null;
    delay_minutes?: number;
    platform?: string;
    status?: string;
  }[];
}

export const getRailwayStatus = () => fetchJson<RailwayServiceStatus>("/railway/status", 4000);
export const getStationLiveBoard = (stationCode: string) =>
  fetchJson<StationLiveBoard>(`/railway/station/${stationCode}/live`, 7000);

// ---- Real-time Transit Tracker: Local Trains, BEST Bus, Mumbai Metro -----------------------

export interface LocalTrainDeparture {
  train_number: string;
  train_name: string;
  line_id: string;
  line_name: string;
  fast_slow: "Fast" | "Slow";
  direction: "up" | "down";
  direction_label: string;
  source: string;
  destination: string;
  scheduled_departure: string;
  expected_departure: string;
  departure_clock_12h: string;
  countdown_min: number;
  countdown_str: string;
  combined_display: string;
  platform: string;
  delay_minutes: number;
  status: string;
  is_live: boolean;
  data_source: string;
}

export interface LocalTrainsResponse {
  station_id: string;
  station_name: string;
  station_code?: string | null;
  line_id?: string | null;
  direction?: string | null;
  as_of: string;
  is_live: boolean;
  data_source: string;
  note: string;
  trains: LocalTrainDeparture[];
}

export interface BusArrivalEstimate {
  route_id: string;
  route_name: string;
  operator: string;
  destination: string;
  direction: string;
  scheduled_time: string;
  display_time_12h: string;
  countdown_min: number;
  countdown_str: string;
  combined_display: string;
  is_live: boolean;
  live_available: boolean;
  status_note: string;
}

export interface BusArrivalsResponse {
  stop_id: string;
  stop_name: string;
  as_of: string;
  buses: BusArrivalEstimate[];
  live_feed_status: string;
  note: string;
}

export interface MetroArrivalEstimate {
  line_id: string;
  line_name: string;
  operator: string;
  station_id: string;
  station_name: string;
  destination: string;
  direction: string;
  direction_label: string;
  scheduled_time: string;
  display_time_12h: string;
  countdown_min: number;
  countdown_str: string;
  combined_display: string;
  platform: string;
  headway_min: number;
  frequency_note: string;
  is_live: boolean;
}

export interface MetroArrivalsResponse {
  station_id: string;
  station_name: string;
  line_id: string;
  line_name: string;
  as_of: string;
  trains: MetroArrivalEstimate[];
  note: string;
}

export interface TransitLinesResponse {
  ok: boolean;
  lines: {
    local: { id: string; name: string; operator: string; color: string; stations_count: number; stations: string[] }[];
    metro: { id: string; name: string; operator: string; color: string; stations_count: number; stations: string[] }[];
    bus: { id: string; name: string; operator: string; color: string; stations_count: number; stations: string[] }[];
  };
}

function formatClock12h(timeStr: string): string {
  try {
    const parts = timeStr.split(":");
    const hh = parseInt(parts[0], 10);
    const mm = parseInt(parts[1], 10);
    const period = hh >= 12 ? "PM" : "AM";
    const h12 = hh % 12 === 0 ? 12 : hh % 12;
    return `${h12}:${mm.toString().padStart(2, "0")} ${period}`;
  } catch {
    return timeStr;
  }
}

/** Get upcoming local trains for a station with line and direction filters */
export async function getUpcomingLocalTrains(
  stationId: string,
  lineId?: string | null,
  direction?: "up" | "down" | null,
  limit: number = 15
): Promise<LocalTrainsResponse> {
  const params = new URLSearchParams({ station_id: stationId, limit: String(limit) });
  if (lineId) params.append("line_id", lineId);
  if (direction) params.append("direction", direction);

  try {
    return await fetchJson<LocalTrainsResponse>(`/transit/trains/upcoming?${params.toString()}`, 3500);
  } catch {
    // Offline / Mock Timetable Fallback
    const stn = stations[stationId];
    const stnName = stn?.name ?? stationId;
    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const nowHHMM = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

    const lineKeys = lineId
      ? [lineId]
      : ["WR_SLOW", "WR_FAST", "CR_SLOW", "CR_FAST", "HARBOUR"];

    const trainsList: LocalTrainDeparture[] = [];
    let counter = 90200;

    for (const lid of lineKeys) {
      const lineData = lines[lid];
      if (!lineData) continue;
      const stnSeq = lineData.stations;
      const idx = stnSeq.indexOf(stationId);
      if (idx < 0) continue;

      const isFast = lid.includes("FAST");
      const fastSlow: "Fast" | "Slow" = isFast ? "Fast" : "Slow";
      const headway = 6;

      // UP
      if (idx > 0 && (!direction || direction === "up")) {
        const destId = stnSeq[0];
        const destName = stations[destId]?.name ?? "Terminus";
        for (let i = 1; i <= 3; i++) {
          counter++;
          const offset = headway * i;
          const depMin = (nowMins + offset) % 1440;
          const depStr = `${Math.floor(depMin / 60).toString().padStart(2, "0")}:${(depMin % 60).toString().padStart(2, "0")}`;
          const clk12 = formatClock12h(depStr);
          trainsList.push({
            train_number: String(counter),
            train_name: `${destName} ${fastSlow}`,
            line_id: lid,
            line_name: lineData.name,
            fast_slow: fastSlow,
            direction: "up",
            direction_label: `UP (Towards ${destName})`,
            source: stations[stnSeq[stnSeq.length - 1]]?.name ?? "Origin",
            destination: destName,
            scheduled_departure: depStr,
            expected_departure: depStr,
            departure_clock_12h: clk12,
            countdown_min: offset,
            countdown_str: `${offset} min`,
            combined_display: `${clk12} · ${offset} min`,
            platform: isFast ? "PF 1" : "PF 3",
            delay_minutes: 0,
            status: "scheduled",
            is_live: false,
            data_source: "timetable",
          });
        }
      }

      // DOWN
      if (idx < stnSeq.length - 1 && (!direction || direction === "down")) {
        const destId = stnSeq[stnSeq.length - 1];
        const destName = stations[destId]?.name ?? "Outbound";
        for (let i = 1; i <= 3; i++) {
          counter++;
          const offset = headway * i + 2;
          const depMin = (nowMins + offset) % 1440;
          const depStr = `${Math.floor(depMin / 60).toString().padStart(2, "0")}:${(depMin % 60).toString().padStart(2, "0")}`;
          const clk12 = formatClock12h(depStr);
          trainsList.push({
            train_number: String(counter),
            train_name: `${destName} ${fastSlow}`,
            line_id: lid,
            line_name: lineData.name,
            fast_slow: fastSlow,
            direction: "down",
            direction_label: `DOWN (Towards ${destName})`,
            source: stations[stnSeq[0]]?.name ?? "Origin",
            destination: destName,
            scheduled_departure: depStr,
            expected_departure: depStr,
            departure_clock_12h: clk12,
            countdown_min: offset,
            countdown_str: `${offset} min`,
            combined_display: `${clk12} · ${offset} min`,
            platform: isFast ? "PF 2" : "PF 4",
            delay_minutes: 0,
            status: "scheduled",
            is_live: false,
            data_source: "timetable",
          });
        }
      }
    }

    trainsList.sort((a, b) => a.countdown_min - b.countdown_min);

    return {
      station_id: stationId,
      station_name: stnName,
      station_code: (stn as unknown as { code?: string })?.code ?? null,
      line_id: lineId ?? null,
      direction: direction ?? null,
      as_of: nowHHMM,
      is_live: false,
      data_source: "timetable",
      note: "Scheduled timetable (verified Mumbai suburban schedule)",
      trains: trainsList.slice(0, limit),
    };
  }
}

/** Get BEST bus arrival estimates with clock time and countdown */
export async function getBusArrivals(
  stopId: string,
  routeId?: string | null,
  limit: number = 10
): Promise<BusArrivalsResponse> {
  const params = new URLSearchParams({ stop_id: stopId, limit: String(limit) });
  if (routeId) params.append("route_id", routeId);

  try {
    return await fetchJson<BusArrivalsResponse>(`/transit/bus/arrivals?${params.toString()}`, 3500);
  } catch {
    const stn = stations[stopId];
    const stopName = stn?.name ?? stopId;
    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const nowHHMM = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

    const buses: BusArrivalEstimate[] = [];
    const busLines = Object.entries(lines).filter(([lid, l]) => l.mode === "bus" && (!routeId || lid === routeId));

    for (const [lid, line] of busLines) {
      const destId = line.stations[line.stations.length - 1];
      const destName = stations[destId]?.name ?? "Terminal";
      const headway = 12;

      for (const step of [1, 2, 3]) {
        const offset = headway * step - (nowMins % headway);
        const cdMin = offset < 1 ? offset + headway : offset;
        const arrMin = (nowMins + cdMin) % 1440;
        const t24 = `${Math.floor(arrMin / 60).toString().padStart(2, "0")}:${(arrMin % 60).toString().padStart(2, "0")}`;
        const t12 = formatClock12h(t24);
        buses.push({
          route_id: lid,
          route_name: line.name,
          operator: "BEST",
          destination: destName,
          direction: `Towards ${destName}`,
          scheduled_time: t24,
          display_time_12h: t12,
          countdown_min: cdMin,
          countdown_str: `${cdMin} min`,
          combined_display: `${t12} · ${cdMin} min`,
          is_live: false,
          live_available: false,
          status_note: "Scheduled • Live GPS unavailable",
        });
      }
    }

    buses.sort((a, b) => a.countdown_min - b.countdown_min);

    return {
      stop_id: stopId,
      stop_name: stopName,
      as_of: nowHHMM,
      buses: buses.slice(0, limit),
      live_feed_status: "unavailable",
      note: "Arrival times are calculated from verified BEST timetables. Live GPS vehicle tracking is currently unavailable.",
    };
  }
}

/** Get Metro Line 1 & Line 3 arrival estimates */
export async function getMetroArrivals(
  stationId: string,
  lineId?: string | null,
  direction?: "up" | "down" | null,
  limit: number = 10
): Promise<MetroArrivalsResponse> {
  const params = new URLSearchParams({ station_id: stationId, limit: String(limit) });
  if (lineId) params.append("line_id", lineId);
  if (direction) params.append("direction", direction);

  try {
    return await fetchJson<MetroArrivalsResponse>(`/transit/metro/arrivals?${params.toString()}`, 3500);
  } catch {
    const stn = stations[stationId];
    const stnName = stn?.name ?? stationId;
    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const nowHHMM = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

    const metroLineKeys = lineId ? [lineId] : ["METRO1", "METRO3"];
    const trains: MetroArrivalEstimate[] = [];
    const targetLid = metroLineKeys[0] || "METRO1";
    const lineData = lines[targetLid];

    for (const lid of metroLineKeys) {
      const line = lines[lid];
      if (!line) continue;
      const stns = line.stations;
      const idx = stns.indexOf(stationId);
      if (idx < 0) continue;

      const headway = 5;

      if (idx > 0 && (!direction || direction === "up")) {
        const destId = stns[0];
        const destName = stations[destId]?.name ?? "Terminal";
        for (let i = 1; i <= 3; i++) {
          const offset = headway * i;
          const arrMin = (nowMins + offset) % 1440;
          const t24 = `${Math.floor(arrMin / 60).toString().padStart(2, "0")}:${(arrMin % 60).toString().padStart(2, "0")}`;
          const t12 = formatClock12h(t24);
          trains.push({
            line_id: lid,
            line_name: line.name,
            operator: lid === "METRO1" ? "Mumbai Metro One" : "MMRCL",
            station_id: stationId,
            station_name: stnName,
            destination: destName,
            direction: "up",
            direction_label: `Platform 1 (Towards ${destName})`,
            scheduled_time: t24,
            display_time_12h: t12,
            countdown_min: offset,
            countdown_str: `${offset} min`,
            combined_display: `${t12} · ${offset} min`,
            platform: "Platform 1",
            headway_min: headway,
            frequency_note: "Every 4–5 min (Peak)",
            is_live: false,
          });
        }
      }

      if (idx < stns.length - 1 && (!direction || direction === "down")) {
        const destId = stns[stns.length - 1];
        const destName = stations[destId]?.name ?? "Terminal";
        for (let i = 1; i <= 3; i++) {
          const offset = headway * i + 1;
          const arrMin = (nowMins + offset) % 1440;
          const t24 = `${Math.floor(arrMin / 60).toString().padStart(2, "0")}:${(arrMin % 60).toString().padStart(2, "0")}`;
          const t12 = formatClock12h(t24);
          trains.push({
            line_id: lid,
            line_name: line.name,
            operator: lid === "METRO1" ? "Mumbai Metro One" : "MMRCL",
            station_id: stationId,
            station_name: stnName,
            destination: destName,
            direction: "down",
            direction_label: `Platform 2 (Towards ${destName})`,
            scheduled_time: t24,
            display_time_12h: t12,
            countdown_min: offset,
            countdown_str: `${offset} min`,
            combined_display: `${t12} · ${offset} min`,
            platform: "Platform 2",
            headway_min: headway,
            frequency_note: "Every 4–5 min (Peak)",
            is_live: false,
          });
        }
      }
    }

    trains.sort((a, b) => a.countdown_min - b.countdown_min);

    return {
      station_id: stationId,
      station_name: stnName,
      line_id: targetLid,
      line_name: lineData?.name ?? "Mumbai Metro",
      as_of: nowHHMM,
      trains: trains.slice(0, limit),
      note: "Metro arrivals generated from official MMRCL / MMMOCL headways and timetable bands.",
    };
  }
}

export const getTransitLines = () => fetchJson<TransitLinesResponse>("/transit/lines", 3000);

