// Labels here read in the app language (lib/i18n.ts): the tables are per-language lookups and the
// helpers translate with the active language, so callers don't change.
import { lines, stations } from "./api";
import { type Lang, perLang, translate } from "./i18n";
import { COMMON } from "./i18n/common";
import type { DisruptionEvent, EventStatus, Leg, Mode, PlanLabel, Traveller } from "./types";

type CommonKey = keyof typeof COMMON.en;
const c = (key: CommonKey, vars?: Record<string, string | number>) => translate(COMMON, key, vars);
const table = <K extends string>(keys: readonly K[], prefix: string) =>
  perLang(Object.fromEntries((["en", "hi", "mr"] as Lang[]).map((l) => [
    l, Object.fromEntries(keys.map((k) => [k, COMMON[l][`${prefix}.${k}` as CommonKey]])),
  ])) as Record<Lang, Record<K, string>>);

export const PLAN_LABEL: Record<PlanLabel, string> = table(["fastest", "optimal", "cheapest"] as const, "plan");

export const MODE_LABEL: Record<Mode, string> =
  table(["local", "metro", "bus", "walk", "auto", "taxi", "cab", "ferry"] as const, "mode");

/** Short line names for leg chips, e.g. "CR Fast", "Metro 3", "BEST". */
/** "Via WR_SLOW -> METRO3" → "Via WR Slow → Metro 3" (route summaries from the planner). */
export function readableRoute(summary: string): string {
  return summary
    .split(" -> ")
    .map((part, i) => {
      const via = i === 0 && part.startsWith("Via ") ? `${c("via")} ` : "";
      const id = via ? part.slice(4) : part;
      return via + (/^[A-Z0-9_]+$/.test(id) ? lineShortName(id) : id);
    })
    .join(" → ");
}

export function lineShortName(lineId: string): string {
  const known: Record<string, string> = {
    WR_SLOW: `WR ${c("line.slow")}`, WR_FAST: `WR ${c("line.fast")}`, CR_SLOW: `CR ${c("line.slow")}`, CR_FAST: `CR ${c("line.fast")}`,
    HARBOUR: c("line.harbour"), METRO1: "Metro 1", METRO3: "Metro 3",
  };
  if (known[lineId]) return known[lineId];
  if (lineId.startsWith("BEST")) return c("line.best");
  return lines[lineId]?.name ?? lineId;
}

export function legColor(leg: Leg): string {
  if (leg.line_id && lines[leg.line_id]) return lines[leg.line_id].color;
  return leg.mode === "walk" ? "#8a94a6" : "#64748b"; // walk grey, taxi/cab/auto slate (mid-tone: visible on light and night maps)
}

export function placeName(id: string, traveller: Traveller, destinationLabel?: string): string {
  if (id === "origin") return traveller.origin.label;
  if (id === "destination") return destinationLabel ?? traveller.destination?.label ?? c("place.destination");
  return stations[id]?.name ?? id;
}

export function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

const STATUS_COLOR: Record<EventStatus, string> = {
  confirmed: "var(--bad)", possible: "var(--warn)", coordinated: "var(--grey)", ignored: "var(--grey)", expired: "var(--grey)",
};
export const STATUS_STYLE: Record<EventStatus, { label: string; color: string }> = new Proxy(
  {} as Record<EventStatus, { label: string; color: string }>,
  {
    get: (_, k) => (typeof k === "string" && k in STATUS_COLOR
      ? { label: c(`status.${k}` as CommonKey), color: STATUS_COLOR[k as EventStatus] }
      : undefined),
    has: (_, k) => k in STATUS_COLOR,
    ownKeys: () => Object.keys(STATUS_COLOR),
    getOwnPropertyDescriptor: (_, k) => (typeof k === "string" && k in STATUS_COLOR
      ? { enumerable: true, configurable: true, value: { label: c(`status.${k}` as CommonKey), color: STATUS_COLOR[k as EventStatus] } }
      : undefined),
  },
);

export const TYPE_LABEL: Record<string, string> = table(
  ["delay", "closure", "lift_out", "diversion", "crowding", "waterlogging", "mega_block", "running_normally", "not_a_disruption"] as const, "type");

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
  const burst = ev.flags.includes("coordinated_burst");
  let burstSize = 0;
  for (const e of ev.evidence) {
    if (e.contradicts) continue;
    if (burst && e.source_type === "crowd" && (e.covers?.length ?? 0) >= 3) {
      burstSize = e.covers!.length;   // one suspicious burst, shown as such
      continue;
    }
    counts[e.source_type] = (counts[e.source_type] ?? 0) + 1;
  }
  const parts = [];
  if (burstSize) parts.push(c("ev.burst", { n: burstSize }));
  if (counts.crowd) parts.push(c(counts.crowd > 1 ? "ev.commuters" : "ev.commuter", { n: counts.crowd }));
  if (counts.news) parts.push(c("ev.news", { n: counts.news }));
  if (counts.official) parts.push(c("ev.official"));
  if (counts.weather) parts.push(c("ev.weather"));
  const contradicted = ev.evidence.some((e) => e.contradicts);
  return parts.join(" + ") + (contradicted ? ` · ${c("ev.contradicted")}` : "");
}

/** Short human title for an event, e.g. "Delay · Saki Naka, Asalpha" or "Closure · Dadar transfer". */
export function eventTitle(ev: DisruptionEvent): string {
  const type = TYPE_LABEL[ev.type] ?? ev.type;
  const stops = ev.affected.stop_ids.map((id) => stations[id]?.name ?? id);
  let where: string;
  if (ev.affected.transfer_ids.length) where = c("ev.transfer", { where: stops.join(" ↔ ") });
  else if (stops.length) where = stops.join(", ");
  else where = ev.affected.line_ids.map(lineShortName).join(", ");
  return `${type} · ${where}`;
}

export const STATUS_ORDER: Record<EventStatus, number> = {
  confirmed: 0, possible: 1, coordinated: 2, ignored: 3, expired: 4,
};
