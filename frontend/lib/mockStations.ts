// SAMPLE CONTENT for Station Explorer & Nearby, copied from the team's design (station_explorer_nearby).
// Frontend only. Station positions come from the real network (stations.json); departures,
// crowding, gates and facilities are sample until live feeds exist.

// Visible text lives in lib/i18n/messages/StationExplorer.ts; text fields hold its keys
// (a [key, vars] pair when the text has numbers in it).

import type { Vars } from "./i18n";
import type { StationKey } from "./i18n/messages/StationExplorer";
import type { StationSearchResult } from "./types";

export type Kind = "metro" | "rail" | "bus" | "auto";
type Tone = "ok" | "warn" | "neutral";
/** A message key, or a raw string, or a key with its {placeholders}. */
export type Txt = StationKey | string | [StationKey, Vars];

export const hub = {
  breadcrumb: ["crumb.mmr", "crumb.western", "crumb.hub"] as (StationKey | string)[],
  feeds: "feeds" as StationKey,
  search: "Andheri",
  radii: ["500m", "1km", "1.5km", "2km", "5km"],
  defaultRadius: "1.5km",
  /** Map centre + "you are here" (real coordinates near Andheri station). */
  center: { label: "Andheri station", lat: 19.1197, lon: 72.8464 },
  you: { lat: 19.1205, lon: 72.8420, text: "Andheri West Link Road", dist: "youDist" as StationKey, walk: ["youWalk", { min: 4 }] as Txt },
};

export const filters: { id: Kind | "all"; label: StationKey; icon: string; iconCls: string; count: number }[] = [
  { id: "all", label: "filter.all", icon: "hub", iconCls: "", count: 4 },
  { id: "metro", label: "filter.metro", icon: "subway", iconCls: "text-primary", count: 1 },
  { id: "rail", label: "filter.rail", icon: "train", iconCls: "text-primary", count: 1 },
  { id: "bus", label: "filter.bus", icon: "directions_bus", iconCls: "text-tertiary", count: 1 },
  { id: "auto", label: "filter.auto", icon: "electric_rickshaw", iconCls: "text-tertiary-container", count: 1 },
];

export interface Departure {
  code: string;
  title: StationKey | string;
  meta: { text: Txt; cls?: string }[];
  crowd: { text: StationKey | string; tone: Tone; dot?: boolean };
  eta: Txt;
  etaPrimary: boolean;
  then: Txt;
}

export interface Station {
  id: string;
  kinds: Kind[];
  name: StationKey | string;
  tag: StationKey | string;
  icon: string;
  iconBox: string;
  tagCls: string;
  codeCls: string;
  sub: { text: StationKey | string; cls?: string; dot?: boolean }[];
  walk: Txt;
  departures: Departure[];
  amenities: { icon: string; text: StationKey | string; iconCls: string }[];
  auto?: { title: StationKey | string; text: StationKey | string; badge: StationKey | string };
}

/** backend: station facilities + live departures (not in PS scope yet) */
export const stationCards: Station[] = [
  {
    id: "metro",
    kinds: ["metro"],
    name: "metro.name",
    tag: "metro.tag",
    icon: "subway",
    iconBox: "bg-primary-fixed text-primary",
    tagCls: "bg-primary text-on-primary",
    codeCls: "bg-primary/10 text-primary",
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
    id: "rail",
    kinds: ["rail"],
    name: "rail.name",
    tag: "rail.tag",
    icon: "train",
    iconBox: "bg-secondary-fixed text-secondary",
    tagCls: "bg-secondary text-container-lowest",
    codeCls: "bg-secondary-fixed text-on-secondary-fixed",
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
    id: "bus",
    kinds: ["bus"],
    name: "bus.name",
    tag: "bus.tag",
    icon: "directions_bus",
    iconBox: "bg-tertiary-fixed text-tertiary",
    tagCls: "bg-tertiary text-container-lowest",
    codeCls: "bg-tertiary-fixed text-on-tertiary-fixed",
    sub: [{ text: "bus.sub1" }, { text: "bus.sub2", cls: "font-semibold text-tertiary" }],
    walk: ["walkDist", { min: 6, m: 420 }],
    departures: [
      { code: "202", title: "bus.d1", meta: [{ text: "meta.evDecker" }, { text: ["bay", { n: "3" }] }],
        crowd: { text: "crowd.boarding", tone: "ok" }, eta: "now", etaPrimary: true, then: ["bay", { n: "3" }] },
      { code: "359", title: "bus.d2", meta: [{ text: "meta.cng" }, { text: ["bay", { n: "1B" }] }],
        crowd: { text: "crowd.scheduled", tone: "neutral" }, eta: ["etaMin", { min: 8 }], etaPrimary: false, then: ["then", { min: 18 }] },
    ],
    amenities: [
      { icon: "directions_bus", text: "bus.tag", iconCls: "text-tertiary" },
      { icon: "ev_station", text: "fac.ev.title", iconCls: "text-tertiary" },
    ],
  },
  {
    id: "auto",
    kinds: ["auto"],
    name: "auto.title",
    tag: "auto.badge",
    icon: "electric_rickshaw",
    iconBox: "bg-tertiary-fixed text-tertiary",
    tagCls: "bg-tertiary text-container-lowest",
    codeCls: "bg-tertiary-fixed text-on-tertiary-fixed",
    sub: [{ text: "auto.text" }],
    walk: ["walkDist", { min: 2, m: 120 }],
    departures: [],
    amenities: [
      { icon: "electric_rickshaw", text: "auto.badge", iconCls: "text-tertiary" },
      { icon: "local_taxi", text: "auto.title", iconCls: "text-tertiary" },
    ],
    auto: { title: "auto.title", text: "auto.text", badge: "auto.badge" },
  },
];

export const mapLayers: StationKey[] = ["layer.all", "layer.gates", "layer.ev", "layer.tickets"];
export const skywalk: StationKey = "skywalk";

export const gates: { gate: number; icon: string; iconCls: string; title: StationKey | string; text: StationKey | string }[] = [
  { gate: 1, icon: "escalator", iconCls: "text-primary", title: "gate1.title", text: "gate1.text" },
  { gate: 2, icon: "directions_walk", iconCls: "text-primary", title: "gate2.title", text: "gate2.text" },
  { gate: 3, icon: "accessible", iconCls: "text-primary", title: "gate3.title", text: "gate3.text" },
  { gate: 4, icon: "electric_rickshaw", iconCls: "text-primary", title: "gate4.title", text: "gate4.text" },
  { gate: 5, icon: "ev_station", iconCls: "text-tertiary", title: "gate5.title", text: "gate5.text" },
  { gate: 6, icon: "local_parking", iconCls: "text-primary", title: "gate6.title", text: "gate6.text" },
];

export const facilities: { icon: string; title: StationKey | string; text: StationKey | string; foot: Txt }[] = [
  { icon: "confirmation_number", title: "fac.tickets.title", text: "fac.tickets.text", foot: ["fac.tickets.foot", { hours: "04:00–01:00" }] },
  { icon: "ev_station", title: "fac.ev.title", text: "fac.ev.text", foot: "fac.ev.foot" },
  { icon: "accessible_forward", title: "fac.access.title", text: "fac.access.text", foot: "fac.access.foot" },
  { icon: "medical_services", title: "fac.aid.title", text: "fac.aid.text", foot: "fac.aid.foot" },
];

export interface HubData {
  center: { label: string; lat: number; lon: number };
  cards: Station[];
  gates: { gate: number; icon: string; iconCls: string; title: StationKey | string; text: StationKey | string }[];
  facilities: { icon: string; title: StationKey | string; text: StationKey | string; foot: Txt }[];
  breadcrumb: (StationKey | string)[];
  title: string;
}

export function buildHubData(
  selected: StationSearchResult | null,
  nearby: StationSearchResult[] = []
): HubData {
  if (!selected) {
    return {
      center: hub.center,
      cards: stationCards,
      gates,
      facilities,
      breadcrumb: hub.breadcrumb,
      title: "Andheri Transit Hub (Line 1 & WR)",
    };
  }

  const isAndheri = selected.id === "andheri_wr" || selected.id === "andheri_m1" || selected.name.toLowerCase().includes("andheri");
  if (isAndheri) {
    return {
      center: { label: selected.name, lat: selected.lat, lon: selected.lon },
      cards: stationCards,
      gates,
      facilities,
      breadcrumb: ["crumb.mmr", "crumb.western", `${selected.name} Multi-Modal Hub`],
      title: `${selected.name} Multi-Modal Hub`,
    };
  }

  // Build tailored cards for this station and its surroundings
  const cards: Station[] = [];
  const allInArea = [selected, ...nearby.filter((s) => s.id !== selected.id)];

  // 1. Suburban rail
  const railSts = allInArea.filter((s) => s.mode === "local");
  for (const r of railSts.slice(0, 2)) {
    const linesStr = r.lines && r.lines.length ? r.lines.join(", ") : "Suburban Local";
    cards.push({
      id: `rail-${r.id}`,
      kinds: ["rail"],
      name: r.name,
      tag: "Suburban Rail",
      icon: "train",
      iconBox: "bg-secondary-fixed text-secondary",
      tagCls: "bg-secondary text-container-lowest",
      codeCls: "bg-secondary-fixed text-on-secondary-fixed",
      sub: [
        { text: `Lines: ${linesStr}` },
        { text: r.step_free ? "Step-Free Access Available" : "Foot Overbridge Grid", cls: "font-semibold text-secondary" }
      ],
      walk: r.distance_m ? ["walkDist", { min: Math.max(1, Math.round(r.distance_m / 80)), m: r.distance_m }] : ["walkDist", { min: 3, m: 220 }],
      departures: [
        {
          code: "UP",
          title: `${r.name} → Up Local (Slow)`,
          meta: [{ text: "Slow Local (All Stops)" }, { text: "12 Coaches" }],
          crowd: { text: "crowd.med", tone: "warn", dot: true },
          eta: ["etaMin", { min: 3 }],
          etaPrimary: true,
          then: ["then", { min: 9 }],
        },
        {
          code: "DN",
          title: `${r.name} → Down Local (Fast)`,
          meta: [{ text: "Fast Express" }, { text: "15 Coaches AC", cls: "font-semibold text-primary" }],
          crowd: { text: "crowd.low", tone: "ok", dot: true },
          eta: ["etaMin", { min: 7 }],
          etaPrimary: false,
          then: ["then", { min: 14 }],
        },
      ],
      amenities: [
        { icon: "confirmation_number", text: "amen.uts", iconCls: "text-secondary" },
        { icon: "local_parking", text: "amen.parking", iconCls: "text-secondary" },
        { icon: "accessible", text: r.step_free ? "Universal Ramp / Lift" : "amen.tactile", iconCls: "text-secondary" },
      ],
    });
  }

  // 2. Metro
  const metroSts = allInArea.filter((s) => s.mode === "metro");
  for (const m of metroSts.slice(0, 2)) {
    const linesStr = m.lines && m.lines.length ? m.lines.join(", ") : "Metro Network";
    cards.push({
      id: `metro-${m.id}`,
      kinds: ["metro"],
      name: m.name,
      tag: linesStr,
      icon: "subway",
      iconBox: "bg-primary-fixed text-primary",
      tagCls: "bg-primary text-on-primary",
      codeCls: "bg-primary/10 text-primary",
      sub: [
        { text: "Elevated / Concourse Access" },
        { text: "Skywalk & Interchange Link", cls: "font-semibold text-primary", dot: true },
        { text: "Lift / Escalator Access" }
      ],
      walk: m.distance_m ? ["walkDist", { min: Math.max(1, Math.round(m.distance_m / 80)), m: m.distance_m }] : ["walkDist", { min: 4, m: 280 }],
      departures: [
        {
          code: "M1",
          title: `${m.name} → Platform 1`,
          meta: [{ text: "Normal Service" }, { text: "AC 8-Car / 4-Car", cls: "font-semibold text-primary" }],
          crowd: { text: "crowd.low", tone: "ok", dot: true },
          eta: ["etaMin", { min: 2 }],
          etaPrimary: true,
          then: ["then", { min: 6 }],
        },
        {
          code: "M2",
          title: `${m.name} → Platform 2`,
          meta: [{ text: "High Frequency (Every 4 min)" }, { text: "AC Train", cls: "font-semibold text-primary" }],
          crowd: { text: "crowd.med", tone: "warn", dot: true },
          eta: ["etaMin", { min: 5 }],
          etaPrimary: false,
          then: ["then", { min: 10 }],
        },
      ],
      amenities: [
        { icon: "wifi", text: "amen.wifi", iconCls: "text-primary" },
        { icon: "elevator", text: "amen.escalators", iconCls: "text-primary" },
        { icon: "water_drop", text: "amen.water", iconCls: "text-primary" },
        { icon: "accessible", text: "amen.stepFree", iconCls: "text-primary" },
      ],
    });
  }

  // 3. Bus
  const busSts = allInArea.filter((s) => s.mode === "bus");
  const busItem = busSts[0] ?? {
    id: `bus-${selected.id}`,
    name: `${selected.name} Bus Stop / Feeder`,
    mode: "bus",
  };
  cards.push({
    id: `bus-${busItem.id}`,
    kinds: ["bus"],
    name: busItem.name,
    tag: "BEST Municipal",
    icon: "directions_bus",
    iconBox: "bg-tertiary-fixed text-tertiary",
    tagCls: "bg-tertiary text-container-lowest",
    codeCls: "bg-tertiary-fixed text-on-tertiary-fixed",
    sub: [
      { text: "City Feeder & Transfer Bay" },
      { text: "Frequent Municipal Routes", cls: "font-semibold text-tertiary" }
    ],
    walk: ["walkDist", { min: 5, m: 350 }],
    departures: [
      {
        code: "BUS",
        title: `${selected.name} Feeder Route`,
        meta: [{ text: "Electric AC / Non-AC" }, { text: "Scheduled Service" }],
        crowd: { text: "crowd.scheduled", tone: "neutral" },
        eta: ["etaMin", { min: 6 }],
        etaPrimary: true,
        then: ["then", { min: 16 }],
      },
    ],
    amenities: [
      { icon: "directions_bus", text: "BEST Feeder Bays", iconCls: "text-tertiary" },
      { icon: "schedule", text: "Scheduled Frequency", iconCls: "text-tertiary" },
    ],
  });

  // 4. Auto / Cab Stand
  cards.push({
    id: `auto-${selected.id}`,
    kinds: ["auto"],
    name: `Shared Auto & Cab Stand (${selected.name})`,
    tag: "Regulated Stand",
    icon: "electric_rickshaw",
    iconBox: "bg-tertiary-fixed text-tertiary",
    tagCls: "bg-tertiary text-container-lowest",
    codeCls: "bg-tertiary-fixed text-on-tertiary-fixed",
    sub: [
      { text: "Regulated Queue • Prepaid / Metered Available" }
    ],
    walk: ["walkDist", { min: 2, m: 100 }],
    departures: [],
    amenities: [
      { icon: "electric_rickshaw", text: "Prepaid Meter Auto", iconCls: "text-tertiary" },
      { icon: "local_taxi", text: "App Cab Pickup Zone", iconCls: "text-tertiary" },
    ],
    auto: {
      title: `Auto-Rickshaw & Taxi Stand (${selected.name})`,
      text: "Regulated prepaid counter & street queues available 24/7",
      badge: "Fast Moving",
    },
  });

  // Tailored gates
  const customGates = [
    { gate: 1, icon: "directions_walk", iconCls: "text-primary", title: "West Exit Plaza", text: "Main road & auto stand access" },
    { gate: 2, icon: "escalator", iconCls: "text-primary", title: "North Foot Overbridge", text: "Direct platform interchange" },
    { gate: 3, icon: "accessible", iconCls: "text-primary", title: "East Station Plaza", text: "Elevators & ramp entrance" },
    { gate: 4, icon: "electric_rickshaw", iconCls: "text-primary", title: "Auto / Taxi Stand Ring", text: "Regulated queues" },
    { gate: 5, icon: "directions_bus", iconCls: "text-tertiary", title: "Bus Depot Feeder", text: "BEST transit stops" },
    { gate: 6, icon: "local_parking", iconCls: "text-primary", title: "South Entry & Parking", text: "2-Wheeler parking" },
  ];

  // Tailored facilities
  const customFacilities = [
    { icon: "confirmation_number", title: "fac.tickets.title", text: "fac.tickets.text", foot: ["fac.tickets.foot", { hours: "04:30–01:00" }] as Txt },
    { icon: "accessible_forward", title: "Universal Accessibility", text: selected.step_free ? "Elevators & step-free ramps operative" : "Foot overbridge stairs (Assistance available)", foot: "Assistance booth at entrance" as Txt },
    { icon: "local_parking", title: "fac.ev.title", text: "fac.ev.text", foot: "fac.ev.foot" as Txt },
    { icon: "medical_services", title: "fac.aid.title", text: "fac.aid.text", foot: "fac.aid.foot" as Txt },
  ];

  return {
    center: { label: selected.name, lat: selected.lat, lon: selected.lon },
    cards,
    gates: customGates,
    facilities: customFacilities,
    breadcrumb: ["crumb.mmr", selected.name],
    title: `${selected.name} Transit Interchange`,
  };
}
