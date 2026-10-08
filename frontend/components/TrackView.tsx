"use client";

// Live Trip Tracking — built from the team's design (stitch: mobilink_web_live_trip_tracking_console).
// Frontend only: content is sample data from lib/mockTracking.ts. "Dispatch Report" still sends a
// real crowd report to Pakka Check when the backend is running.

import Link from "next/link";
import { useEffect, useState } from "react";
import { submitReport, type ReportOut } from "@/lib/api";
import { pct, STATUS_STYLE } from "@/lib/format";
import { mapInfo, platforms, reportCategories, reportTarget, share, steps, trip, vehicle, velocity, type StepState } from "@/lib/mockTracking";
import { useRefreshLiveEvents } from "@/lib/useLiveEvents";
import Icon from "./Icon";

type Modal = null | "report" | "share" | "sos" | "qr";

export default function TrackView() {
  const [modal, setModal] = useState<Modal>(null);
  const [alarm, setAlarm] = useState(true);
  const speed = useWobblingSpeed(vehicle.speed);

  return (
    <main className="flex w-full flex-col px-4 pb-6 md:px-6">
      {/* ---- Top control bar ---- */}
      <div className="flex flex-col justify-between gap-4 py-4 lg:flex-row lg:items-center">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-on-primary shadow-sm">
            <Icon name="directions_subway" className="text-[26px]" />
          </div>
          <div className="flex flex-col">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-semibold">Live Mission Console</span>
              <span className="flex items-center gap-1 rounded-full bg-primary-fixed px-1 py-0.5 text-[11px] font-bold uppercase text-on-primary-fixed">
                <span className="h-1.5 w-1.5 animate-ping rounded-full bg-primary" /> Telemetry Stream Active
              </span>
              <span className="font-mono text-[13px] text-on-surface-variant">{trip.id}</span>
            </div>
            <p className="text-[13px] text-on-surface-variant">{trip.corridor}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setModal("sos")} className="flex items-center gap-1 rounded-xl bg-error px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition-transform hover:opacity-95 active:scale-95">
            <Icon name="emergency" className="text-[18px]" /> Emergency SOS
          </button>
          <button onClick={() => setModal("share")} className="flex items-center gap-1 rounded-xl bg-container-lowest px-4 py-2.5 text-xs font-semibold shadow-sm transition-colors hover:bg-container">
            <Icon name="share" className="text-[18px] text-primary" /> Share Live Link
          </button>
          <button onClick={() => setModal("qr")} className="flex items-center gap-1 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary-container">
            <Icon name="qr_code_2" className="text-[18px]" /> NCMC QR Ticket
          </button>
        </div>
      </div>

      {/* ---- 4 metric cards ---- */}
      <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Remaining Time" icon="schedule" iconCls="bg-primary-fixed/40 text-primary"
          value={<><span className="text-[32px] font-bold leading-10 tracking-tight">{trip.remainingMin}</span><span className="text-lg font-bold text-primary">mins</span></>}
          footLeft={<span className="flex items-center gap-1 text-primary"><Icon name="trending_flat" className="text-[16px]" /> Continuous recalculation</span>}
          footRight={<span className="font-mono text-[11px] font-bold text-outline">{trip.tripNo}</span>} />
        <MetricCard label="Est. Arrival" icon="sports_score" iconCls="bg-secondary-container text-on-secondary-container"
          value={<><span className="text-[32px] font-bold leading-10 tracking-tight">{trip.arrival.time}</span><span className="text-lg font-bold text-on-surface-variant">{trip.arrival.ampm}</span></>}
          footLeft={<span className="flex items-center gap-1 font-semibold text-primary"><Icon name="check_circle" className="text-[16px]" /> {trip.arrival.status}</span>}
          footRight={<span className="text-[11px] font-bold">{trip.arrival.where}</span>} />
        <MetricCard label="Left to Pay / Fare Due" icon="contactless" iconCls="bg-tertiary-fixed text-tertiary"
          value={<><span className="text-[32px] font-bold leading-10 tracking-tight">{trip.fare.due}</span><span className="text-xs font-semibold text-on-surface-variant">{trip.fare.total}</span></>}
          footLeft={<span className="flex items-center gap-1 text-on-surface-variant"><span className="h-2 w-2 rounded-full bg-primary" /> {trip.fare.note}</span>}
          footRight={<span className="text-[11px] font-bold text-tertiary">{trip.fare.tag}</span>} />
        <button onClick={() => setModal("report")}
          className="group flex flex-col justify-between rounded-xl bg-gradient-to-br from-tertiary-fixed to-container p-5 text-left shadow-sm transition-all hover:shadow-md">
          <div className="flex w-full items-start justify-between">
            <div className="flex flex-col">
              <span className="text-[11px] font-bold uppercase tracking-wider text-tertiary">Transit Copilot</span>
              <span className="mt-1 text-xl font-semibold transition-colors group-hover:text-tertiary">Report Issue</span>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-tertiary text-white transition-transform group-hover:scale-105">
              <Icon name="report_problem" className="text-[22px]" />
            </div>
          </div>
          <div className="mt-4 flex w-full items-center justify-between pt-1">
            <span className="text-[13px] text-tertiary">Crowd • Delay • Escalator Defect</span>
            <Icon name="arrow_forward" className="text-[18px] text-tertiary transition-transform group-hover:translate-x-1" />
          </div>
        </button>
      </div>

      {/* ---- Vehicle sensor strip ---- */}
      <div className="mt-4 flex flex-col items-start justify-between gap-4 rounded-xl bg-container-lowest p-4 shadow-sm lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <div className="flex shrink-0 items-center gap-1 rounded-lg bg-primary px-2 py-1 text-[11px] font-bold uppercase text-on-primary">
            <Icon name="subway" className="text-[16px]" /> {vehicle.line}
          </div>
          <div className="flex min-w-0 flex-col">
            <div className="flex flex-wrap items-center gap-1">
              <span className="truncate text-sm font-semibold">{vehicle.title}</span>
              <span className="text-outline">•</span>
              <span className="text-xs font-bold text-primary">{vehicle.platform}</span>
              <span className="text-outline">•</span>
              <span className="font-mono text-[13px] text-on-surface-variant">{vehicle.train}</span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[13px] text-on-surface-variant">
              <span className="font-semibold text-on-surface">Next Station:</span>
              <span className="font-bold text-primary">{vehicle.next}</span>
              <span>{vehicle.nextEta}</span>
            </div>
          </div>
        </div>
        <div className="grid w-full shrink-0 grid-cols-2 gap-4 sm:grid-cols-4 lg:flex lg:w-auto lg:items-center lg:gap-5">
          <Sensor icon="speed" iconCls="bg-container text-primary" value={<><span className="font-mono">{speed}</span> <span className="text-[11px] font-bold text-on-surface-variant">km/h</span></>} label="Speed" />
          <Sensor icon="timer" iconCls="bg-primary-fixed/40 text-primary" value={<span className="font-bold text-primary">{vehicle.variance}</span>} label="Ahead of Sched" />
          <Sensor icon="ac_unit" iconCls="bg-container text-secondary" value={<span className="font-mono">{vehicle.temp}</span>} label={vehicle.coach} />
          <Sensor icon="groups" iconCls="bg-tertiary-fixed text-tertiary" value={<span className="font-bold text-tertiary">{vehicle.seatsFree}</span>} label="Seats Free" />
        </div>
      </div>

      {/* ---- Split panes ---- */}
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-12">
        {/* Left: milestones + platform conditions */}
        <div className="flex flex-col gap-4 lg:col-span-5">
          <div className="flex flex-col rounded-xl bg-container-lowest p-5 shadow-sm">
            <div className="flex items-center justify-between pb-2">
              <div className="flex flex-col">
                <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Dynamic Multi-Hop Ledger</span>
                <span className="text-lg font-semibold">Journey Milestones</span>
              </div>
              <span className="rounded-full bg-container px-2 py-1 font-mono text-[11px] font-bold text-on-surface-variant">{steps.length} Steps Total</span>
            </div>

            <div className="relative mt-4 flex flex-col">
              {steps.map((s, i) => <Milestone key={s.title} step={s} last={i === steps.length - 1} />)}
            </div>

            <div className="mt-5 flex flex-col gap-2 pt-4">
              <div className="flex items-center justify-between rounded-xl bg-container p-4">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-container-lowest text-primary shadow-sm">
                    <Icon name="notifications_active" className="text-[20px]" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold">Station Proximity Alarms</span>
                    <span className="text-[13px] text-on-surface-variant">Alert 1 station prior to transfer (Goregaon)</span>
                  </div>
                </div>
                <button type="button" role="switch" aria-checked={alarm} aria-label="Station proximity alarms" onClick={() => setAlarm((v) => !v)}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${alarm ? "bg-primary" : "bg-container-highest"}`}>
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${alarm ? "left-[22px]" : "left-0.5"}`} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className="flex items-center justify-center gap-1.5 rounded-xl bg-container px-2 py-2.5 text-xs font-semibold shadow-sm transition-colors hover:bg-container-high">
                  <Icon name="download" className="text-[18px]" /> Save Offline Pass
                </button>
                <Link href="/routes/TR3" className="flex items-center justify-center gap-1.5 rounded-xl bg-container px-2 py-2.5 text-xs font-semibold shadow-sm transition-colors hover:bg-container-high">
                  <Icon name="alt_route" className="text-[18px]" /> Find Alt Route
                </Link>
              </div>
            </div>
          </div>

          <div className="flex flex-col rounded-xl bg-container-lowest p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <Icon name="density_medium" className="text-[20px] text-primary" />
                <span className="text-sm font-semibold">Upcoming Platform Conditions</span>
              </div>
              <span className="text-[11px] font-bold text-primary">CCTV AI Verified</span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {platforms.map((p) => (
                <div key={p.where} className="flex flex-col items-center rounded-lg bg-container-low p-2 text-center">
                  <span className="text-[11px] font-bold text-on-surface-variant">{p.where}</span>
                  <span className={`mt-1 text-sm font-bold ${p.cls}`}>{p.level}</span>
                  <span className="mt-0.5 text-[13px] text-outline">{p.sub}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: live map + velocity */}
        <div className="flex flex-col gap-4 lg:col-span-7">
          <div className="relative flex flex-col overflow-hidden rounded-xl bg-container-lowest shadow-sm">
            <div className="z-20 flex items-center justify-between bg-container-lowest p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 rounded-full bg-primary-fixed px-2 py-1 text-[11px] font-bold text-on-primary-fixed">
                  <span className="h-2 w-2 animate-ping rounded-full bg-primary" /> {mapInfo.beacon}
                </div>
                <span className="hidden text-[13px] text-on-surface-variant sm:inline">{mapInfo.accuracy}</span>
              </div>
              <div className="flex items-center gap-1">
                {[["my_location", "Center on vehicle"], ["layers", "Toggle layers"], ["fullscreen", "Fullscreen map"]].map(([icon, title]) => (
                  <button key={icon} type="button" title={title} aria-label={title}
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-container transition-colors hover:bg-container-high">
                    <Icon name={icon} className="text-[18px]" />
                  </button>
                ))}
              </div>
            </div>

            <CorridorMap />

            <div className="flex flex-wrap items-center justify-between gap-2 bg-container-lowest p-4">
              <div className="flex flex-wrap items-center gap-4">
                {mapInfo.legend.map((l) => (
                  <div key={l.label} className="flex items-center gap-1">
                    <span className={l.cls} /> <span className="text-[13px]">{l.label}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-1 text-[13px] text-on-surface-variant">
                <Icon name="satellite_alt" className="text-[16px] text-primary" /> {mapInfo.feed}
              </div>
            </div>
          </div>

          <div className="flex flex-col rounded-xl bg-container-lowest p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Trip Velocity Profile</span>
                <span className="text-lg font-semibold">Speed &amp; Elevation Telemetry</span>
              </div>
              <span className="rounded bg-container px-1 py-0.5 font-mono text-[11px] font-bold text-on-surface-variant">{velocity.window}</span>
            </div>
            <div className="relative mt-4 flex h-28 w-full items-end">
              <svg className="h-full w-full" fill="none" preserveAspectRatio="none" viewBox="0 0 500 100" aria-label="Speed over the last 12 minutes" role="img">
                <defs>
                  <linearGradient id="speedGrad" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#006948" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#006948" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d="M 0,90 Q 50,40 100,50 T 200,30 T 300,35 T 400,20 L 400,100 L 0,100 Z" fill="url(#speedGrad)" />
                <path d="M 0,90 Q 50,40 100,50 T 200,30 T 300,35 T 400,20" stroke="#006948" strokeLinecap="round" strokeWidth="3" />
                <path d="M 400,20 Q 450,50 500,85" stroke="#6d7a72" strokeDasharray="4 4" strokeLinecap="round" strokeWidth="2" />
                <circle cx="400" cy="20" fill="#006948" r="5" stroke="#ffffff" strokeWidth="2" />
              </svg>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] font-bold text-on-surface-variant">
              {velocity.labels.map((l, i) => <span key={l} className={i === 2 ? "text-primary" : ""}>{l}</span>)}
            </div>
          </div>
        </div>
      </div>

      {modal === "report" && <ReportModal onClose={() => setModal(null)} />}
      {modal === "share" && <ShareModal onClose={() => setModal(null)} />}
      {modal === "sos" && <SosModal onClose={() => setModal(null)} />}
      {modal === "qr" && <QrModal onClose={() => setModal(null)} />}
    </main>
  );
}

/* ---------------------------------------------------------------- pieces */

/** Small simulated speed wobble, like the design's demo script (42–56 km/h). */
function useWobblingSpeed(base: number): number {
  const [speed, setSpeed] = useState(base);
  useEffect(() => {
    const id = setInterval(() => setSpeed((s) => Math.min(56, Math.max(42, s + Math.floor(Math.random() * 5) - 2))), 3500);
    return () => clearInterval(id);
  }, []);
  return speed;
}

function MetricCard({ label, icon, iconCls, value, footLeft, footRight }: {
  label: string; icon: string; iconCls: string; value: React.ReactNode; footLeft: React.ReactNode; footRight: React.ReactNode;
}) {
  return (
    <div className="flex flex-col justify-between rounded-xl bg-container-lowest p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="flex flex-col">
          <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">{label}</span>
          <div className="mt-1 flex items-baseline gap-1">{value}</div>
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconCls}`}>
          <Icon name={icon} className="text-[22px]" />
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-2 pt-1 text-[13px]">
        {footLeft}
        {footRight}
      </div>
    </div>
  );
}

function Sensor({ icon, iconCls, value, label }: { icon: string; iconCls: string; value: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconCls}`}>
        <Icon name={icon} className="text-[18px]" />
      </div>
      <div className="flex flex-col">
        <span className="text-sm font-semibold">{value}</span>
        <span className="text-[11px] font-bold text-on-surface-variant">{label}</span>
      </div>
    </div>
  );
}

const NODE: Record<StepState, string> = {
  done: "bg-primary text-on-primary shadow-sm",
  now: "bg-primary-fixed text-primary shadow-sm",
  next: "bg-container-high text-on-surface-variant",
  final: "bg-container text-on-surface shadow-sm",
};
const BOX: Record<StepState, string> = {
  done: "bg-container-low/70",
  now: "bg-primary-fixed/20",
  next: "bg-container-low/40",
  final: "",
};

function Milestone({ step, last }: { step: (typeof steps)[number]; last: boolean }) {
  const s = step;
  return (
    <div className={`relative flex items-start gap-4 ${last ? "" : "pb-5"}`}>
      {!last && <div className={`absolute bottom-0 left-4 top-8 w-0.5 ${s.state === "done" || s.state === "now" ? "bg-primary" : "bg-container-highest"}`} />}
      <div className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${NODE[s.state]}`}>
        {s.state === "now" ? (
          <>
            <span className="absolute h-3 w-3 animate-ping rounded-full bg-primary" />
            <span className="relative h-3 w-3 rounded-full bg-primary" />
          </>
        ) : (
          <Icon name={s.icon} className="text-[16px]" />
        )}
      </div>
      <div className={`flex min-w-0 flex-1 flex-col rounded-xl p-2 ${BOX[s.state]}`}>
        <div className="flex flex-wrap items-center justify-between gap-1">
          <div className="flex items-center gap-1">
            {s.tagLine && <span className="rounded bg-container-highest px-1.5 py-0.5 text-[11px] font-bold">{s.tagLine}</span>}
            <span className={`text-sm ${s.state === "now" ? "font-bold text-primary" : s.state === "final" ? "font-bold" : "font-semibold"}`}>{s.title}</span>
            {s.state === "now" && <span className="rounded-full bg-primary px-1 py-0.5 text-[11px] font-bold uppercase text-on-primary">LIVE</span>}
          </div>
          <span className={`font-mono text-[11px] font-bold ${s.state === "now" ? "text-primary" : "text-on-surface-variant"}`}>{s.time}</span>
        </div>
        <p className={`mt-0.5 text-[13px] ${s.state === "now" ? "text-on-surface" : "text-on-surface-variant"}`}>{s.text}</p>
        {(s.tag || s.note) && (
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {s.tag && (
              <span className={`px-2 py-0.5 text-[11px] font-bold ${s.state === "final" ? "rounded-full bg-primary-fixed text-on-primary-fixed" : s.state === "done" ? "rounded bg-container text-primary" : "rounded bg-container"}`}>
                {s.tag}
              </span>
            )}
            {s.note && (
              <span className={`flex items-center gap-1 text-[13px] ${s.note.cls}`}>
                {s.note.icon && <Icon name={s.note.icon} className="text-[16px]" />} {s.note.text}
              </span>
            )}
          </div>
        )}
        {s.extra && (
          <div className="mt-1 flex items-center justify-between gap-2 rounded-lg bg-container p-1.5">
            <span className="flex items-center gap-1 text-[13px]">
              <Icon name={s.extra.icon} className="text-[16px] text-primary" /> {s.extra.text}
            </span>
            <span className="shrink-0 text-[11px] font-bold">{s.extra.right}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/** The design's schematic corridor (SVG) with its floating cards. */
function CorridorMap() {
  return (
    <div className="relative h-[520px] w-full overflow-hidden bg-container">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,var(--primary-soft),transparent_55%),radial-gradient(circle_at_80%_80%,var(--tertiary-fixed),transparent_50%)] opacity-70" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-container-lowest/90 via-container-lowest/30 to-container-lowest/80" />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <svg className="h-full max-h-[480px] w-full max-w-2xl" fill="none" viewBox="0 0 600 440" aria-hidden>
          <path d="M 80,70 L 190,130 L 310,210 L 410,280 L 520,380" stroke="#bccac0" strokeLinecap="round" strokeLinejoin="round" strokeWidth="8" />
          <path d="M 80,70 L 190,130 L 260,175" stroke="#006948" strokeLinecap="round" strokeLinejoin="round" strokeWidth="8" />
          <path className="animate-pulse" d="M 260,175 L 310,210" stroke="#00855d" strokeDasharray="10 8" strokeLinecap="round" strokeLinejoin="round" strokeWidth="8" />
          <path d="M 310,210 L 335,235" stroke="#545f73" strokeDasharray="6 4" strokeLinecap="round" strokeWidth="4" />
          <circle cx="80" cy="70" fill="#006948" r="10" stroke="#ffffff" strokeWidth="3" />
          <circle cx="190" cy="130" fill="#006948" r="8" stroke="#ffffff" strokeWidth="2.5" />
          <g transform="translate(260, 175)">
            <circle className="animate-ping" cx="0" cy="0" fill="#006948" fillOpacity="0.25" r="18" />
            <circle cx="0" cy="0" fill="#006948" r="12" stroke="#ffffff" strokeWidth="3" />
            <circle cx="0" cy="0" fill="#ffffff" r="4" />
          </g>
          <circle cx="310" cy="210" fill="#191c1e" r="9" stroke="#ffffff" strokeWidth="2.5" />
          <circle cx="335" cy="235" fill="#545f73" r="7" stroke="#ffffff" strokeWidth="2" />
          <circle cx="520" cy="380" fill="#8d4b00" r="11" stroke="#ffffff" strokeWidth="3" />
        </svg>
      </div>

      <div className="absolute left-12 top-12 flex items-center gap-1.5 rounded-lg bg-container-lowest/95 px-2 py-1 shadow-sm backdrop-blur-md">
        <span className="h-2 w-2 rounded-full bg-primary" />
        <span className="text-[11px] font-bold">{mapInfo.passed}</span>
      </div>
      <div className="absolute left-[38%] top-[36%] z-30 flex -translate-x-1/2 -translate-y-full flex-col gap-1 rounded-xl bg-container-lowest/95 p-2 shadow-md backdrop-blur-md">
        <div className="flex items-center gap-1">
          <span className="rounded bg-primary px-1.5 py-0.5 text-[11px] font-bold text-on-primary">{mapInfo.card.train}</span>
          <span className="text-[11px] font-bold">{mapInfo.card.where}</span>
        </div>
        <div className="flex items-center justify-between gap-4 text-[13px] text-on-surface-variant">
          <span>{mapInfo.card.speed}</span>
          <span className="font-bold text-primary">{mapInfo.card.eta}</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-container-high">
          <div className="h-full rounded-full bg-primary" style={{ width: `${mapInfo.card.progress}%` }} />
        </div>
      </div>
      <div className="absolute left-[54%] top-[48%] flex items-center gap-2 rounded-lg bg-container-lowest/95 px-2 py-1 shadow-sm backdrop-blur-md">
        <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-primary" />
        <div className="flex flex-col">
          <span className="text-[11px] font-bold">{mapInfo.transfer.title}</span>
          <span className="text-[11px] font-bold text-tertiary">{mapInfo.transfer.sub}</span>
        </div>
      </div>
      <div className="absolute bottom-12 right-12 hidden items-center gap-2 rounded-xl bg-container-lowest/95 p-2 shadow-sm backdrop-blur-md sm:flex">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-tertiary-fixed text-tertiary">
          <Icon name="flag" className="text-[18px]" />
        </div>
        <div className="flex flex-col">
          <span className="text-[11px] font-bold">{mapInfo.destination.title}</span>
          <span className="text-[13px] text-on-surface-variant">{mapInfo.destination.sub}</span>
        </div>
      </div>
      <div className="absolute bottom-4 left-4 right-4 flex flex-col gap-1 rounded-xl bg-container-lowest/95 p-2 shadow-sm backdrop-blur-md sm:right-auto sm:max-w-xs">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase text-on-surface-variant">{mapInfo.grid.title}</span>
          <span className="text-[11px] font-bold text-primary">{mapInfo.grid.status}</span>
        </div>
        <div className="flex items-center justify-between gap-3 text-[13px]">
          <span>Headway Interval:</span>
          <span className="font-mono font-semibold">{mapInfo.grid.headway}</span>
        </div>
        <div className="flex items-center justify-between gap-3 text-[13px]">
          <span>{mapInfo.grid.connecting}</span>
          <span className="font-bold text-primary">{mapInfo.grid.connectingStatus}</span>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- modals */

function ModalShell({ title, sub, icon, iconCls, onClose, children }: {
  title: string; sub: string; icon: string; iconCls: string; onClose: () => void; children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[1300] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <button className="absolute inset-0 bg-[#2d3133]/40 backdrop-blur-sm" aria-label="Close" onClick={onClose} />
      <div className="relative flex w-full max-w-lg flex-col gap-4 rounded-2xl bg-container-lowest p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconCls}`}><Icon name={icon} className="text-[24px]" /></div>
            <div className="flex flex-col">
              <span className="text-lg font-semibold">{title}</span>
              <span className="text-[13px] text-on-surface-variant">{sub}</span>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-lg text-outline hover:bg-container">
            <Icon name="close" className="text-[20px]" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ReportModal({ onClose }: { onClose: () => void }) {
  const refresh = useRefreshLiveEvents();
  const [cat, setCat] = useState<(typeof reportCategories)[number]["id"]>("delay");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: true; out: ReportOut | null } | { ok: false; msg: string } | null>(null);

  async function dispatch() {
    const c = reportCategories.find((x) => x.id === cat)!;
    if (c.type === null) { setResult({ ok: true, out: null }); return; }
    setBusy(true);
    try {
      const out = await submitReport({
        reporter_id: "web_demo",
        text: details.trim() || `${c.label} near ${reportTarget.label}`,
        type: c.type, severity: "medium",
        affected: { stop_ids: [reportTarget.stop_id], line_ids: [reportTarget.line_id], transfer_ids: [] },
      });
      setResult({ ok: true, out });
      refresh();
    } catch {
      setResult({ ok: false, msg: "Couldn't reach Pakka Check — start the backend to send reports." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title="Submit Transit Report" sub="Live Mumbai Unified Operations Center" icon="flag" iconCls="bg-tertiary-fixed text-tertiary" onClose={onClose}>
      {result ? (
        <div className="flex flex-col gap-3">
          {result.ok ? (
            <p className="flex items-start gap-2 rounded-xl bg-primary-soft p-3 text-sm text-primary-ink">
              <Icon name="check_circle" />
              {result.out
                ? `Received by Pakka Check at ${result.out.reported_at}. Current verdict: ${STATUS_STYLE[result.out.status].label} (${pct(result.out.confidence)}). New reporters start with a low weight until others confirm.`
                : "Logged. Facility defects don't change routes, so they aren't scored by Pakka Check."}
            </p>
          ) : (
            <p className="rounded-xl bg-amber-soft p-3 text-sm text-amber-ink">{result.msg}</p>
          )}
          <button onClick={onClose} className="self-end rounded-xl bg-primary px-5 py-2.5 text-xs font-semibold text-on-primary">Done</button>
        </div>
      ) : (
        <>
          <p className="text-[13px] text-on-surface-variant">
            This report is filed against <b>{reportTarget.label}</b>, the next stop on this trip.
          </p>
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-bold uppercase">Issue Category</span>
            <div className="grid grid-cols-2 gap-2">
              {reportCategories.map((c) => (
                <button key={c.id} type="button" onClick={() => setCat(c.id)} aria-pressed={cat === c.id}
                  className={`flex items-center gap-2 rounded-xl p-2 text-left text-xs font-semibold transition-colors ${cat === c.id ? "bg-primary-fixed text-on-primary-fixed" : "bg-container hover:bg-primary-fixed hover:text-on-primary-fixed"}`}>
                  <Icon name={c.icon} className={`text-[18px] ${c.iconCls}`} /> {c.label}
                </button>
              ))}
            </div>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold uppercase">Details (Optional)</span>
            <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={3} maxLength={500}
              placeholder="e.g. Coach 4 rear air vent blowing warm air, or heavy queue at exit turnstile..."
              className="w-full resize-none rounded-xl bg-container p-2 text-[13px] placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary" />
          </label>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button onClick={onClose} className="rounded-xl bg-container px-4 py-2.5 text-xs font-semibold hover:bg-container-high">Cancel</button>
            <button onClick={dispatch} disabled={busy} className="rounded-xl bg-primary px-5 py-2.5 text-xs font-semibold text-on-primary shadow-sm hover:bg-primary-container disabled:opacity-50">
              {busy ? "Sending…" : "Dispatch Report"}
            </button>
          </div>
        </>
      )}
    </ModalShell>
  );
}

function ShareModal({ onClose }: { onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <ModalShell title="Share Live Tracking" sub="Family & Colleague Safety Link" icon="share_location" iconCls="bg-primary-fixed text-primary" onClose={onClose}>
      <p className="text-[13px] text-on-surface-variant">{share.note}</p>
      <div className="flex items-center justify-between gap-2 rounded-xl bg-container p-2">
        <span className="truncate font-mono text-[13px]">{share.link}</span>
        <button onClick={() => { navigator.clipboard?.writeText(share.link).catch(() => undefined); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
          className="shrink-0 rounded-lg bg-primary px-2 py-1.5 text-[11px] font-bold text-on-primary">{copied ? "Copied!" : "Copy Link"}</button>
      </div>
      <div className="flex items-center justify-between text-[11px] font-bold text-on-surface-variant">
        <span className="flex items-center gap-1"><Icon name="info" className="text-[16px] text-primary" /> Sample link — sharing isn&apos;t live yet</span>
        <span className="text-primary">{share.expiry}</span>
      </div>
    </ModalShell>
  );
}

function SosModal({ onClose }: { onClose: () => void }) {
  return (
    <ModalShell title="Emergency SOS" sub="Prototype — no alert is sent" icon="emergency" iconCls="bg-error text-white" onClose={onClose}>
      <p className="text-sm">
        This button is a design placeholder. <b>It does not contact anyone.</b> In a real emergency, call:
      </p>
      <div className="grid grid-cols-2 gap-2">
        <a href="tel:112" className="flex flex-col rounded-xl bg-error-container p-3 text-on-error-container">
          <span className="text-2xl font-bold">112</span><span className="text-[13px]">Police / emergency</span>
        </a>
        <a href="tel:139" className="flex flex-col rounded-xl bg-container p-3">
          <span className="text-2xl font-bold">139</span><span className="text-[13px]">Railway helpline</span>
        </a>
      </div>
      <button onClick={onClose} className="self-end rounded-xl bg-container px-4 py-2.5 text-xs font-semibold hover:bg-container-high">Close</button>
    </ModalShell>
  );
}

function QrModal({ onClose }: { onClose: () => void }) {
  return (
    <ModalShell title="NCMC QR Ticket" sub="Sample ticket — not valid for travel" icon="qr_code_2" iconCls="bg-primary text-on-primary" onClose={onClose}>
      <div className="flex flex-col items-center gap-2 rounded-xl bg-container-low p-6">
        <Icon name="qr_code_2" className="text-[140px] text-slate" />
        <span className="font-mono text-[13px] text-on-surface-variant">Token #SAMPLE-0000</span>
      </div>
      <p className="text-[13px] text-on-surface-variant">Ticketing isn&apos;t part of this prototype; this shows where the pass would appear.</p>
      <button onClick={onClose} className="self-end rounded-xl bg-container px-4 py-2.5 text-xs font-semibold hover:bg-container-high">Close</button>
    </ModalShell>
  );
}
