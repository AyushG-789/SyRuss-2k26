// Network-level views of Pakka Check events: per transport mode and per line (Home Hub).

import { lines } from "./api";
import { lineShortName, pct, TYPE_LABEL } from "./format";
import { translate } from "./i18n";
import { M } from "./i18n/messages/network";
import type { DisruptionEvent, EventStatus } from "./types";

const ACTIVE: EventStatus[] = ["confirmed", "possible"];
const ROAD_TYPES = new Set(["waterlogging", "diversion", "crowding"]);

/** Events that matter for a route right now (confirmed or possible). */
export function activeEvents(events: DisruptionEvent[] | undefined): DisruptionEvent[] {
  return (events ?? []).filter((e) => ACTIVE.includes(e.status));
}

/**
 * Lines an event touches: its own line_ids; or, for a station-wide problem with no line named
 * (e.g. waterlogging at CSMT), every line serving that station. A closed transfer/foot-overbridge
 * touches NO line — trains still run, only the walk between platforms is affected
 * (same rule as backend/app/replan/impact.py).
 */
export function eventLines(ev: DisruptionEvent): Set<string> {
  const out = new Set(ev.affected.line_ids);
  if (ev.affected.transfer_ids.length > 0 || out.size > 0) return out;
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
  if (!top) return { tone: "ok", label: translate(M, "noReports") };
  const type = TYPE_LABEL[top.type] ?? top.type;
  return top.status === "confirmed"
    ? { tone: "bad", label: translate(M, "confirmed", { type, pct: pct(top.confidence) }), event: top }
    : { tone: "warn", label: translate(M, "possible", { type: type.toLowerCase(), pct: pct(top.confidence) }), event: top };
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
    { id: "metro", name: translate(M, "mode.metro"), icon: "subway", detail: translate(M, "detail.metro"), ...statusFrom(onLines((l) => l.startsWith("METRO"))) },
    { id: "local", name: translate(M, "mode.local"), icon: "train", detail: translate(M, "detail.local"),
      ...statusFrom(onLines((l) => /^(WR|CR|HARBOUR)/.test(l))) },
    { id: "bus", name: translate(M, "mode.bus"), icon: "directions_bus", detail: translate(M, "detail.bus"), ...statusFrom(onLines((l) => l.startsWith("BEST"))) },
    { id: "road", name: translate(M, "mode.road"), icon: "local_taxi", detail: translate(M, "detail.road"), ...statusFrom(road) },
    { id: "walk", name: translate(M, "mode.walk"), icon: "directions_walk", detail: translate(M, "detail.walk"), ...statusFrom(
      events.filter((e) => e.affected.transfer_ids.length > 0 || e.type === "waterlogging")) },
  ];
}

type Key = keyof typeof M.en;
/** A line's display name in the active language (falls back to lines.json). */
function lineName(lid: string, fallback: string): string {
  const key = `line.${lid}`;
  return key in M.en ? translate(M, key as Key) : fallback;
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
      line_id: lid, code: lineShortName(lid), name: lineName(lid, line.name), color: line.color,
      reports: evs.length, ...statusFrom(evs),
    });
  }
  const bestEvents = events.filter((e) => [...eventLines(e)].some((l) => l.startsWith("BEST")));
  rows.push({ line_id: "BEST", code: "BEST", name: translate(M, "bestAll"), color: "#C62828",
    reports: bestEvents.length, ...statusFrom(bestEvents) });
  const rank = { bad: 0, warn: 1, ok: 2 };
  return rows.sort((a, b) => rank[a.tone] - rank[b.tone]);
}

export const TONE_CLASS = {
  ok: "bg-primary-soft text-primary-ink",
  warn: "bg-amber-soft text-amber-ink",
  bad: "bg-error-container text-on-error-container",
} as const;
