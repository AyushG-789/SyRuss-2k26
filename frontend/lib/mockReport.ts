// Content for the Report Incident page, from the team's design (citizen incident console).
// Categories map to Pakka Check disruption types; submitting is REAL (POST /reports).
// Voice memo, media and reputation are sample until speech-to-text (B7/A8) and accounts exist.

import type { DisruptionEvent } from "./types";

export const page = {
  breadcrumb: ["Home", "Network Status", "Citizen Incident Console"],
  title: "Report a Transit & Traffic Incident",
  badge: "Live Citizen Reports",
  synced: "Checked by Pakka Check: commuters + news + official notices",
  subtitle: "Your report is fact-checked against other commuters, news and official notices before it changes anyone's route.",
};

/** Shown in the header strip when the backend is offline (otherwise live counts are used). */
export const sampleStats = { active: "1,428", verified: "94.2%", alerted: "62.8k" };

export const categories: {
  id: string; label: string; text: string; icon: string; iconCls: string;
  type: DisruptionEvent["type"]; severity: DisruptionEvent["severity"];
}[] = [
  { id: "accident", label: "Road Accident", text: "Collision, rollover, damaged vehicle", icon: "car_crash", iconCls: "text-error", type: "closure", severity: "high" },
  { id: "traffic", label: "Heavy Traffic / Jam", text: "Severe bottleneck, crawling speed", icon: "traffic", iconCls: "text-primary", type: "crowding", severity: "medium" },
  { id: "flood", label: "Blockage / Flooding", text: "Waterlogging, fallen tree, mudslide", icon: "flood", iconCls: "text-secondary", type: "waterlogging", severity: "medium" },
  { id: "breakdown", label: "Transit Breakdown", text: "BEST bus stalled, metro line pause", icon: "directions_bus", iconCls: "text-tertiary", type: "delay", severity: "high" },
  { id: "construction", label: "Road Construction", text: "Metro barricade, sudden lane detour", icon: "construction", iconCls: "text-on-surface-variant", type: "diversion", severity: "low" },
  { id: "other", label: "Other Hazard", text: "Signal fault, oil spill, cattle on path", icon: "report_problem", iconCls: "text-outline", type: "delay", severity: "medium" },
];

/** Sample voice memo (real speech-to-text arrives with Sarvam, A8 / B7). */
export const voiceMemo = {
  length: "0:08",
  max: "0:30 MAX",
  rate: "44.1 kHz",
  transcript: "Waterlogged near subway underpass causing slow movement. Left 2 lanes blocked with knee-deep water.",
};

export const defaultDescription = "Left 2 lanes blocked due to sudden culvert overflow. Vehicles diverting into single right lane.";

export const location = {
  title: "Western Express Highway (Near Gundavali Metro Gate 2)",
  sub: "Andheri East, Mumbai MMR • 19.1158° N, 72.8564° E",
  /** Station the report is filed against (Pakka Check needs a stop or line). */
  defaultStation: "weh_m1",
};

export const corridors = [
  "Western Express Highway (WEH - NH 48)",
  "Swami Vivekananda (SV) Road",
  "New Link Road (Andheri-Dahisar)",
  "Jogeshwari-Vikhroli Link Road (JVLR)",
  "Eastern Freeway & Sion-Panvel",
];

export const directions = ["Northbound", "Southbound", "Both Ways"] as const;

export const radarLayers = ["Traffic Layer", "Metro 1 & 3 Lines", "Flooding Hotspots"];

/** Sample reputation (no user accounts in the prototype). */
export const reputation = {
  tier: "Level 4 Transit Pathfinder",
  badge: "Top 5% Commuter",
  reward: "+50 Unified NCMC Pts",
  accuracy: "Accuracy Score: 98.4%",
  reports: "84 Verified Reports Made",
};
