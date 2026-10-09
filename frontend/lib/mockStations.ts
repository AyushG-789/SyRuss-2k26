// SAMPLE CONTENT for Station Explorer & Nearby, copied from the team's design (station_explorer_nearby).
// Frontend only. Station positions come from the real network (stations.json); departures,
// crowding, gates and facilities are sample until live feeds exist.

export type Kind = "metro" | "rail" | "bus" | "auto";
type Tone = "ok" | "warn" | "neutral";

export const hub = {
  breadcrumb: ["MMR Transit Network", "Western Corridor & Line 1", "Andheri Multi-Modal Hub"],
  feeds: "Station layout: sample · problems: live Pakka Check",
  search: "Andheri Transit Hub (Line 1 & WR)",
  radii: ["500m", "1km", "1.5km", "2km", "5km"],
  defaultRadius: "1.5km",
  /** Map centre + "you are here" (real coordinates near Andheri station). */
  center: { label: "Andheri station", lat: 19.1197, lon: 72.8464 },
  you: { lat: 19.1205, lon: 72.8420, text: "Andheri West Link Road", dist: "(320m WSW)", walk: "Walk: ~4 min" },
};

export const filters: { id: Kind | "all"; label: string; icon: string; iconCls: string; count: number }[] = [
  { id: "all", label: "All Stations", icon: "hub", iconCls: "", count: 14 },
  { id: "metro", label: "Metro Stations", icon: "subway", iconCls: "text-primary", count: 3 },
  { id: "rail", label: "Suburban Rail", icon: "train", iconCls: "text-primary", count: 1 },
  { id: "bus", label: "Bus Terminals", icon: "directions_bus", iconCls: "text-tertiary", count: 6 },
  { id: "auto", label: "Auto/Cab Stands", icon: "electric_rickshaw", iconCls: "text-tertiary-container", count: 4 },
];

export interface Departure { code: string; title: string; meta: { text: string; cls?: string }[]; crowd: { text: string; tone: Tone; dot?: boolean }; eta: string; etaPrimary: boolean; then: string }
export interface Station {
  id: string; kinds: Kind[]; name: string; tag: string; icon: string; iconBox: string; tagCls: string; codeCls: string;
  sub: { text: string; cls?: string; dot?: boolean }[]; walk: string; departures: Departure[];
  amenities: { icon: string; text: string; iconCls: string }[];
  auto?: { title: string; text: string; badge: string };
}

/** backend: station facilities + live departures (not in PS scope yet) */
export const stationCards: Station[] = [
  {
    id: "metro", kinds: ["metro"], name: "Andheri Metro Station", tag: "Line 1", icon: "subway", iconBox: "bg-primary-fixed text-primary",
    tagCls: "bg-primary text-on-primary", codeCls: "bg-primary/10 text-primary",
    sub: [{ text: "Elevated Concourse" }, { text: "Skywalk Connected", cls: "font-semibold text-primary", dot: true }, { text: "Gate 2 / 3 Access" }],
    walk: "3 mins (210m)",
    departures: [
      { code: "P1", title: "Platform 1 → Versova", meta: [{ text: "Normal Service" }, { text: "AC 4-Car", cls: "font-semibold text-primary" }],
        crowd: { text: "Low Crowd", tone: "ok", dot: true }, eta: "2 min", etaPrimary: true, then: "Then: 6m" },
      { code: "P2", title: "Platform 2 → Ghatkopar (Interchange)", meta: [{ text: "High Frequency" }, { text: "AC 4-Car", cls: "font-semibold text-primary" }],
        crowd: { text: "Med Crowd", tone: "warn", dot: true }, eta: "4 min", etaPrimary: false, then: "Then: 7m" },
    ],
    amenities: [
      { icon: "wifi", text: "High-Speed Wi-Fi", iconCls: "text-primary" },
      { icon: "elevator", text: "4 Escalators • 2 Lifts", iconCls: "text-primary" },
      { icon: "water_drop", text: "RO Drinking Water", iconCls: "text-primary" },
      { icon: "accessible", text: "Step-free entry (Gate 3)", iconCls: "text-primary" },
    ],
  },
  {
    id: "rail", kinds: ["rail"], name: "Andheri Suburban Rail", tag: "WR Zone", icon: "train", iconBox: "bg-secondary-fixed text-secondary",
    tagCls: "bg-secondary text-container-lowest", codeCls: "bg-secondary-fixed text-on-secondary-fixed",
    sub: [{ text: "Ground & Foot Over Bridge Grid" }, { text: "9 Operational Platforms", cls: "font-semibold text-secondary" }],
    walk: "5 mins (340m)",
    departures: [
      { code: "P1", title: "Platform 1 Slow → Churchgate", meta: [{ text: "Slow Local (All Stops)", cls: "font-semibold text-secondary" }, { text: "12 Coaches" }],
        crowd: { text: "High Crowd", tone: "warn", dot: true }, eta: "1 min", etaPrimary: true, then: "Arriving" },
      { code: "P3", title: "Platform 3 Fast → Borivali • Virar", meta: [{ text: "Fast (Jogeshwari Skip)", cls: "font-semibold text-secondary" }, { text: "15 Coaches AC", cls: "font-semibold text-primary" }],
        crowd: { text: "Low Crowd", tone: "ok", dot: true }, eta: "3 min", etaPrimary: false, then: "Then: 8m" },
    ],
    amenities: [
      { icon: "confirmation_number", text: "UTS QR Smart Kiosks (8)", iconCls: "text-secondary" },
      { icon: "local_parking", text: "East / West Multi-Level Parking", iconCls: "text-secondary" },
      { icon: "accessible", text: "Tactile Paving • Wheelchair Ramp", iconCls: "text-secondary" },
    ],
  },
  {
    id: "bus", kinds: ["bus", "auto"], name: "BEST Bus Depot No. 4 (Andheri West)", tag: "BEST Municipal", icon: "directions_bus", iconBox: "bg-tertiary-fixed text-tertiary",
    tagCls: "bg-tertiary text-container-lowest", codeCls: "bg-tertiary-fixed text-on-tertiary-fixed",
    sub: [{ text: "SV Road Junction Terminal" }, { text: "18 Active City Routes", cls: "font-semibold text-tertiary" }],
    walk: "6 mins (420m)",
    departures: [
      { code: "202", title: "Route 202 → Gorai Depot / Borivali W", meta: [{ text: "EV Double-Decker Electric" }, { text: "Bay 3" }],
        crowd: { text: "Boarding", tone: "ok" }, eta: "NOW", etaPrimary: true, then: "Bay 3" },
      { code: "359", title: "Route 359 → Kurla Station (West)", meta: [{ text: "Single-Axle CNG Non-AC" }, { text: "Bay 1B" }],
        crowd: { text: "Scheduled", tone: "neutral" }, eta: "8 min", etaPrimary: false, then: "Then: 18m" },
    ],
    amenities: [],
    auto: { title: "Shared Auto-Rickshaw Stand (Gate 4 East)", text: "Average Queue Wait Time: ~2 mins • Regulated Prepaid Meter Available", badge: "Fast Moving" },
  },
];

export const mapLayers = ["All Layers", "Gates (1-6)", "EV & Auto", "Tickets"];
export const skywalk = "Skywalk Span: Metro ↔ WR Platforms";

export const gates = [
  { gate: "Gate 1", icon: "escalator", iconCls: "text-primary", title: "West SV Road", text: "Auto stand, Market link" },
  { gate: "Gate 2", icon: "directions_walk", iconCls: "text-primary", title: "Metro Skywalk North", text: "Direct concourse walk" },
  { gate: "Gate 3", icon: "accessible", iconCls: "text-primary", title: "East Railway Plaza", text: "Elevator • Wheelchair" },
  { gate: "Gate 4", icon: "electric_rickshaw", iconCls: "text-primary", title: "East Auto Ring", text: "Prepaid auto queues" },
  { gate: "Gate 5", icon: "ev_station", iconCls: "text-tertiary", title: "Bus Depot Terminal", text: "EV Chargers • BEST Bays" },
  { gate: "Gate 6", icon: "local_parking", iconCls: "text-primary", title: "South FOB Exit", text: "2-Wheeler Parking Park" },
];

export const facilities = [
  { icon: "confirmation_number", title: "Ticket Counters & UTS Kiosks", text: "Concourse A & Platform 1 East", foot: "Open 04:00–01:00" },
  { icon: "ev_station", title: "EV Chargers", text: "Gate 5 Parking Area", foot: "Sample — no live charger feed" },
  { icon: "accessible_forward", title: "Universal Accessibility", text: "Braille maps, audio escalators", foot: "Assistance Booth: Gate 2" },
  { icon: "medical_services", title: "First Aid & Transit Police", text: "RPF/GRP Booth, Central FOB", foot: "Emergency: Dial 139" },
];
