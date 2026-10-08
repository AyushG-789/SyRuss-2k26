// SAMPLE CONTENT for the Home hub and app shell, copied from the team's design (home_transit_hub).
// The UI is frontend-only for now. When connecting the backend, replace each block with an API
// call — the "backend:" note on each says which one. Shapes are kept simple so swapping is easy.

export type Tone = "ok" | "warn" | "bad" | "neutral";

/** backend: GET /events → latest confirmed event (Pakka Check) */
export const shell = {
  networkStatus: { label: "Network Status", value: "Live 99.8%" },
  city: "Mumbai MMR",
  feed: "Feed Sync OK",
  activeCity: { name: "Mumbai Transit Region (MMR)", lines: "Metro • Western • Central • BEST", badge: "Unified" },
};

/** backend: GET /health + GET /events counts */
export const hero = {
  badge: "MMR Unified Mobility",
  live: "Live GTFS-RT Feeds Active",
  title: "Welcome back, Commuter!",
  subtitle: "Plan, track, and pay across Mumbai Metro, Suburban EMU, BEST Bus, and Last-Mile road transit.",
  stats: [
    { label: "Transit Efficiency", value: "96.4%", accent: true },
    { label: "Active Services", value: "3,842", accent: false },
  ],
  // Real places from the trip form's list, so "Find Routes" can go straight to results.
  defaultFrom: "Andheri station",
  defaultTo: "Jio World Centre, BKC",
  /** "now" = the demo clock's scenario time (same as the Journey Planner). */
  departOptions: [
    { label: "Leave Now", mode: "leave", time: "17:00" },
    { label: "Depart at 05:30 PM", mode: "leave", time: "17:30" },
    { label: "Depart at 06:00 PM", mode: "leave", time: "18:00" },
    { label: "Arrive by 06:30 PM", mode: "arrive", time: "18:30" },
  ] as const,
};

/** backend: saved places per user (not in PS scope yet) */
export const frequentTrips = [
  { id: "home", title: "Home", place: "Andheri West, SV Rd", icon: "home", iconClass: "bg-primary-fixed text-on-primary-fixed",
    badge: { text: "24 min", tone: "neutral" as Tone }, via: { icon: "directions_subway", iconClass: "text-primary", text: "Metro L1 • 4 min away" },
    from: "Andheri station", to: "Jio World Centre, BKC" },
  { id: "office", title: "Office (BKC)", place: "BKC G-Block, Platina Towers", icon: "apartment", iconClass: "bg-secondary-container text-on-secondary-container",
    badge: { text: "Fastest", tone: "ok" as Tone }, via: { icon: "train", iconClass: "text-tertiary", text: "Fast EMU • Platform 4" },
    from: "Andheri station", to: "Jio World Centre, BKC" },
];

/** backend: GET /events grouped by mode (lib/network.ts modeStatuses) */
export const modes = [
  { id: "metro", name: "Metro", detail: "Lines 1, 2A, 7", icon: "subway", iconClass: "bg-primary/10 text-primary", tone: "ok" as Tone,
    status: { icon: "check_circle", text: "Normal Service (99%)" } },
  { id: "local", name: "Local EMU", detail: "WR • CR • Harbour", icon: "train", iconClass: "bg-tertiary-fixed text-tertiary", tone: "warn" as Tone,
    status: { icon: "warning", text: "Minor Delay (+4m)" } },
  { id: "two", name: "2-Wheeler", detail: "EV • Bike Taxi", icon: "two_wheeler", iconClass: "bg-container text-on-surface", tone: "ok" as Tone,
    status: { icon: "bolt", text: "Optimal Corridors" } },
  { id: "four", name: "4-Wheeler", detail: "Cabs • WEH • SCLR", icon: "directions_car", iconClass: "bg-container text-on-surface", tone: "warn" as Tone,
    status: { icon: "traffic", text: "High Traffic Peak" } },
  { id: "walk", name: "Walk", detail: "Skywalks • FOBs", icon: "directions_walk", iconClass: "bg-primary-fixed text-on-primary-fixed", tone: "ok" as Tone,
    status: { icon: "nature_people", text: "Weather Clear (28°C)" } },
];

/** backend: GET /events per line (lib/network.ts lineStatuses) */
export const pulse = {
  refreshed: "Auto-refreshed 8s ago",
  rows: [
    { code: "WR", codeClass: "bg-container text-on-surface", name: "Western Suburban", route: "Churchgate ↔ Dahanu",
      crowd: { text: "Heavy Rush", tone: "bad" as Tone, sub: "88% Capacity" }, onTime: 94.2, onTimeTone: "ok" as Tone, headway: "3 min" },
    { code: "CR", codeClass: "bg-tertiary-fixed text-tertiary", name: "Central Main Line", route: "CSMT ↔ Kalyan / Karjat",
      crowd: { text: "Moderate", tone: "warn" as Tone, sub: "62% Capacity" }, onTime: 91.8, onTimeTone: "warn" as Tone, headway: "4 min" },
    { code: "M2", codeClass: "bg-primary text-on-primary", name: "Metro 2A & 7 Loop", route: "Dahisar ↔ Andheri (W/E)",
      crowd: { text: "Comfortable", tone: "ok" as Tone, sub: "38% Seats Open" }, onTime: 99.1, onTimeTone: "ok" as Tone, headway: "5 min" },
    { code: "BEST", codeClass: "bg-secondary-container text-on-secondary-container", name: "BKC Electric AC Feeder", route: "Bandra Stn ↔ Diamond Bourse",
      crowd: { text: "Normal", tone: "neutral" as Tone, sub: "51% Capacity" }, onTime: 89.4, onTimeTone: "neutral" as Tone, headway: "6 min" },
  ],
  banner: "Push notifications active for Western Line delays > 5 mins.",
};

/** backend: GET /events positions; nearest station from stations.json */
export const liveMap = {
  badge: "GPS Locked",
  vehicles: "14 Vehicles Nearby",
  pins: [
    { icon: "train", text: "WR 9012 (Arr 1m)", lat: 19.0544, lon: 72.8406, cls: "bg-primary text-on-primary" },
    { icon: "directions_bus", text: "BEST 310", lat: 19.0656, lon: 72.8650, cls: "bg-secondary-container text-on-secondary-container" },
  ],
  center: [19.075, 72.855] as [number, number],
  nearest: { title: "Nearest: Andheri Interchange", sub: "Metro L1 Gate 3 • 180m walk", from: "Andheri station" },
};

/** backend: saved journeys (B9 /journeys) */
export const recentJourneys = {
  total: 42,
  items: [
    { icon: "directions_subway", iconClass: "bg-primary/10 text-primary", title: "Ghatkopar → Versova", tag: "Metro 1",
      tagClass: "bg-primary-fixed text-on-primary-fixed", when: "Today • 09:12 AM - 09:34 AM (22 min)", amount: "-₹30.00", note: "Auto-debited", noteIcon: "check" },
    { icon: "directions_bus", iconClass: "bg-secondary-container text-on-secondary-container", title: "Bandra Station → BKC Connector", tag: "BEST C-310",
      tagClass: "bg-container-high text-on-surface", when: "Yesterday • 06:45 PM - 07:05 PM (20 min)", amount: "-₹12.00", note: "QR Validated", noteIcon: "check" },
    { icon: "train", iconClass: "bg-tertiary-fixed text-tertiary", title: "Borivali → Churchgate Fast", tag: "WR Fast",
      tagClass: "bg-tertiary-fixed text-tertiary", when: "24 Oct • 08:05 AM - 08:48 AM (43 min)", amount: "Season Pass", note: "Unlimited Monthly", noteIcon: null },
  ],
};

export const TONE = {
  ok: { chip: "bg-primary-fixed text-on-primary-fixed", text: "text-primary", dot: "bg-primary", bar: "bg-primary" },
  warn: { chip: "bg-tertiary-fixed text-tertiary", text: "text-tertiary", dot: "bg-tertiary", bar: "bg-tertiary" },
  bad: { chip: "bg-error-container text-on-error-container", text: "text-error", dot: "bg-error", bar: "bg-error" },
  neutral: { chip: "bg-container text-on-surface", text: "text-secondary", dot: "bg-secondary", bar: "bg-secondary" },
} as const;
