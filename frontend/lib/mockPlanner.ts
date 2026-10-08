// SAMPLE CONTENT for the Journey Planner, copied from the team's design (journey_planner).
// The form is live (it builds a real trip request); the side panels are sample data until the
// backend is connected. Each block notes the call that will replace it.

/** backend: GET /health (feeds) */
export const engine = {
  title: "Multi-modal Journey Engine v4.2",
  feeds: "Real-time Mumbai MMR GTFS-RT Feeds Active (BEST, Metro Lines 1/2A/7, WR, CR)",
  reliability: "High Reliability: 99.4%",
};

/** Defaults shown in the form — real place names from the covered network. */
export const defaults = {
  from: "Bandra Kurla Complex station",
  to: "CSMT station",
  departureNote: "Today, 08:45 AM (Next train 08:49 AM)",
};

/** backend: saved places per user */
export const savedPlaces = [
  { id: "home", title: "Home", sub: "Andheri West", icon: "home", place: "Andheri station" },
  { id: "work", title: "Work", sub: "BKC G-Block", icon: "work", place: "Jio World Centre, BKC" },
];

export const quickChips = [
  { label: "BOM Terminal 2", icon: "flight", place: "Mumbai Airport Terminal 2" },
  { label: "Nariman Point", icon: "account_balance", place: "Churchgate station" },
  { label: "Tech Park Goregaon", icon: "domain", place: "Goregaon station" },
];

/** Map layer chips (decorative toggles for now) */
export const mapLayers = [
  { id: "metro", label: "Metro 1/2A/7/3", dot: "bg-white", activeClass: "bg-primary text-on-primary" },
  { id: "rail", label: "WR/CR Lines", dot: "bg-tertiary", activeClass: "" },
  { id: "traffic", label: "Traffic Heatmap", dot: "bg-error", activeClass: "" },
  { id: "skywalks", label: "Skywalks", dot: "bg-outline", activeClass: "" },
];

/** backend: POST /plan → selected card summary */
export const activePath = { label: "Active Path: BKC → Dadar → CSMT", time: "34 mins", fare: "₹25" };

export const legend = [
  { label: "Metro Corridors", color: "#006948" },
  { label: "Suburban WR / CR", color: "#b15f00" },
  { label: "Metro 3 Underground", color: "#0284c7" },
  { label: "Road Congestion", color: "#ba1a1a" },
];

/** backend: POST /plan → top cards */
export const recommended = [
  { id: "fast", badge: "Fastest", badgeClass: "bg-primary-fixed text-on-primary-fixed", minutes: 34, minutesClass: "bg-primary text-on-primary",
    title: "Auto-Feeder + WR Fast Local", fare: "₹25 fare", tag: { icon: "airline_seat_recline_normal", text: "Low Crowding", cls: "text-tertiary" },
    steps: ["BKC G-Block", "Bandra Stn (Auto 8m)", "CSMT Fast (Rail 22m)"], cta: "Select Route", primary: true },
  { id: "zero", badge: "Zero Transfer", badgeClass: "bg-secondary-container text-on-secondary-container", minutes: 42, minutesClass: "bg-container-high text-on-surface",
    title: "Aqua Line 3 Underground Metro", fare: "₹50 AC fare", tag: { icon: "ac_unit", text: "Fully Air-Conditioned", cls: "text-primary" },
    steps: ["BKC Underground Stn", "Direct 100% AC Transit to CSMT South"], cta: "Details", primary: false },
];

/** backend: GET /events (confirmed + possible) */
export const advisories = {
  count: 2,
  source: "Source: MMRDA Unified Feed",
  items: [
    { icon: "info", iconClass: "text-tertiary", title: "Harbour Line Platform Maintenance",
      text: "Kurla to Vadala slow services running +7 mins delayed. Consider Metro Line 3 feeder." },
    { icon: "verified", iconClass: "text-primary", title: "Metro 2A/7 Peak Frequency Boosted",
      text: "Additional rakes deployed. 3.5 min headways between Dahisar and Andheri East." },
  ],
};

/** backend: station facilities (not in PS scope yet) */
export const spotlights = [
  { kicker: "Terminus Spotlight", title: "CSMT Intermodal Hub", text: "Platforms 1–7 (Suburban), Metro 3 underground link",
    foot: { icon: "check_circle", text: "Step-Free Lift Verified" }, art: "account_balance", artClass: "from-tertiary-container to-tertiary" },
  { kicker: "Feeder Zone", title: "BKC Electric Bus Loop", text: "Direct 4-minute AC feeder shuttle to the Metro 3 station",
    foot: { icon: "bolt", text: "Zero-Emission BEST E-Bus" }, art: "directions_bus", artClass: "from-primary to-primary-container" },
];

/** backend: GET /events crowding */
export const congestion = {
  title: "Current Network Congestion",
  text: "Dadar (Severe) • BKC (Moderate) • CSMT (Normal)",
  value: "78% Peak",
  sub: "Evening Rush",
};
