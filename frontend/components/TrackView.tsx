"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getPlan, getTraveller, lines, stations, submitReport, updateClock, type ReportOut } from "@/lib/api";
import { eventTitle, evidenceSummary, legColor, lineShortName, MODE_LABEL, PLAN_LABEL, pct, placeName, STATUS_STYLE, TYPE_LABEL } from "@/lib/format";
import { positionAt, toMin } from "@/lib/geo";
import { activeEvents } from "@/lib/network";
import { clearTrip, loadTrip, type SavedTrip } from "@/lib/savedTrip";
import type { DisruptionEvent, Leg } from "@/lib/types";
import { useLiveEvents, useRefreshLiveEvents } from "@/lib/useLiveEvents";
import Icon from "./Icon";
import MapView from "./MapView";

type Phase = "done" | "now" | "next";

const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Stops a leg passes through (for matching disruptions). */
function legStops(leg: Leg): string[] {
  const line = leg.line_id ? lines[leg.line_id] : undefined;
  if (line) {
    const a = line.stations.indexOf(leg.from_id);
    const b = line.stations.indexOf(leg.to_id);
    if (a >= 0 && b >= 0) return line.stations.slice(Math.min(a, b), Math.max(a, b) + 1);
  }
  return [leg.from_id, leg.to_id].filter((s) => stations[s]);
}

function hits(ev: DisruptionEvent, leg: Leg): boolean {
  // A closed transfer (e.g. Dadar FOB) only affects the walk that uses it, not trains passing through.
  if (ev.affected.transfer_ids.length > 0) {
    return ev.affected.transfer_ids.some(
      (t) => t === `T_${leg.from_id}__${leg.to_id}` || t === `T_${leg.to_id}__${leg.from_id}`,
    );
  }
  if (leg.line_id && ev.affected.line_ids.includes(leg.line_id) && ev.affected.stop_ids.length === 0) return true;
  const stops = legStops(leg);
  return ev.affected.stop_ids.some((s) => stops.includes(s)) && (!leg.line_id || ev.affected.line_ids.length === 0 || ev.affected.line_ids.includes(leg.line_id));
}

export default function TrackView() {
  const live = useLiveEvents();
  const [trip, setTrip] = useState<SavedTrip | null>(null);
  const [example, setExample] = useState(false);
  const [reporting, setReporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<{ trip: SavedTrip; example: boolean } | null> {
      const saved = loadTrip();   // sessionStorage: browser only, so read after mount
      if (saved) return { trip: saved, example: false };
      // Nothing chosen yet: show Arjun's recommended route as an example.
      const t = getTraveller("TR3");
      if (!t) return null;
      const plan = await getPlan(t);
      const card = plan.cards.find((c) => c.recommended) ?? plan.cards[0];
      return { trip: { traveller: t, destination: plan.destination ?? t.destination, card, resultsHref: "/routes/TR3", savedAt: "" }, example: true };
    }
    load()
      .then((r) => {
        if (cancelled || !r) return;
        setTrip(r.trip);
        setExample(r.example);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const clockLive = live?.source === "backend" && Boolean(live.asOf);
  const legs = trip?.card.legs ?? [];
  const nowMin = clockLive ? toMin(live!.asOf!) : legs.length ? toMin(legs[0].depart) : 0;
  const phases: Phase[] = legs.map((l) => (nowMin >= toMin(l.arrive) ? "done" : nowMin >= toMin(l.depart) ? "now" : "next"));
  const events = useMemo(() => live?.events ?? [], [live]);
  const ahead = legs.flatMap((leg, i) =>
    phases[i] === "done" ? [] : events.filter((e) => e.status === "confirmed" && hits(e, leg)).map((e) => ({ e, i })),
  );

  if (!trip) return <p className="mx-auto w-full max-w-7xl px-6 py-6 text-on-surface-variant">Loading trip…</p>;

  const { traveller, card, destination } = trip;
  const start = toMin(legs[0].depart);
  const end = toMin(legs[legs.length - 1].arrive);
  const arrived = nowMin >= end;
  const notStarted = nowMin < start;
  const current = legs.findIndex((_, i) => phases[i] === "now");
  const remaining = Math.max(0, end - Math.max(nowMin, start));
  const deadline = traveller.arrive_by ? toMin(traveller.arrive_by) : null;
  const here = destination ? positionAt(card, nowMin, traveller.origin, destination) : null;
  const paid = legs.filter((_, i) => phases[i] !== "next").reduce((s, l) => s + l.cost_inr, 0);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-6 md:px-6">
      {example && (
        <p className="flex items-center gap-2 rounded-xl bg-secondary-container px-4 py-2.5 text-sm text-on-secondary-container">
          <Icon name="info" /> Showing an example trip. Pick a route on <Link href="/routes/TR3" className="font-semibold underline">Route Results</Link> and press <b>Start trip</b> to track your own.
        </p>
      )}

      {/* ---- Header ---- */}
      <section className="flex flex-wrap items-start gap-4">
        <span className="grid h-12 w-12 place-items-center rounded-xl bg-primary text-on-primary"><Icon name="navigation" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">Live trip</h1>
            <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase ${
              arrived ? "bg-container-high text-on-surface-variant" : notStarted ? "bg-secondary-container text-on-secondary-container" : "bg-primary-fixed text-on-primary-fixed"}`}>
              {!arrived && !notStarted && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />}
              {arrived ? "Arrived" : notStarted ? "Not started" : "Tracking"}
            </span>
          </div>
          <p className="text-sm text-on-surface-variant">
            {traveller.origin.label} → {destination?.label} · {PLAN_LABEL[card.label]} plan ·{" "}
            {legs.filter((l) => l.mode !== "walk").map((l) => (l.line_id ? lineShortName(l.line_id) : MODE_LABEL[l.mode])).join(" → ")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {clockLive && (
            <button onClick={() => updateClock({ advance_min: 5 })} className="btn-secondary" title="Move the demo clock forward">
              <Icon name="fast_forward" className="text-[18px]" /> +5 min
            </button>
          )}
          <Link href={trip.resultsHref} className="btn-secondary"><Icon name="alt_route" className="text-[18px]" /> Other routes</Link>
          {!example && (
            <Link href={trip.resultsHref} onClick={clearTrip} className="btn-secondary text-error"><Icon name="stop_circle" className="text-[18px]" /> End trip</Link>
          )}
        </div>
      </section>

      {/* ---- Stats ---- */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Remaining time" icon="timer" value={arrived ? "0" : String(remaining)} unit="min"
          foot={clockLive ? `Demo clock ${live!.asOf}` : "Start the backend to follow the demo clock"} />
        <StatCard label="Est. arrival" icon="flag" value={hhmm(end)}
          foot={deadline != null ? (end <= deadline ? `On time for ${traveller.arrive_by} (${deadline - end} min spare)` : `${end - deadline} min late for ${traveller.arrive_by}`) : "No deadline set"}
          tone={deadline != null && end > deadline ? "bad" : "ok"} />
        <StatCard label="Fare" icon="payments" value={`₹${card.cost_inr}`} foot={`₹${paid} spent so far · ${card.transfers} change${card.transfers === 1 ? "" : "s"}`} />
        <button onClick={() => setReporting(true)}
          className="flex flex-col justify-between gap-2 rounded-2xl border border-tertiary-fixed bg-tertiary-fixed/50 p-4 text-left transition hover:bg-tertiary-fixed">
          <span className="flex items-start justify-between">
            <span>
              <span className="text-[11px] font-bold uppercase tracking-wider text-tertiary">Seen a problem?</span>
              <span className="block text-xl font-bold">Report issue</span>
            </span>
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-tertiary text-white"><Icon name="report" /></span>
          </span>
          <span className="flex items-center justify-between text-[13px] font-semibold text-tertiary">
            Delay · closure · lift · crowding <Icon name="arrow_forward" className="text-[18px]" />
          </span>
        </button>
      </section>

      {/* ---- Disruption ahead ---- */}
      {ahead.length > 0 && (
        <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-error/30 bg-error-container p-4 text-on-error-container">
          <Icon name="warning" className="text-[28px]" fill />
          <div className="min-w-0 flex-1">
            <p className="font-bold">Confirmed disruption ahead on your route</p>
            <p className="text-sm">
              {ahead.map(({ e, i }) => `${eventTitle(e)} (step ${i + 1}, ${pct(e.confidence)}: ${evidenceSummary(e)})`).join(" · ")}
            </p>
          </div>
          <Link href={trip.resultsHref} className="btn-primary !bg-error">See alternatives</Link>
        </section>
      )}

      {/* ---- Current step strip ---- */}
      {current >= 0 && (
        <section className="card flex flex-wrap items-center gap-3 p-4">
          <span className="rounded-lg px-2.5 py-1 text-[12px] font-bold text-white" style={{ backgroundColor: legColor(legs[current]) }}>
            {legs[current].line_id ? lineShortName(legs[current].line_id!) : MODE_LABEL[legs[current].mode]}
          </span>
          <p className="min-w-0 flex-1 text-sm">
            <b>Now:</b> {placeName(legs[current].from_id, traveller, destination?.label)} → {placeName(legs[current].to_id, traveller, destination?.label)}
            <span className="text-on-surface-variant"> · arrive {legs[current].arrive} ({toMin(legs[current].arrive) - nowMin} min)</span>
          </p>
        </section>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        {/* ---- Milestones ---- */}
        <section className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Step by step</p>
              <h2 className="text-xl font-semibold">Journey milestones</h2>
            </div>
            <span className="rounded-full bg-container-low px-2.5 py-1 text-[12px] font-semibold">{legs.length} steps</span>
          </div>
          <ol className="relative flex flex-col gap-3">
            {legs.map((leg, i) => {
              const p = phases[i];
              const warn = events.filter((e) => (e.status === "confirmed" || e.status === "possible") && hits(e, leg));
              return (
                <li key={i} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${
                      p === "done" ? "bg-primary text-on-primary" : p === "now" ? "bg-primary-fixed text-primary ring-4 ring-primary-soft" : "bg-container-low text-on-surface-variant"}`}>
                      <Icon name={p === "done" ? "check" : leg.mode === "walk" ? "directions_walk" : leg.mode === "taxi" || leg.mode === "cab" || leg.mode === "auto" ? "local_taxi" : leg.mode === "bus" ? "directions_bus" : "train"} className="text-[20px]" />
                    </span>
                    {i < legs.length - 1 && (
                      <span className={`mt-1 w-0.5 flex-1 ${leg.mode === "walk" ? "border-l-2 border-dashed border-outline-variant" : p === "done" ? "bg-primary" : "bg-container-highest"}`} />
                    )}
                  </div>
                  <div className={`mb-1 min-w-0 flex-1 rounded-xl p-3 ${p === "now" ? "bg-primary-soft" : "bg-container-low/60"}`}>
                    <p className="flex flex-wrap items-center gap-2 font-semibold">
                      {leg.mode === "walk" ? "Walk" : leg.line_id ? lineShortName(leg.line_id) : MODE_LABEL[leg.mode]}
                      <span className="font-normal text-on-surface-variant">to</span> {placeName(leg.to_id, traveller, destination?.label)}
                      {p === "now" && <span className="rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold text-on-primary">LIVE</span>}
                    </p>
                    <p className="font-mono text-[12px] text-on-surface-variant">
                      {leg.depart}–{leg.arrive} · {leg.duration_min} min{leg.walk_m ? ` · ${leg.walk_m} m` : ""}{leg.cost_inr ? ` · ₹${leg.cost_inr}` : ""}
                    </p>
                    <p className="text-[13px] text-on-surface-variant">From {placeName(leg.from_id, traveller, destination?.label)}{leg.step_free ? " · step-free" : ""}</p>
                    {warn.map((e) => (
                      <p key={e.event_id} className={`mt-1.5 flex items-center gap-1 text-[12px] font-semibold ${e.status === "confirmed" ? "text-error" : "text-amber-ink"}`}>
                        <Icon name="warning" className="text-[16px]" /> {eventTitle(e)} · {STATUS_STYLE[e.status].label} {pct(e.confidence)}
                      </p>
                    ))}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        {/* ---- Map ---- */}
        <section className="flex flex-col gap-3 lg:sticky lg:top-20 lg:self-start">
          <div className="card relative h-[520px] overflow-hidden">
            {destination && <MapView card={card} origin={traveller.origin} destination={destination} events={activeEvents(events)} here={here} />}
            <span className="absolute right-3 top-3 z-[500] flex items-center gap-1.5 rounded-full bg-primary-fixed px-3 py-1 text-[12px] font-bold text-on-primary-fixed shadow-card">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              {arrived ? "Trip complete" : notStarted ? `Starts ${legs[0].depart}` : `Demo time ${hhmm(nowMin)}`}
            </span>
          </div>
          <p className="text-[12px] text-outline">
            Position is estimated from the timetable and the demo clock; dots are Pakka Check disruptions {clockLive ? "(live)" : "(sample)"}.
          </p>
        </section>
      </div>

      {reporting && <ReportIssue legs={legs} traveller={trip.traveller} destinationLabel={destination?.label} clockLive={clockLive} onClose={() => setReporting(false)} />}
    </main>
  );
}

function StatCard({ label, icon, value, unit, foot, tone = "ok" }: { label: string; icon: string; value: string; unit?: string; foot: string; tone?: "ok" | "bad" }) {
  return (
    <div className="card flex flex-col justify-between gap-2 p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">{label}</p>
          <p className="text-3xl font-bold tabular-nums">{value}{unit && <span className="ml-1 text-lg text-primary">{unit}</span>}</p>
        </div>
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-primary"><Icon name={icon} /></span>
      </div>
      <p className={`text-[13px] font-semibold ${tone === "bad" ? "text-error" : "text-primary-ink"}`}>{foot}</p>
    </div>
  );
}

const REPORT_TYPES = ["delay", "closure", "lift_out", "crowding", "waterlogging", "diversion"] as const;

function reporterId(): string {
  try {
    const existing = localStorage.getItem("travelbuddy.reporter");
    if (existing) return existing;
    const id = `web_${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem("travelbuddy.reporter", id);
    return id;
  } catch {
    return "web_anonymous";
  }
}

function ReportIssue({ legs, traveller, destinationLabel, clockLive, onClose }: {
  legs: Leg[]; traveller: SavedTrip["traveller"]; destinationLabel?: string; clockLive: boolean; onClose: () => void;
}) {
  const refresh = useRefreshLiveEvents();
  const stops = useMemo(() => {
    const out: { id: string; line: string | null }[] = [];
    for (const leg of legs) {
      for (const s of legStops(leg)) {
        if (!out.some((o) => o.id === s)) out.push({ id: s, line: leg.line_id && lines[leg.line_id]?.stations.includes(s) ? leg.line_id : null });
      }
    }
    return out;
  }, [legs]);
  const [stop, setStop] = useState(stops[0]?.id ?? "");
  const [type, setType] = useState<(typeof REPORT_TYPES)[number]>("delay");
  const [severity, setSeverity] = useState<"low" | "medium" | "high">("medium");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ReportOut | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (text.trim().length < 3) { setError("Describe what you see (a few words is enough)."); return; }
    setBusy(true);
    setError(null);
    try {
      const s = stops.find((x) => x.id === stop);
      const res = await submitReport({
        reporter_id: reporterId(), text: text.trim(), type, severity,
        affected: { stop_ids: [stop], line_ids: s?.line ? [s.line] : [], transfer_ids: [] },
      });
      setResult(res);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[1300] grid place-items-end sm:place-items-center" role="dialog" aria-modal="true" aria-labelledby="report-title">
      <button className="absolute inset-0 bg-slate/40" aria-label="Close" onClick={onClose} />
      <form onSubmit={send} className="relative flex w-full max-w-lg flex-col gap-4 rounded-t-2xl bg-container-lowest p-5 shadow-float sm:rounded-2xl">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-tertiary">Crowd report</p>
            <h2 id="report-title" className="text-xl font-bold">Report an issue on your route</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 hover:bg-container-low"><Icon name="close" /></button>
        </div>

        {result ? (
          <div className="flex flex-col gap-3">
            <p className="flex items-center gap-2 rounded-xl bg-primary-soft p-3 text-sm text-primary-ink">
              <Icon name="check_circle" /> Received at {result.reported_at}. {result.created_event ? "This starts a new report." : "It joined an existing report."}
            </p>
            <p className="text-sm">
              Current verdict: <b>{STATUS_STYLE[result.status].label}</b> at <b>{pct(result.confidence)}</b>.
            </p>
            <p className="text-[13px] text-on-surface-variant">
              New reporters start with a low weight so one account can&apos;t reroute everyone. It rises when other commuters, news or an
              official notice say the same thing.
            </p>
            <button type="button" onClick={onClose} className="btn-primary">Done</button>
          </div>
        ) : (
          <>
            {!clockLive && (
              <p className="rounded-xl bg-amber-soft p-3 text-sm text-amber-ink">Start the backend to send reports to Pakka Check.</p>
            )}
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-semibold">Where?</span>
              <select value={stop} onChange={(e) => setStop(e.target.value)} className="rounded-xl border border-hairline bg-container-lowest px-3 py-3">
                {stops.map((s) => <option key={s.id} value={s.id}>{placeName(s.id, traveller, destinationLabel)}{s.line ? ` (${lineShortName(s.line)})` : ""}</option>)}
              </select>
            </label>
            <div className="flex flex-col gap-1.5 text-sm">
              <span className="font-semibold">What&apos;s happening?</span>
              <div className="flex flex-wrap gap-2">
                {REPORT_TYPES.map((t) => (
                  <button key={t} type="button" onClick={() => setType(t)} aria-pressed={type === t}
                    className={`rounded-full px-3 py-1.5 text-[13px] font-semibold ${type === t ? "bg-tertiary text-white" : "bg-container-low"}`}>
                    {TYPE_LABEL[t] ?? t}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1.5 text-sm">
              <span className="font-semibold">How bad?</span>
              <div className="flex rounded-xl bg-container-low p-1">
                {(["low", "medium", "high"] as const).map((s) => (
                  <button key={s} type="button" onClick={() => setSeverity(s)} aria-pressed={severity === s}
                    className={`flex-1 rounded-lg py-2 text-[13px] font-semibold capitalize ${severity === s ? "bg-container-lowest shadow-card" : "text-on-surface-variant"}`}>{s}</button>
                ))}
              </div>
            </div>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-semibold">Describe it (any language)</span>
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={500}
                placeholder="e.g. Platform 2 pe 20 min se train nahi aayi"
                className="rounded-xl border border-hairline bg-container-lowest px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary" />
            </label>
            {error && <p role="alert" className="text-sm text-error">{error}</p>}
            <button type="submit" disabled={busy || !clockLive} className="btn-primary disabled:opacity-50">
              <Icon name="send" /> {busy ? "Sending…" : "Send report"}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
