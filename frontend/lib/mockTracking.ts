// SAMPLE CONTENT for Live Trip Tracking, copied from the team's design (live_trip_tracking_console).
// Frontend only for now. When connecting the backend, replace each block with the call noted.

/** backend: saved journey (B9 /journeys) */
export const trip = {
  id: "TRK-9942-BOMBAY",
  corridor: "Active Multimodal Corridor: Metro Line 7 → Western Railway EMU Fast Express",
  tripNo: "Trip #842A",
  remainingMin: 18,
  arrival: { time: "09:27", ampm: "AM", status: "On Schedule (+1m ahead)", where: "Bandra BKC Bay" },
  fare: { due: "₹15", total: "of ₹35 total", note: "Auto-Tap NCMC Active", tag: "Post-Paid" },
};

/** backend: live vehicle feed (not in PS scope) */
export const vehicle = {
  line: "Line 7",
  title: "In Transit: Metro Line 7 (Red Line)",
  platform: "Platform 2",
  train: "Train #ML-704",
  next: "Goregaon East",
  nextEta: "(Arriving in 3 mins 40 secs)",
  speed: 48,
  variance: "+1 min",
  temp: "22.4°C",
  coach: "Car #4 (AC-Norm)",
  seatsFree: "54%",
};

export type StepState = "done" | "now" | "next" | "final";

/** backend: journey legs × demo clock */
export const steps: {
  state: StepState; icon: string; title: string; time: string; text: string;
  tag?: string; tagLine?: string; note?: { icon?: string; text: string; cls: string }; extra?: { icon: string; text: string; right: string };
}[] = [
  { state: "done", icon: "check", title: "Gundavali Metro Station", time: "09:05 AM • On time",
    text: "Boarded Metro Line 7 towards Dahisar E (Northbound transfer)", tag: "Platform 1 Entry",
    note: { text: "NCMC Tap: Completed ₹0 debited", cls: "text-outline" } },
  { state: "now", icon: "", title: "Passing Aarey Road Station", time: "09:09 AM (Now)",
    text: "Transit vehicle speed at steady 48 km/h. Automated track sensors clear.",
    note: { icon: "sensors", text: "Carriage 3: Low vibration • 62 seats occupied", cls: "text-on-surface-variant" } },
  { state: "next", icon: "transfer_within_a_station", title: "Arrive Goregaon East Station", time: "09:12 AM (Est)",
    text: "Disembark Metro Line 7. Prepare for skywalk transfer.", tag: "Exit Gate 3B",
    note: { icon: "accessible", text: "Elevator operating", cls: "text-tertiary font-semibold" } },
  { state: "next", icon: "directions_walk", title: "Transfer to Western Line EMU", tagLine: "WR EMU", time: "09:15 AM Dep",
    text: "3-min walk via covered East-West Skywalk. Step-free guided route active.",
    extra: { icon: "view_compact", text: "Fast Local to Churchgate (Next Stop Bandra)", right: "Platform 4" } },
  { state: "final", icon: "flag", title: "Disembark: Bandra Station → BKC", time: "09:27 AM Final",
    text: "Platform 5 Exit • Auto/Feeder e-Bus shuttle connectivity to One BKC", tag: "Final Tap: ₹15",
    note: { text: "Trip completion certified", cls: "text-outline" } },
];

/** backend: GET /events crowding near upcoming stops */
export const platforms = [
  { where: "Goregaon Pf 2", level: "Light", cls: "text-primary", sub: "~120 commuters" },
  { where: "Skywalk Link", level: "Clear", cls: "text-primary", sub: "Moving smoothly" },
  { where: "Western WR Pf 4", level: "Moderate", cls: "text-tertiary", sub: "Car 4-7 open space" },
];

export const mapInfo = {
  beacon: "Live Vehicle Beacon ML-704",
  accuracy: "GPS Accuracy: ±1.8m (Differential DGPS)",
  passed: "Gundavali [Passed 09:05]",
  card: { train: "#ML-704", where: "Passing Aarey Road", speed: "Speed: 48 km/h", eta: "ETA Goregaon: 3 min", progress: 65 },
  transfer: { title: "Transfer Node: Goregaon Pf 2 → Pf 4", sub: "3 min skywalk transfer buffer" },
  destination: { title: "Bandra (BKC Corridor)", sub: "Est. 09:27 AM • On schedule" },
  grid: { title: "Line 7 Grid Status", status: "Optimal", headway: "3.5 mins peak", connecting: "Connecting Train 90124 (WR):", connectingStatus: "Approaching Goregaon" },
  legend: [
    { label: "Metro Red Line 7", cls: "h-3 w-3 rounded-full bg-primary" },
    { label: "Western EMU Fast Line", cls: "h-1.5 w-3 rounded-full bg-secondary" },
    { label: "Elevated Skywalk Walkway", cls: "h-1.5 w-3 rounded-full bg-outline" },
  ],
  feed: "GNSS Real-time Feed",
};

export const velocity = {
  window: "Last 12 mins",
  labels: ["Gundavali (0 km/h)", "Aarey Reach (Peak 58 km/h)", "Now: 48 km/h", "Goregaon Dwell (0 km/h)"],
};

/** Report categories → Pakka Check disruption types (POST /reports) */
export const reportCategories = [
  { id: "delay", label: "Unexpected Delay", icon: "timer_off", iconCls: "text-tertiary", type: "delay" },
  { id: "crowd", label: "Extreme Crowding", icon: "groups", iconCls: "text-error", type: "crowding" },
  // An AC defect doesn't change routes, so it isn't sent to Pakka Check (type null).
  { id: "facility", label: "AC / Facility Defect", icon: "mode_fan_off", iconCls: "text-secondary", type: null },
  { id: "lift", label: "Escalator / Lift Out", icon: "accessible", iconCls: "text-primary", type: "lift_out" },
] as const;

/** Where a report from this sample trip is filed (next stop on the route, in our network). */
export const reportTarget = { stop_id: "goregaon", line_id: "WR_SLOW", label: "Goregaon (Western Railway)" };

export const share = {
  link: "https://travelbuddy.example/live/trk-9942",
  note: "Recipients can monitor your live vehicle location, current station approach, and expected 09:27 AM Bandra arrival in real time.",
  expiry: "Expires at 15:27 PM",
};
