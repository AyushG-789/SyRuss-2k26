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
  if (USE_MOCKS) {
    const load = mockPlans[traveller.traveller_id];
    if (!load) throw new RoutingNotConnected();
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
