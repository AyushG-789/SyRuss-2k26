// SAMPLE CONTENT for Station Explorer & Nearby, copied from the team's design (station_explorer_nearby).
// Frontend only. Station positions come from the real network (stations.json); departures,
// crowding, gates and facilities are sample until live feeds exist.

// Visible text lives in lib/i18n/messages/StationExplorer.ts; text fields hold its keys
// (a [key, vars] pair when the text has numbers in it).

import type { Vars } from "./i18n";
import type { StationKey } from "./i18n/messages/StationExplorer";

export type Kind = "metro" | "rail" | "bus" | "auto";
type Tone = "ok" | "warn" | "neutral";
/** A message key, or a key with its {placeholders}. */
export type Txt = StationKey | [StationKey, Vars];

export const hub = {
  breadcrumb: ["crumb.mmr", "crumb.western", "crumb.hub"] as StationKey[],
  feeds: "feeds" as StationKey,
  search: "Andheri Transit Hub (Line 1 & WR)",
  radii: ["500m", "1km", "1.5km", "2km", "5km"],
  defaultRadius: "1.5km",
  /** Map centre + "you are here" (real coordinates near Andheri station). */
  center: { label: "Andheri station", lat: 19.1197, lon: 72.8464 },
  you: { lat: 19.1205, lon: 72.8420, text: "Andheri West Link Road", dist: "youDist" as StationKey, walk: ["youWalk", { min: 4 }] as Txt },
};

export const filters: { id: Kind | "all"; label: StationKey; icon: string; iconCls: string; count: number }[] = [
  { id: "all", label: "filter.all", icon: "hub", iconCls: "", count: 14 },
  { id: "metro", label: "filter.metro", icon: "subway", iconCls: "text-primary", count: 3 },
  { id: "rail", label: "filter.rail", icon: "train", iconCls: "text-primary", count: 1 },
  { id: "bus", label: "filter.bus", icon: "directions_bus", iconCls: "text-tertiary", count: 6 },
  { id: "auto", label: "filter.auto", icon: "electric_rickshaw", iconCls: "text-tertiary-container", count: 4 },
];

export interface Departure { code: string; title: StationKey; meta: { text: Txt; cls?: string }[]; crowd: { text: StationKey; tone: Tone; dot?: boolean }; eta: Txt; etaPrimary: boolean; then: Txt }
export interface Station {
  id: string; kinds: Kind[]; name: StationKey; tag: StationKey; icon: string; iconBox: string; tagCls: string; codeCls: string;
  sub: { text: StationKey; cls?: string; dot?: boolean }[]; walk: Txt; departures: Departure[];
  amenities: { icon: string; text: StationKey; iconCls: string }[];
  auto?: { title: StationKey; text: StationKey; badge: StationKey };
}

/** backend: station facilities + live departures (not in PS scope yet) */
export const stationCards: Station[] = [
  {
    id: "metro", kinds: ["metro"], name: "metro.name", tag: "metro.tag", icon: "subway", iconBox: "bg-primary-fixed text-primary",
    tagCls: "bg-primary text-on-primary", codeCls: "bg-primary/10 text-primary",
    sub: [{ text: "metro.sub1" }, { text: "metro.sub2", cls: "font-semibold text-primary", dot: true }, { text: "metro.sub3" }],
    walk: ["walkDist", { min: 3, m: 210 }],
    departures: [
      { code: "P1", title: "metro.d1", meta: [{ text: "meta.normal" }, { text: "meta.ac4", cls: "font-semibold text-primary" }],
        crowd: { text: "crowd.low", tone: "ok", dot: true }, eta: ["etaMin", { min: 2 }], etaPrimary: true, then: ["then", { min: 6 }] },
      { code: "P2", title: "metro.d2", meta: [{ text: "meta.highFreq" }, { text: "meta.ac4", cls: "font-semibold text-primary" }],
        crowd: { text: "crowd.med", tone: "warn", dot: true }, eta: ["etaMin", { min: 4 }], etaPrimary: false, then: ["then", { min: 7 }] },
    ],
    amenities: [
      { icon: "wifi", text: "amen.wifi", iconCls: "text-primary" },
      { icon: "elevator", text: "amen.escalators", iconCls: "text-primary" },
      { icon: "water_drop", text: "amen.water", iconCls: "text-primary" },
      { icon: "accessible", text: "amen.stepFree", iconCls: "text-primary" },
    ],
  },
  {
    id: "rail", kinds: ["rail"], name: "rail.name", tag: "rail.tag", icon: "train", iconBox: "bg-secondary-fixed text-secondary",
    tagCls: "bg-secondary text-container-lowest", codeCls: "bg-secondary-fixed text-on-secondary-fixed",
    sub: [{ text: "rail.sub1" }, { text: "rail.sub2", cls: "font-semibold text-secondary" }],
    walk: ["walkDist", { min: 5, m: 340 }],
    departures: [
      { code: "P1", title: "rail.d1", meta: [{ text: "meta.slowLocal", cls: "font-semibold text-secondary" }, { text: "meta.coaches12" }],
        crowd: { text: "crowd.high", tone: "warn", dot: true }, eta: ["etaMin", { min: 1 }], etaPrimary: true, then: "arriving" },
      { code: "P3", title: "rail.d2", meta: [{ text: "meta.fastSkip", cls: "font-semibold text-secondary" }, { text: "meta.coaches15ac", cls: "font-semibold text-primary" }],
        crowd: { text: "crowd.low", tone: "ok", dot: true }, eta: ["etaMin", { min: 3 }], etaPrimary: false, then: ["then", { min: 8 }] },
    ],
    amenities: [
      { icon: "confirmation_number", text: "amen.uts", iconCls: "text-secondary" },
      { icon: "local_parking", text: "amen.parking", iconCls: "text-secondary" },
      { icon: "accessible", text: "amen.tactile", iconCls: "text-secondary" },
    ],
  },
  {
    id: "bus", kinds: ["bus", "auto"], name: "bus.name", tag: "bus.tag", icon: "directions_bus", iconBox: "bg-tertiary-fixed text-tertiary",
    tagCls: "bg-tertiary text-container-lowest", codeCls: "bg-tertiary-fixed text-on-tertiary-fixed",
    sub: [{ text: "bus.sub1" }, { text: "bus.sub2", cls: "font-semibold text-tertiary" }],
    walk: ["walkDist", { min: 6, m: 420 }],
    departures: [
      { code: "202", title: "bus.d1", meta: [{ text: "meta.evDecker" }, { text: ["bay", { n: "3" }] }],
        crowd: { text: "crowd.boarding", tone: "ok" }, eta: "now", etaPrimary: true, then: ["bay", { n: "3" }] },
      { code: "359", title: "bus.d2", meta: [{ text: "meta.cng" }, { text: ["bay", { n: "1B" }] }],
        crowd: { text: "crowd.scheduled", tone: "neutral" }, eta: ["etaMin", { min: 8 }], etaPrimary: false, then: ["then", { min: 18 }] },
    ],
    amenities: [],
    auto: { title: "auto.title", text: "auto.text", badge: "auto.badge" },
  },
];

export const mapLayers: StationKey[] = ["layer.all", "layer.gates", "layer.ev", "layer.tickets"];
export const skywalk: StationKey = "skywalk";

export const gates: { gate: number; icon: string; iconCls: string; title: StationKey; text: StationKey }[] = [
  { gate: 1, icon: "escalator", iconCls: "text-primary", title: "gate1.title", text: "gate1.text" },
  { gate: 2, icon: "directions_walk", iconCls: "text-primary", title: "gate2.title", text: "gate2.text" },
  { gate: 3, icon: "accessible", iconCls: "text-primary", title: "gate3.title", text: "gate3.text" },
  { gate: 4, icon: "electric_rickshaw", iconCls: "text-primary", title: "gate4.title", text: "gate4.text" },
  { gate: 5, icon: "ev_station", iconCls: "text-tertiary", title: "gate5.title", text: "gate5.text" },
  { gate: 6, icon: "local_parking", iconCls: "text-primary", title: "gate6.title", text: "gate6.text" },
];

export const facilities: { icon: string; title: StationKey; text: StationKey; foot: Txt }[] = [
  { icon: "confirmation_number", title: "fac.tickets.title", text: "fac.tickets.text", foot: ["fac.tickets.foot", { hours: "04:00–01:00" }] },
  { icon: "ev_station", title: "fac.ev.title", text: "fac.ev.text", foot: "fac.ev.foot" },
  { icon: "accessible_forward", title: "fac.access.title", text: "fac.access.text", foot: "fac.access.foot" },
  { icon: "medical_services", title: "fac.aid.title", text: "fac.aid.text", foot: "fac.aid.foot" },
];
