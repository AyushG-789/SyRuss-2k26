import { lines, stations } from "./api";
import type { DisruptionEvent, EventStatus, Leg, Mode, PlanLabel, Traveller } from "./types";

export const PLAN_LABEL: Record<PlanLabel, string> = {
  fastest: "Fastest",
  optimal: "Optimal",
  cheapest: "Cheapest",
};

export const MODE_LABEL: Record<Mode, string> = {
  local: "Local",
  metro: "Metro",
  bus: "Bus",
  walk: "Walk",
  auto: "Auto",
  taxi: "Taxi",
  cab: "Cab",
  ferry: "Ferry",
};

/** Short line names for leg chips, e.g. "CR Fast", "Metro 3", "BEST". */
export function lineShortName(lineId: string): string {
  const known: Record<string, string> = {
    WR_SLOW: "WR Slow", WR_FAST: "WR Fast", CR_SLOW: "CR Slow", CR_FAST: "CR Fast",
    HARBOUR: "Harbour", METRO1: "Metro 1", METRO3: "Metro 3",
  };
  if (known[lineId]) return known[lineId];
  if (lineId.startsWith("BEST")) return "BEST bus";
  return lines[lineId]?.name ?? lineId;
}

export function legColor(leg: Leg): string {
  if (leg.line_id && lines[leg.line_id]) return lines[leg.line_id].color;
  return leg.mode === "walk" ? "#8a94a6" : "#334155"; // walk grey, taxi/cab/auto slate
}

export function placeName(id: string, traveller: Traveller, destinationLabel?: string): string {
  if (id === "origin") return traveller.origin.label;
  if (id === "destination") return destinationLabel ?? traveller.destination?.label ?? "Destination";
  return stations[id]?.name ?? id;
}

export function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

export const STATUS_STYLE: Record<EventStatus, { label: string; color: string }> = {
  confirmed: { label: "Confirmed", color: "var(--bad)" },
  possible: { label: "Possible", color: "var(--warn)" },
  coordinated: { label: "Suspicious burst", color: "var(--grey)" },
  ignored: { label: "Ignored", color: "var(--grey)" },
  expired: { label: "Expired", color: "var(--grey)" },
};

export const TYPE_LABEL: Record<string, string> = {
  delay: "Delay", closure: "Closure", lift_out: "Lift out of service", diversion: "Diversion",
  crowding: "Crowding", waterlogging: "Waterlogging", mega_block: "Mega block",
};

/** Where to draw an event on the map: centre of its stops, else the middle of its first line. */
export function eventPosition(ev: DisruptionEvent): [number, number] | null {
  const ids = ev.affected.stop_ids.filter((id) => stations[id]);
  if (ids.length === 0 && ev.affected.line_ids[0]) {
    const sts = lines[ev.affected.line_ids[0]]?.stations ?? [];
    if (sts.length) ids.push(sts[Math.floor(sts.length / 2)]);
  }
  if (ids.length === 0) return null;
  const lat = ids.reduce((s, id) => s + stations[id].lat, 0) / ids.length;
  const lon = ids.reduce((s, id) => s + stations[id].lon, 0) / ids.length;
  return [lat, lon];
}

export function evidenceSummary(ev: DisruptionEvent): string {
  const counts: Record<string, number> = {};
  for (const e of ev.evidence) {
    if (e.contradicts) continue;
    counts[e.source_type] = (counts[e.source_type] ?? 0) + 1;
  }
  const parts = [];
  if (counts.crowd) parts.push(`${counts.crowd} commuter${counts.crowd > 1 ? "s" : ""}`);
  if (counts.news) parts.push(`${counts.news} news`);
  if (counts.official) parts.push("official notice");
  if (counts.weather) parts.push("weather alert");
  const contradicted = ev.evidence.some((e) => e.contradicts);
  return parts.join(" + ") + (contradicted ? " · contradicted by official source" : "");
}
