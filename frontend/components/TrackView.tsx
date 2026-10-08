"use client";

// Live Trip Tracking — the team's design (stitch: mobilink_web_live_trip_tracking_console), now on
// REAL data: the trip chosen with "Start trip" (saved as a journey for the replan monitor, B9),
// moved along by the demo clock, with Pakka Check problems on each leg and replan Accept / Reject.
// Sample-only parts (Share link, SOS) are clearly labelled.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  decideReplan, getClock, getJourney, getPlan, lines, stations, submitReport, travellers, updateClock,
  type ClockState, type Journey, type LegHit, type ReportOut,
} from "@/lib/api";
import { lineShortName, pct, placeName, STATUS_STYLE } from "@/lib/format";
import { positionAt, toMin } from "@/lib/geo";
import { reportCategories, share } from "@/lib/mockTracking";
import { reporterId } from "@/lib/reporter";
import { clearTrip, loadTrip, type SavedTrip, saveTrip, startTrip } from "@/lib/savedTrip";
import type { Leg, RouteCard } from "@/lib/types";
import { useLiveEvents, useRefreshLiveEvents } from "@/lib/useLiveEvents";
import Icon from "./Icon";
import MapView from "./MapView";

type Modal = null | "report" | "share" | "sos";
type LegState = "done" | "now" | "next";

const MODE_ICON: Record<string, string> = {
  local: "train", metro: "subway", bus: "directions_bus", walk: "directions_walk",
  taxi: "local_taxi", auto: "electric_rickshaw", cab: "directions_car", ferry: "directions_boat",
};

const hhmm = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/* ---------------------------------------------------------------- data hooks */

/** The demo clock from the backend (moves when the presenter plays it on Demo control). */
function useDemoClock(): [ClockState | null, (c: ClockState) => void] {
  const [clock, setClock] = useState<ClockState | null>(null);
  useEffect(() => {
    let alive = true;
    const tick = () => getClock().then((c) => alive && setClock(c)).catch(() => alive && setClock(null));
    tick();
    const id = setInterval(tick, 2000);
    return () => { alive = false; clearInterval(id); };
  }, []);
  return [clock, setClock];
}

/** The saved journey from the backend: status, problems on each leg, replan proposal. */
function useJourney(id: string | null | undefined): [Journey | null, (j: Journey) => void, boolean] {
  const [journey, setJourney] = useState<Journey | null>(null);
  const [lost, setLost] = useState(false); // the server restarted / was reset and no longer knows this trip
  useEffect(() => {
    if (!id) return;
    let alive = true;
    const tick = () =>
      getJourney(id)
        .then((j) => { if (alive) { setJourney(j); setLost(false); } })
        .catch((e: Error) => { if (alive && e.message.includes("404")) setLost(true); });
    tick();
    const t = setInterval(tick, 3000);
    return () => { alive = false; clearInterval(t); };
  }, [id]);
  return [id && !lost ? journey : null, setJourney, lost];
}

/* ---------------------------------------------------------------- page */

export default function TrackView() {
  const [trip, setTrip] = useState<SavedTrip | null | undefined>(undefined); // undefined = loading
  useEffect(() => {
    Promise.resolve().then(() => setTrip(loadTrip()));
  }, []);

  if (trip === undefined) return <main className="px-6 py-10 text-sm text-on-surface-variant">Loading your trip…</main>;
  if (!trip) return <NoTrip onStarted={setTrip} />;
  return <LiveTrip trip={trip} onTrip={setTrip} />;
}

function LiveTrip({ trip, onTrip }: { trip: SavedTrip; onTrip: (t: SavedTrip | null) => void }) {
  const [modal, setModal] = useState<Modal>(null);
  const [clock, setClock] = useDemoClock();
  const [journey, setJourney, lost] = useJourney(trip.journeyId);
  const live = useLiveEvents();

  // The backend's copy wins: after an accepted replan the card changes there.
  const card: RouteCard = journey?.card ?? trip.card;
  useEffect(() => {
    if (journey && journey.card.plan_id !== trip.card.plan_id) {
      const next = { ...trip, card: journey.card };
      saveTrip(next);
      onTrip(next);
    }
  }, [journey, trip, onTrip]);

  const { traveller } = trip;
  const destination = trip.destination ?? traveller.destination ?? null;
  const destLabel = destination?.label ?? "Destination";
  const legs = card.legs;
  const startMin = toMin(legs[0].depart);
  const endMin = toMin(legs[legs.length - 1].arrive);
  const nowMin = clock ? toMin(clock.now) : startMin;

  const states: LegState[] = legs.map((l) => (toMin(l.arrive) <= nowMin ? "done" : toMin(l.depart) <= nowMin ? "now" : "next"));
  const phase = nowMin < startMin ? "upcoming" : nowMin >= endMin ? "arrived" : "moving";
  const currentIdx = states.indexOf("now");
  const nextIdx = states.findIndex((s) => s !== "done");

  const hits = useMemo(() => journey?.live_hits ?? [], [journey]);
  const confirmedDelay = useMemo(() => {
    const perEvent = new Map<string, number>();
    for (const h of hits) if (h.status === "confirmed") perEvent.set(h.event_id, Math.max(perEvent.get(h.event_id) ?? 0, h.delay_min));
    return [...perEvent.values()].reduce((a, b) => a + b, 0);
  }, [hits]);
  const blocked = hits.some((h) => h.status === "confirmed" && h.blocked);

  const eta = endMin + confirmedDelay;
  const remaining = Math.max(0, eta - Math.max(nowMin, startMin));
  const paid = legs.filter((l, i) => states[i] !== "next" || toMin(l.depart) <= nowMin).reduce((a, l) => a + l.cost_inr, 0);

  const here = phase === "moving" ? positionAt(card, nowMin, traveller.origin, destination) : null;
  const hitIds = new Set(hits.map((h) => h.event_id));
  const mapEvents = (live?.events ?? []).filter((e) => hitIds.has(e.event_id));

  const name = (id: string) => placeName(id, traveller, destLabel);
  const current = currentIdx >= 0 ? legs[currentIdx] : nextIdx >= 0 ? legs[nextIdx] : null;
  const target = reportTargetFor(legs, Math.max(0, currentIdx >= 0 ? currentIdx : nextIdx), nowMin);

  function endTrip() {
    clearTrip();
    onTrip(null);
  }

  return (
    <main className="flex w-full flex-col px-4 pb-6 md:px-6">
      {/* ---- Top control bar ---- */}
      <div className="flex flex-col justify-between gap-4 py-4 lg:flex-row lg:items-center">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-on-primary shadow-sm">
            <Icon name={MODE_ICON[current?.mode ?? "local"] ?? "route"} className="text-[26px]" />
          </div>
          <div className="flex min-w-0 flex-col">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-semibold">Live Trip</span>
              <PhasePill phase={phase} />
              <Link href="/admin" title="The demo runs on a simulated clock — move it on Demo control"
                className="flex items-center gap-1 rounded-full bg-container px-2 py-0.5 font-mono text-[11px] font-bold text-on-surface-variant hover:bg-container-high">
                <Icon name="schedule" className="text-[14px]" /> {clock ? `Demo time ${clock.now}${clock.speed ? ` · ${clock.speed}×` : " · paused"}` : "Demo clock offline"}
              </Link>
              {clock && phase !== "arrived" && (
                <ClockButtons speed={clock.speed} onChange={setClock} />
              )}
            </div>
            <p className="truncate text-[13px] text-on-surface-variant">
              {traveller.origin.label} → {destLabel} · {card.label} route · {routeText(legs)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setModal("sos")} className="flex items-center gap-1 rounded-xl bg-error px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition-transform hover:opacity-95 active:scale-95">
            <Icon name="emergency" className="text-[18px]" /> Emergency SOS
          </button>
          <button onClick={() => setModal("share")} className="flex items-center gap-1 rounded-xl bg-container-lowest px-4 py-2.5 text-xs font-semibold shadow-sm transition-colors hover:bg-container">
            <Icon name="share" className="text-[18px] text-primary" /> Share Live Link
          </button>
          <button onClick={endTrip} className="flex items-center gap-1 rounded-xl bg-container-lowest px-4 py-2.5 text-xs font-semibold shadow-sm transition-colors hover:bg-container">
            <Icon name="stop_circle" className="text-[18px] text-outline" /> End trip
          </button>
        </div>
      </div>

      {/* ---- Replan proposal / notice ---- */}
      {journey?.proposal && (
        <ReplanBanner journey={journey} name={name} onDecided={setJourney} />
      )}
      {!journey?.proposal && journey?.notice && (
        <div className="mb-2 flex items-start gap-2 rounded-xl bg-tertiary-fixed p-3 text-[13px] text-tertiary">
          <Icon name="info" className="text-[18px]" /> {journey.notice}
        </div>
      )}
      {lost && (
        <div className="mb-2 flex items-start gap-2 rounded-xl bg-amber-soft p-3 text-[13px] text-amber-ink">
          <Icon name="sync_problem" className="text-[18px]" />
          The demo was reset, so the server no longer knows this trip (no replan alerts). End it and start again to watch it live.
        </div>
      )}
      {!trip.journeyId && (
        <div className="mb-2 flex items-start gap-2 rounded-xl bg-amber-soft p-3 text-[13px] text-amber-ink">
          <Icon name="cloud_off" className="text-[18px]" />
          The TravelBuddy server wasn&apos;t reachable when this trip started, so it is tracked on this device only (no replan alerts).
        </div>
      )}

      {/* ---- 4 metric cards ---- */}
      <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label={phase === "upcoming" ? "Starts In" : "Remaining Time"} icon="schedule" iconCls="bg-primary-fixed/40 text-primary"
          value={<><span className="text-[32px] font-bold leading-10 tracking-tight">{phase === "upcoming" ? startMin - nowMin : remaining}</span><span className="text-lg font-bold text-primary">mins</span></>}
          footLeft={<span className="flex items-center gap-1 text-primary"><Icon name="update" className="text-[16px]" /> Follows the demo clock</span>}
          footRight={<span className="font-mono text-[11px] font-bold text-outline">{card.duration_min} min trip</span>} />
        <MetricCard label="Est. Arrival" icon="sports_score" iconCls="bg-secondary-container text-on-secondary-container"
          value={<span className="text-[32px] font-bold leading-10 tracking-tight">{hhmm(eta)}</span>}
          footLeft={confirmedDelay > 0 || blocked
            ? <span className="flex items-center gap-1 font-semibold text-error"><Icon name="warning" className="text-[16px]" /> {blocked ? "Route blocked" : `+${confirmedDelay} min (confirmed)`}</span>
            : <span className="flex items-center gap-1 font-semibold text-primary"><Icon name="check_circle" className="text-[16px]" /> On schedule</span>}
          footRight={<span className="max-w-[9rem] truncate text-[11px] font-bold">{destLabel}</span>} />
        <MetricCard label="Fare" icon="payments" iconCls="bg-tertiary-fixed text-tertiary"
          value={<><span className="text-[32px] font-bold leading-10 tracking-tight">₹{card.cost_inr}</span><span className="text-xs font-semibold text-on-surface-variant">total</span></>}
          footLeft={<span className="flex items-center gap-1 text-on-surface-variant"><span className="h-2 w-2 rounded-full bg-primary" /> ₹{paid} so far</span>}
          footRight={<span className="text-[11px] font-bold text-tertiary">{card.transfers} change{card.transfers === 1 ? "" : "s"}</span>} />
        <button onClick={() => setModal("report")} disabled={!target}
          className="group flex flex-col justify-between rounded-xl bg-gradient-to-br from-tertiary-fixed to-container p-5 text-left shadow-sm transition-all hover:shadow-md disabled:opacity-50">
          <div className="flex w-full items-start justify-between">
            <div className="flex flex-col">
              <span className="text-[11px] font-bold uppercase tracking-wider text-tertiary">Pakka Check</span>
              <span className="mt-1 text-xl font-semibold transition-colors group-hover:text-tertiary">Report Issue</span>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-tertiary text-white transition-transform group-hover:scale-105">
              <Icon name="report_problem" className="text-[22px]" />
            </div>
          </div>
          <div className="mt-4 flex w-full items-center justify-between pt-1">
            <span className="truncate text-[13px] text-tertiary">{target ? `At ${target.label}` : "Delay • Crowding • Lift out"}</span>
            <Icon name="arrow_forward" className="text-[18px] text-tertiary transition-transform group-hover:translate-x-1" />
          </div>
        </button>
      </div>

      {/* ---- Current leg strip ---- */}
      <CurrentLeg phase={phase} leg={current} nowMin={nowMin} name={name} destLabel={destLabel} />

      {/* ---- Split panes ---- */}
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-12">
        {/* Left: milestones + problems */}
        <div className="flex flex-col gap-4 lg:col-span-5">
          <div className="flex flex-col rounded-xl bg-container-lowest p-5 shadow-sm">
            <div className="flex items-center justify-between pb-2">
              <div className="flex flex-col">
                <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Your route, step by step</span>
                <span className="text-lg font-semibold">Journey Milestones</span>
              </div>
              <span className="rounded-full bg-container px-2 py-1 font-mono text-[11px] font-bold text-on-surface-variant">{legs.length} legs</span>
            </div>
            <div className="relative mt-4 flex flex-col">
              {legs.map((leg, i) => (
                <Milestone key={`${card.plan_id}-${i}`} leg={leg} state={states[i]} name={name}
                  hits={hits.filter((h) => h.leg_idx === i)} nowMin={nowMin} />
              ))}
              <Arrival label={destLabel} time={hhmm(eta)} reached={phase === "arrived"} delayed={confirmedDelay > 0} />
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2 pt-2">
              <Link href={trip.resultsHref} className="flex items-center justify-center gap-1.5 rounded-xl bg-container px-2 py-2.5 text-xs font-semibold shadow-sm transition-colors hover:bg-container-high">
                <Icon name="alt_route" className="text-[18px]" /> Other routes
              </Link>
              <Link href="/report" className="flex items-center justify-center gap-1.5 rounded-xl bg-container px-2 py-2.5 text-xs font-semibold shadow-sm transition-colors hover:bg-container-high">
                <Icon name="campaign" className="text-[18px]" /> Live reports
              </Link>
            </div>
          </div>

          <RouteProblems hits={hits} connected={Boolean(journey)} journeyId={trip.journeyId} />
        </div>

        {/* Right: live map */}
        <div className="flex flex-col gap-4 lg:col-span-7">
          <div className="relative flex flex-col overflow-hidden rounded-xl bg-container-lowest shadow-sm">
            <div className="z-20 flex items-center justify-between bg-container-lowest p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 rounded-full bg-primary-fixed px-2 py-1 text-[11px] font-bold text-on-primary-fixed">
                  <span className={`h-2 w-2 rounded-full bg-primary ${phase === "moving" ? "animate-ping" : ""}`} />
                  {phase === "moving" ? "Your position (from the timetable)" : phase === "upcoming" ? "Not started yet" : "Arrived"}
                </div>
              </div>
              <span className="text-[13px] text-on-surface-variant">{mapEvents.length ? `${mapEvents.length} problem${mapEvents.length === 1 ? "" : "s"} on route` : "No problems on route"}</span>
            </div>
            <div className="h-[520px] w-full">
              <MapView card={card} origin={traveller.origin} destination={destination} events={mapEvents} here={here} />
            </div>
            <div className="flex flex-wrap items-center gap-4 bg-container-lowest p-4 text-[13px]">
              {legendFor(legs).map((l) => (
                <span key={l.label} className="flex items-center gap-1"><span className="h-1.5 w-4 rounded-full" style={{ background: l.color }} /> {l.label}</span>
              ))}
              <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full border-2 border-white bg-primary shadow" /> You</span>
            </div>
          </div>
        </div>
      </div>

      {modal === "report" && target && <ReportModal target={target} onClose={() => setModal(null)} />}
      {modal === "share" && <ShareModal destLabel={destLabel} eta={hhmm(eta)} onClose={() => setModal(null)} />}
      {modal === "sos" && <SosModal onClose={() => setModal(null)} />}
    </main>
  );
}

/* ---------------------------------------------------------------- no trip yet */

function NoTrip({ onStarted }: { onStarted: (t: SavedTrip) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Demo: Arjun (TR3) Thane → Wankhede on the route via the Dadar foot-overbridge, which Pakka Check
  // confirms closed at 17:15 — so the replan alert shows up on this page.
  const startDemo = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const tr3 = travellers.find((t) => t.traveller_id === "TR3")!;
      const traveller = { ...tr3, traveller_id: "CUSTOM" };            // CUSTOM → the real routing engine
      const plan = await getPlan(traveller);
      const viaDadar = plan.cards.find((c) => c.legs.some((l) => l.mode === "walk" && [l.from_id, l.to_id].sort().join() === "dadar_cr,dadar_wr"));
      const card = viaDadar ?? plan.cards[0];
      if (!card) throw new Error("no route");
      const saved = await startTrip({ traveller, destination: traveller.destination, card, resultsHref: "/routes/TR3", savedAt: new Date().toISOString() });
      onStarted(saved);
    } catch {
      setError("Couldn't plan the demo trip — is the backend running on port 8000?");
    } finally {
      setBusy(false);
    }
  }, [onStarted]);

  return (
    <main className="flex w-full flex-col items-center px-4 py-16 md:px-6">
      <div className="flex w-full max-w-lg flex-col items-center gap-4 rounded-2xl bg-container-lowest p-8 text-center shadow-sm">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-fixed text-primary">
          <Icon name="fmd_good" className="text-[30px]" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">No trip in progress</h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Plan a route and press <b>Start trip</b>. This page then follows you leg by leg and warns you if
            Pakka Check confirms a problem on the way.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row">
          <Link href="/plan" className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-on-primary hover:bg-primary-container">
            <Icon name="alt_route" className="text-[18px]" /> Plan a trip
          </Link>
          <button onClick={startDemo} disabled={busy}
            className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-container px-4 py-3 text-sm font-semibold hover:bg-container-high disabled:opacity-50">
            <Icon name="play_circle" className="text-[18px] text-primary" /> {busy ? "Starting…" : "Demo: Thane → Wankhede"}
          </button>
        </div>
        <p className="text-[12px] text-outline">Demo trip: Arjun&apos;s route via the Dadar foot-overbridge (leaves 16:44). Reset and play the clock on Demo control.</p>
        {error && <p className="rounded-xl bg-amber-soft px-3 py-2 text-[13px] text-amber-ink">{error}</p>}
      </div>
    </main>
  );
}

/* ---------------------------------------------------------------- pieces */

function routeText(legs: Leg[]): string {
  const parts: string[] = [];
  for (const l of legs) {
    const p = l.line_id ? lineShortName(l.line_id) : l.mode === "walk" ? null : l.mode[0].toUpperCase() + l.mode.slice(1);
    if (p && parts[parts.length - 1] !== p) parts.push(p);
  }
  return parts.join(" → ") || "Walk";
}

function legendFor(legs: Leg[]) {
  const seen = new Map<string, string>();
  for (const l of legs) {
    if (l.line_id && lines[l.line_id]) seen.set(lineShortName(l.line_id), lines[l.line_id].color);
    else if (l.mode === "walk") seen.set("Walk", "#8a94a6");
    else seen.set(l.mode[0].toUpperCase() + l.mode.slice(1), "#334155");
  }
  return [...seen].map(([label, color]) => ({ label, color }));
}

/** Stops a ride passes, in travel order. */
function rideStops(leg: Leg): string[] {
  const line = leg.line_id ? lines[leg.line_id] : undefined;
  if (!line) return [leg.from_id, leg.to_id];
  const a = line.stations.indexOf(leg.from_id);
  const b = line.stations.indexOf(leg.to_id);
  if (a < 0 || b < 0) return [leg.from_id, leg.to_id];
  return a <= b ? line.stations.slice(a, b + 1) : line.stations.slice(b, a + 1).reverse();
}

/** Next stop on a ride at `nowMin` (stops spread evenly over the ride time). */
function nextStop(leg: Leg, nowMin: number): { id: string; inMin: number } {
  const stops = rideStops(leg);
  const a = toMin(leg.depart);
  const b = toMin(leg.arrive);
  const n = stops.length - 1;
  if (n <= 0 || b <= a) return { id: leg.to_id, inMin: Math.max(0, b - nowMin) };
  const passed = Math.floor(((nowMin - a) / (b - a)) * n);
  const idx = Math.min(n, Math.max(1, passed + 1));
  return { id: stops[idx], inMin: Math.max(0, Math.round(a + ((b - a) * idx) / n - nowMin)) };
}

/** Where a report from this trip is filed: the next station on the route, with its line. */
function reportTargetFor(legs: Leg[], from: number, nowMin: number): { stop_id: string; line_id: string | null; label: string } | null {
  for (let i = from; i < legs.length; i++) {
    const leg = legs[i];
    const stop = leg.line_id && toMin(leg.depart) <= nowMin ? nextStop(leg, nowMin).id : leg.line_id ? leg.from_id : leg.to_id;
    if (stop && stop !== "origin" && stop !== "destination") {
      const label = `${stations[stop]?.name ?? stop}${leg.line_id ? ` (${lineShortName(leg.line_id)})` : ""}`;
      return { stop_id: stop, line_id: leg.line_id, label };
    }
  }
  return null;
}

/** The demo clock is paused after a reset; let the presenter play it from here (same as Demo control). */
function ClockButtons({ speed, onChange }: { speed: number; onChange: (c: ClockState) => void }) {
  const set = (body: { speed?: number; advance_min?: number }) => updateClock(body).then(onChange).catch(() => undefined);
  const btn = "flex items-center gap-0.5 rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-on-primary hover:bg-primary-container";
  return speed === 0 ? (
    <>
      <button type="button" onClick={() => set({ speed: 10 })} className={btn} title="Play the demo clock at 10× (1 demo minute every 6 seconds)">
        <Icon name="play_arrow" className="text-[14px]" /> Play 10×
      </button>
      <button type="button" onClick={() => set({ advance_min: 5 })} className={btn.replace("bg-primary ", "bg-container ").replace("text-on-primary", "text-on-surface")} title="Jump 5 demo minutes ahead">
        +5 min
      </button>
    </>
  ) : (
    <button type="button" onClick={() => set({ speed: 0 })} className={btn.replace("bg-primary ", "bg-container ").replace("text-on-primary", "text-on-surface")}>
      <Icon name="pause" className="text-[14px]" /> Pause
    </button>
  );
}

function PhasePill({ phase }: { phase: "upcoming" | "moving" | "arrived" }) {
  const map = {
    upcoming: { text: "Not started", cls: "bg-container-high text-on-surface-variant" },
    moving: { text: "On the way", cls: "bg-primary-fixed text-on-primary-fixed" },
    arrived: { text: "Arrived", cls: "bg-secondary-container text-on-secondary-container" },
  }[phase];
  return (
    <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${map.cls}`}>
      {phase === "moving" && <span className="h-1.5 w-1.5 animate-ping rounded-full bg-primary" />} {map.text}
    </span>
  );
}

function CurrentLeg({ phase, leg, nowMin, name, destLabel }: {
  phase: "upcoming" | "moving" | "arrived"; leg: Leg | null; nowMin: number; name: (id: string) => string; destLabel: string;
}) {
  let badge = "";
  let title = "";
  let sub: React.ReactNode = null;
  if (phase === "arrived" || !leg) {
    badge = "Done";
    title = `You have arrived at ${destLabel}`;
    sub = "Trip complete. Thanks for travelling with TravelBuddy.";
  } else if (phase === "upcoming") {
    badge = leg.line_id ? lineShortName(leg.line_id) : leg.mode;
    title = `First: ${legVerb(leg, name)}`;
    sub = <>Leaves at <b className="text-primary">{leg.depart}</b> ({toMin(leg.depart) - nowMin} min from now)</>;
  } else if (leg.line_id) {
    const ns = nextStop(leg, nowMin);
    badge = lineShortName(leg.line_id);
    title = `On ${lines[leg.line_id]?.name ?? lineShortName(leg.line_id)} towards ${name(leg.to_id)}`;
    sub = <>Next stop: <b className="text-primary">{name(ns.id)}</b> in about {ns.inMin} min · get off at {name(leg.to_id)} at {leg.arrive}</>;
  } else {
    badge = leg.mode;
    title = legVerb(leg, name);
    sub = <>{Math.max(0, toMin(leg.arrive) - nowMin)} min left on this leg · arrive {leg.arrive}</>;
  }
  return (
    <div className="mt-4 flex flex-col items-start gap-2 rounded-xl bg-container-lowest p-4 shadow-sm sm:flex-row sm:items-center">
      <div className="flex shrink-0 items-center gap-1 rounded-lg bg-primary px-2 py-1 text-[11px] font-bold uppercase text-on-primary">
        <Icon name={leg ? MODE_ICON[leg.mode] ?? "route" : "flag"} className="text-[16px]" /> {badge}
      </div>
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-semibold">{title}</span>
        <span className="text-[13px] text-on-surface-variant">{sub}</span>
      </div>
    </div>
  );
}

function legVerb(leg: Leg, name: (id: string) => string): string {
  if (leg.line_id) return `Board ${lineShortName(leg.line_id)} at ${name(leg.from_id)} → ${name(leg.to_id)}`;
  if (leg.mode === "walk") {
    const change = leg.from_id !== "origin" && leg.to_id !== "destination";
    return change ? `Change: walk from ${name(leg.from_id)} to ${name(leg.to_id)}` : `Walk to ${name(leg.to_id)}`;
  }
  const word = { taxi: "Taxi", auto: "Auto", cab: "Cab", bus: "Bus", ferry: "Ferry" }[leg.mode as string] ?? leg.mode;
  return `${word} from ${name(leg.from_id)} to ${name(leg.to_id)}`;
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

const NODE: Record<LegState, string> = {
  done: "bg-primary text-on-primary shadow-sm",
  now: "bg-primary-fixed text-primary shadow-sm",
  next: "bg-container-high text-on-surface-variant",
};
const BOX: Record<LegState, string> = { done: "bg-container-low/70", now: "bg-primary-fixed/20", next: "bg-container-low/40" };

function Milestone({ leg, state, name, hits, nowMin }: {
  leg: Leg; state: LegState; name: (id: string) => string; hits: LegHit[]; nowMin: number;
}) {
  const stops = leg.line_id ? rideStops(leg).length - 1 : 0;
  return (
    <div className="relative flex items-start gap-4 pb-5">
      <div className={`absolute bottom-0 left-4 top-8 w-0.5 ${state === "done" || state === "now" ? "bg-primary" : "bg-container-highest"}`} />
      <div className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${NODE[state]}`}>
        {state === "now" ? (
          <>
            <span className="absolute h-3 w-3 animate-ping rounded-full bg-primary" />
            <span className="relative h-3 w-3 rounded-full bg-primary" />
          </>
        ) : (
          <Icon name={state === "done" ? "check" : MODE_ICON[leg.mode] ?? "route"} className="text-[16px]" />
        )}
      </div>
      <div className={`flex min-w-0 flex-1 flex-col rounded-xl p-2 ${BOX[state]}`}>
        <div className="flex flex-wrap items-center justify-between gap-1">
          <div className="flex min-w-0 items-center gap-1">
            {leg.line_id && <span className="rounded bg-container-highest px-1.5 py-0.5 text-[11px] font-bold">{lineShortName(leg.line_id)}</span>}
            <span className={`text-sm ${state === "now" ? "font-bold text-primary" : "font-semibold"}`}>{legVerb(leg, name)}</span>
            {state === "now" && <span className="rounded-full bg-primary px-1 py-0.5 text-[11px] font-bold uppercase text-on-primary">Now</span>}
          </div>
          <span className={`font-mono text-[11px] font-bold ${state === "now" ? "text-primary" : "text-on-surface-variant"}`}>{leg.depart}–{leg.arrive}</span>
        </div>
        <p className="mt-0.5 text-[13px] text-on-surface-variant">
          {leg.duration_min} min{stops > 0 ? ` · ${stops} stop${stops === 1 ? "" : "s"}` : ""}{leg.cost_inr ? ` · ₹${leg.cost_inr}` : ""}
          {state === "now" && !leg.line_id ? ` · ${Math.max(0, toMin(leg.arrive) - nowMin)} min left` : ""}
          {!leg.step_free ? " · stairs" : ""}
        </p>
        {hits.map((h) => (
          <span key={h.event_id} className="mt-1 flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold"
            style={{ background: h.status === "confirmed" ? "var(--error-container)" : "var(--tertiary-fixed)", color: h.status === "confirmed" ? "var(--on-error-container)" : "var(--tertiary)" }}>
            <Icon name={h.blocked ? "block" : "schedule"} className="text-[14px]" />
            {h.title} · {STATUS_STYLE[h.status].label} {pct(h.confidence)}{h.blocked ? " · can't be used" : h.delay_min ? ` · +${h.delay_min} min` : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

function Arrival({ label, time, reached, delayed }: { label: string; time: string; reached: boolean; delayed: boolean }) {
  return (
    <div className="relative flex items-start gap-4">
      <div className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${reached ? NODE.done : "bg-container text-on-surface shadow-sm"}`}>
        <Icon name="flag" className="text-[16px]" />
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-xl p-2">
        <span className="text-sm font-bold">Arrive: {label}</span>
        <span className={`font-mono text-[11px] font-bold ${delayed ? "text-error" : "text-on-surface-variant"}`}>{time}{delayed ? " (delayed)" : ""}</span>
      </div>
    </div>
  );
}

function RouteProblems({ hits, connected, journeyId }: { hits: LegHit[]; connected: boolean; journeyId?: string | null }) {
  const unique = [...new Map(hits.map((h) => [h.event_id, h])).values()];
  return (
    <div className="flex flex-col rounded-xl bg-container-lowest p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Icon name="verified_user" className="text-[20px] text-primary" />
          <span className="text-sm font-semibold">Problems on the rest of your route</span>
        </div>
        <span className="text-[11px] font-bold text-primary">Pakka Check</span>
      </div>
      {!journeyId ? (
        <p className="mt-3 text-[13px] text-on-surface-variant">Live checks need the TravelBuddy server.</p>
      ) : !connected ? (
        <p className="mt-3 text-[13px] text-on-surface-variant">Checking…</p>
      ) : unique.length === 0 ? (
        <p className="mt-3 flex items-center gap-1 text-[13px] text-primary"><Icon name="check_circle" className="text-[16px]" /> Nothing reported on the legs ahead.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {unique.map((h) => (
            <li key={h.event_id} className="flex items-center justify-between gap-2 rounded-lg bg-container-low p-2">
              <span className="min-w-0">
                <Link href={`/events/${h.event_id}`} className="block truncate text-[13px] font-semibold hover:text-primary hover:underline">{h.title}</Link>
                <span className="text-[11px] text-on-surface-variant">
                  {h.blocked ? "Blocks this route" : h.delay_min ? `About +${h.delay_min} min` : "May slow you down"}
                  {h.status === "possible" ? " · not confirmed yet, no action needed" : ""}
                </span>
              </span>
              <span className="shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold"
                style={{ background: h.status === "confirmed" ? "var(--error-container)" : "var(--tertiary-fixed)", color: h.status === "confirmed" ? "var(--on-error-container)" : "var(--tertiary)" }}>
                {STATUS_STYLE[h.status].label} {pct(h.confidence)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ReplanBanner({ journey, name, onDecided }: { journey: Journey; name: (id: string) => string; onDecided: (j: Journey) => void }) {
  const p = journey.proposal!;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Only the part that changes (legs already done are kept as they were).
  const firstNew = p.new_card.legs.findIndex((l, k) => JSON.stringify(l) !== JSON.stringify(journey.card.legs[k]));
  const newLegs = firstNew < 0 ? p.new_card.legs : p.new_card.legs.slice(firstNew);
  async function decide(accept: boolean) {
    setBusy(true);
    setError(null);
    try {
      onDecided(await decideReplan(journey.journey_id, accept));
    } catch {
      setError("Couldn't reach the server — try again in a moment.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mb-2 flex flex-col gap-3 rounded-xl border-2 border-error bg-container-lowest p-4 shadow-md" role="alert">
      <div className="flex items-start gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-error text-white"><Icon name="alt_route" className="text-[20px]" /></span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">Better route suggested</p>
          <p className="text-[13px] text-on-surface-variant">{p.message}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <span className="rounded-md bg-container px-2 py-1 font-semibold">From {p.from_label}: {newLegs.map((l) => legVerb(l, name)).join(" · ")}</span>
        <span className="rounded-md bg-container px-2 py-1 font-semibold">Arrive {p.new_card.legs[p.new_card.legs.length - 1].arrive}</span>
        <span className={`rounded-md px-2 py-1 font-bold ${p.delta.min <= 0 ? "bg-primary-fixed text-on-primary-fixed" : "bg-tertiary-fixed text-tertiary"}`}>
          {p.delta.min > 0 ? "+" : ""}{p.delta.min} min
        </span>
        <span className="rounded-md bg-container px-2 py-1 font-bold">{p.delta.inr >= 0 ? "+" : "−"}₹{Math.abs(p.delta.inr)}</span>
      </div>
      <div className="flex gap-2">
        <button onClick={() => decide(true)} disabled={busy} className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-on-primary hover:bg-primary-container disabled:opacity-50">
          Switch to new route
        </button>
        <button onClick={() => decide(false)} disabled={busy} className="rounded-xl bg-container px-4 py-2 text-xs font-semibold hover:bg-container-high disabled:opacity-50">
          Keep my route
        </button>
      </div>
      {error && <p className="text-[12px] text-error">{error}</p>}
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

function ReportModal({ target, onClose }: { target: { stop_id: string; line_id: string | null; label: string }; onClose: () => void }) {
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
        reporter_id: reporterId(),
        text: details.trim() || `${c.label} near ${target.label}`,
        type: c.type, severity: "medium",
        affected: { stop_ids: [target.stop_id], line_ids: target.line_id ? [target.line_id] : [], transfer_ids: [] },
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
    <ModalShell title="Report a problem" sub="Checked by Pakka Check before it changes anyone's route" icon="flag" iconCls="bg-tertiary-fixed text-tertiary" onClose={onClose}>
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
            This report is filed against <b>{target.label}</b>, the next stop on your trip.
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
              placeholder="e.g. Train stopped between stations for 10 minutes, heavy queue at the exit…"
              className="w-full resize-none rounded-xl bg-container p-2 text-[13px] placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary" />
          </label>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button onClick={onClose} className="rounded-xl bg-container px-4 py-2.5 text-xs font-semibold hover:bg-container-high">Cancel</button>
            <button onClick={dispatch} disabled={busy} className="rounded-xl bg-primary px-5 py-2.5 text-xs font-semibold text-on-primary shadow-sm hover:bg-primary-container disabled:opacity-50">
              {busy ? "Sending…" : "Send report"}
            </button>
          </div>
        </>
      )}
    </ModalShell>
  );
}

function ShareModal({ destLabel, eta, onClose }: { destLabel: string; eta: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <ModalShell title="Share Live Tracking" sub="Family & colleague safety link" icon="share_location" iconCls="bg-primary-fixed text-primary" onClose={onClose}>
      <p className="text-[13px] text-on-surface-variant">Recipients would see your progress and expected {eta} arrival at {destLabel}.</p>
      <div className="flex items-center justify-between gap-2 rounded-xl bg-container p-2">
        <span className="truncate font-mono text-[13px]">{share.link}</span>
        <button onClick={() => { navigator.clipboard?.writeText(share.link).catch(() => undefined); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
          className="shrink-0 rounded-lg bg-primary px-2 py-1.5 text-[11px] font-bold text-on-primary">{copied ? "Copied!" : "Copy Link"}</button>
      </div>
      <div className="flex items-center gap-1 text-[11px] font-bold text-on-surface-variant">
        <Icon name="info" className="text-[16px] text-primary" /> Sample link — sharing isn&apos;t live yet
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
