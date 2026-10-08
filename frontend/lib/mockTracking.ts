// Live Trip Tracking now runs on the real trip (see components/TrackView.tsx). What's left here:
// report categories (real: sent to Pakka Check) and the sample share link (sharing isn't built).

/** Report categories → Pakka Check disruption types (POST /reports) */
export const reportCategories = [
  { id: "delay", label: "Unexpected Delay", icon: "timer_off", iconCls: "text-tertiary", type: "delay" },
  { id: "crowd", label: "Extreme Crowding", icon: "groups", iconCls: "text-error", type: "crowding" },
  // An AC defect doesn't change routes, so it isn't sent to Pakka Check (type null).
  { id: "facility", label: "AC / Facility Defect", icon: "mode_fan_off", iconCls: "text-secondary", type: null },
  { id: "lift", label: "Escalator / Lift Out", icon: "accessible", iconCls: "text-primary", type: "lift_out" },
] as const;

/** Sample only — live sharing isn't part of the prototype. */
export const share = {
  link: "https://travelbuddy.example/live/sample",
};
