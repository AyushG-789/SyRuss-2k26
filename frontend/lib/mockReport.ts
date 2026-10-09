// Content for the Report Incident page, from the team's design (citizen incident console).
// Categories map to Pakka Check disruption types; submitting is REAL (POST /reports).
// Voice memo, media and reputation are sample until speech-to-text (B7/A8) and accounts exist.

// Visible text lives in lib/i18n/messages/ReportIncident.ts; the fields below hold its keys.

import type { ReportKey } from "./i18n/messages/ReportIncident";
import type { DisruptionEvent } from "./types";

export const page: { breadcrumb: ReportKey[] } = {
  breadcrumb: ["crumb.home", "crumb.network", "crumb.console"],
};

/** Shown in the header strip when the backend is offline (otherwise live counts are used). */
export const sampleStats = { active: "1,428", verified: "94.2%", alerted: "62,800" };

export const categories: {
  id: string; label: ReportKey; text: ReportKey; icon: string; iconCls: string;
  type: DisruptionEvent["type"]; severity: DisruptionEvent["severity"];
}[] = [
  { id: "accident", label: "cat.accident", text: "cat.accident.text", icon: "car_crash", iconCls: "text-error", type: "closure", severity: "high" },
  { id: "traffic", label: "cat.traffic", text: "cat.traffic.text", icon: "traffic", iconCls: "text-primary", type: "crowding", severity: "medium" },
  { id: "flood", label: "cat.flood", text: "cat.flood.text", icon: "flood", iconCls: "text-secondary", type: "waterlogging", severity: "medium" },
  { id: "breakdown", label: "cat.breakdown", text: "cat.breakdown.text", icon: "directions_bus", iconCls: "text-tertiary", type: "delay", severity: "high" },
  { id: "construction", label: "cat.construction", text: "cat.construction.text", icon: "construction", iconCls: "text-on-surface-variant", type: "diversion", severity: "low" },
  { id: "other", label: "cat.other", text: "cat.other.text", icon: "report_problem", iconCls: "text-outline", type: "delay", severity: "medium" },
];



export const location = {
  title: "locTitle" as ReportKey,
  sub: "Andheri East, Mumbai",
  /** Station the report is filed against (Pakka Check needs a stop or line). */
  defaultStation: "weh_m1",
};

/** Sent to the backend in English; shown via CORRIDOR_KEY. */
export const corridors = [
  "Western Express Highway (WEH - NH 48)",
  "Swami Vivekananda (SV) Road",
  "New Link Road (Andheri-Dahisar)",
  "Jogeshwari-Vikhroli Link Road (JVLR)",
  "Eastern Freeway & Sion-Panvel",
];

export const CORRIDOR_KEY: Record<string, ReportKey> = {
  "Western Express Highway (WEH - NH 48)": "corr.weh",
  "Swami Vivekananda (SV) Road": "corr.sv",
  "New Link Road (Andheri-Dahisar)": "corr.nlr",
  "Jogeshwari-Vikhroli Link Road (JVLR)": "corr.jvlr",
  "Eastern Freeway & Sion-Panvel": "corr.eef",
};

/** Sent to the backend in English; shown via DIRECTION_KEY. */
export const directions = ["Northbound", "Southbound", "Both Ways"] as const;
export const DIRECTION_KEY: Record<(typeof directions)[number], ReportKey> = {
  Northbound: "dir.north", Southbound: "dir.south", "Both Ways": "dir.both",
};

export const radarLayers: ReportKey[] = ["layer.traffic", "layer.metro", "layer.flood"];

/** Sample reputation (no user accounts in the prototype). */
export const reputation = {
  tier: "rep.tier" as ReportKey,
  badge: "rep.badge" as ReportKey,
  reward: "rep.reward" as ReportKey,
  accuracy: "98.4%",
  reports: 84,
};
