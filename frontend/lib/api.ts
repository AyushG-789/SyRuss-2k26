// Single place the UI gets data from. NEXT_PUBLIC_USE_MOCKS (default true) decides whether we
// read frontend/mocks/*.json or call the FastAPI backend (SPEC.md §10).

import eventsMock from "@/mocks/events.json";
import linesMock from "@/mocks/lines.json";
import stationsMock from "@/mocks/stations.json";
import travellersMock from "@/mocks/travellers.json";
import type { DisruptionEvent, LineInfo, PlanResponse, StationInfo, Traveller } from "./types";

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

export async function getPlan(traveller: Traveller): Promise<PlanResponse> {
  if (USE_MOCKS && mockPlans[traveller.traveller_id]) {
    const load = mockPlans[traveller.traveller_id];
    return (await load()).default as PlanResponse;
  }
  return post<PlanResponse>("/plan", planRequest(traveller));
}

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
