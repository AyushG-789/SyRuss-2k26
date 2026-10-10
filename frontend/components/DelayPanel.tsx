"use client";

// Running status of one train / metro / bus on the Stations nearby boards: how late or early it is
// against its timetable, from the live feed (RailRadar for locals). Without live data it says so
// plainly ("Planned time") instead of claiming the service is on time.

import Icon from "./Icon";

type Tone = "late" | "slight" | "ontime" | "early" | "planned";

const STYLE: Record<Tone, { box: string; chip: string; icon: string }> = {
  late: { box: "bg-error-container text-on-error-container ring-error/30", chip: "bg-error text-white", icon: "running_with_errors" },
  slight: { box: "bg-amber-soft text-amber-ink ring-amber-ink/25", chip: "bg-amber-ink text-white", icon: "schedule" },
  ontime: { box: "bg-good-soft text-good ring-good/25", chip: "bg-good text-white", icon: "check_circle" },
  early: { box: "bg-sky-100 text-sky-900 ring-sky-400/40 dark:bg-sky-950 dark:text-sky-100", chip: "bg-sky-600 text-white", icon: "bolt" },
  planned: { box: "bg-container-low text-on-surface-variant ring-hairline", chip: "bg-container-high text-on-surface-variant", icon: "event_note" },
};

export function delayTone(live: boolean, delayMin: number): Tone {
  if (!live) return "planned";
  if (delayMin >= 5) return "late";
  if (delayMin >= 1) return "slight";
  if (delayMin <= -1) return "early";
  return "ontime";
}

/** "10:22" -> "10:22 AM" */
function to12h(hhmm?: string | null): string {
  if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return hhmm ?? "";
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

/** Small status icon for the top row of a card (same colours as the panel). */
export function DelayDot({ live, delayMin }: { live: boolean; delayMin: number }) {
  const tone = delayTone(live, delayMin);
  const label = tone === "planned" ? "Planned time" : tone === "ontime" ? "On time" : tone === "early" ? `${-delayMin} min early` : `${delayMin} min late`;
  return (
    <span title={label} aria-label={label} className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${STYLE[tone].chip}`}>
      <Icon name={STYLE[tone].icon} className="text-[16px]" />
    </span>
  );
}

export default function DelayPanel({ live, delayMin, scheduled, expected, mode = "train" }: {
  live: boolean;
  delayMin: number;
  /** "HH:MM" from the timetable */
  scheduled: string;
  /** "HH:MM" expected by the live feed */
  expected?: string | null;
  mode?: "train" | "metro" | "bus";
}) {
  const tone = delayTone(live, delayMin);
  const s = STYLE[tone];
  const title = tone === "planned" ? "Planned time"
    : tone === "ontime" ? "On time"
    : tone === "early" ? `${-delayMin} min early`
    : `${delayMin} min late`;
  const sub = tone === "planned"
    ? `${to12h(scheduled)} · live running info not available for this ${mode} yet`
    : tone === "ontime" ? `Leaves ${to12h(expected || scheduled)} as scheduled`
    : `Expected ${to12h(expected || scheduled)} · scheduled ${to12h(scheduled)}`;
  return (
    <div className={`mt-3 flex items-center gap-3 rounded-xl px-3 py-2.5 ring-1 ${s.box}`} role="status">
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${s.chip}`}>
        <Icon name={s.icon} className="text-[22px]" />
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-body font-extrabold leading-tight">
          {title}
          {live && <span className="rounded bg-current/10 px-1.5 py-px text-micro font-bold uppercase tracking-wide">Live</span>}
        </span>
        <span className="block text-caption font-medium opacity-90">{sub}</span>
      </span>
    </div>
  );
}
