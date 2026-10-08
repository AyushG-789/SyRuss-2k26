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

export async function getPlan(traveller: Traveller): Promise<PlanResponse> {
  if (USE_MOCKS) {
    const load = mockPlans[traveller.traveller_id];
    if (!load) throw new Error(`No mock plan for ${traveller.traveller_id}`);
    return (await load()).default as PlanResponse;
  }
  return post<PlanResponse>("/plan", { traveller, mode: "aware" });
}

export async function getEvents(): Promise<DisruptionEvent[]> {
  if (USE_MOCKS) return eventsMock.events as unknown as DisruptionEvent[];
  const res = await fetch(`${API_URL}/events`);
  if (!res.ok) throw new Error(`/events failed: ${res.status}`);
  return res.json() as Promise<DisruptionEvent[]>;
}
