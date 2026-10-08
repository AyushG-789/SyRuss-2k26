// Network-level views of Pakka Check events: per transport mode and per line (Home Hub).

import { lines } from "./api";
import { lineShortName, pct, TYPE_LABEL } from "./format";
import type { DisruptionEvent, EventStatus } from "./types";

const ACTIVE: EventStatus[] = ["confirmed", "possible"];
const ROAD_TYPES = new Set(["waterlogging", "diversion", "crowding"]);

/** Events that matter for a route right now (confirmed or possible). */
export function activeEvents(events: DisruptionEvent[] | undefined): DisruptionEvent[] {
  return (events ?? []).filter((e) => ACTIVE.includes(e.status));
}

/** Lines an event touches: its own line_ids, plus every line serving one of its stops. */
export function eventLines(ev: DisruptionEvent): Set<string> {
  const out = new Set(ev.affected.line_ids);
  for (const [lid, line] of Object.entries(lines)) {
    if (ev.affected.stop_ids.some((s) => line.stations.includes(s))) out.add(lid);
  }
  return out;
}

function worst(events: DisruptionEvent[]): DisruptionEvent | undefined {
  return [...events].sort(
    (a, b) => ACTIVE.indexOf(a.status) - ACTIVE.indexOf(b.status) || b.confidence - a.confidence,
  )[0];
}

export interface Status {
  tone: "ok" | "warn" | "bad";
  label: string;
  event?: DisruptionEvent;
}

function statusFrom(evs: DisruptionEvent[]): Status {
  const top = worst(evs.filter((e) => ACTIVE.includes(e.status)));
  if (!top) return { tone: "ok", label: "No verified reports" };
  const type = TYPE_LABEL[top.type] ?? top.type;
  return top.status === "confirmed"
    ? { tone: "bad", label: `${type} confirmed (${pct(top.confidence)})`, event: top }
    : { tone: "warn", label: `Possible ${type.toLowerCase()} (${pct(top.confidence)})`, event: top };
}

export interface ModeStatus extends Status {
  id: string;
  name: string;
  icon: string;
  detail: string;
}

export function modeStatuses(events: DisruptionEvent[]): ModeStatus[] {
  const onLines = (pred: (lid: string) => boolean) =>
    events.filter((e) => [...eventLines(e)].some(pred));
  const road = events.filter((e) => ROAD_TYPES.has(e.type));
  return [
    { id: "metro", name: "Metro", icon: "subway", detail: "Lines 1, 3", ...statusFrom(onLines((l) => l.startsWith("METRO"))) },
    { id: "local", name: "Local train", icon: "train", detail: "WR · CR · Harbour",
      ...statusFrom(onLines((l) => /^(WR|CR|HARBOUR)/.test(l))) },
    { id: "bus", name: "BEST bus", icon: "directions_bus", detail: "City routes", ...statusFrom(onLines((l) => l.startsWith("BEST"))) },
    { id: "road", name: "Auto / taxi", icon: "local_taxi", detail: "Road last-mile", ...statusFrom(road) },
    { id: "walk", name: "Walk", icon: "directions_walk", detail: "Bridges · FOBs", ...statusFrom(
      events.filter((e) => e.affected.transfer_ids.length > 0 || e.type === "waterlogging")) },
  ];
}

export interface LineStatus extends Status {
  line_id: string;
  code: string;
  name: string;
  color: string;
  reports: number;
}

/** Rail + metro lines (BEST grouped) with their worst active event. */
export function lineStatuses(events: DisruptionEvent[]): LineStatus[] {
  const rows: LineStatus[] = [];
  for (const [lid, line] of Object.entries(lines)) {
    if (line.mode === "bus") continue;
    const evs = events.filter((e) => eventLines(e).has(lid));
    rows.push({
      line_id: lid, code: lineShortName(lid), name: line.name, color: line.color,
      reports: evs.length, ...statusFrom(evs),
    });
  }
  const bestEvents = events.filter((e) => [...eventLines(e)].some((l) => l.startsWith("BEST")));
  rows.push({ line_id: "BEST", code: "BEST", name: "BEST buses (all routes)", color: "#C62828",
    reports: bestEvents.length, ...statusFrom(bestEvents) });
  const rank = { bad: 0, warn: 1, ok: 2 };
  return rows.sort((a, b) => rank[a.tone] - rank[b.tone]);
}

export const TONE_CLASS = {
  ok: "bg-primary-soft text-primary-ink",
  warn: "bg-amber-soft text-amber-ink",
  bad: "bg-error-container text-on-error-container",
} as const;
