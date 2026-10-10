"use client";

// Live Trip Tracking — the team's design (stitch: mobilink_web_live_trip_tracking_console), now on
// REAL data: the trip chosen with "Start trip" (saved as a journey for the replan monitor, B9),
// moved along by the demo clock, with Pakka Check problems on each leg and replan Accept / Reject.
// Sample-only parts (Share link, SOS) are clearly labelled.

import Link from "next/link";
import { Fragment, type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  decideReplan, getClock, getJourney, getPlan, lines, stations, submitReport, travellers, updateClock,
  type ClockState, type Journey, type LegHit, type ReportOut,
} from "@/lib/api";
import { lineShortName, MODE_LABEL, pct, placeName, PLAN_LABEL, STATUS_STYLE } from "@/lib/format";
import { positionAt, toMin } from "@/lib/geo";
import { activeLang, translate, useT } from "@/lib/i18n";
import { storyText } from "@/lib/i18n/messages/StoryPanel";
import { COMMON } from "@/lib/i18n/common";
import { M } from "@/lib/i18n/messages/TrackView";
import { reportCategories, share } from "@/lib/mockTracking";
import { recordReport } from "@/lib/profile";
import { reporterId } from "@/lib/reporter";
import { clearTrip, loadTrip, type SavedTrip, saveTrip, startTrip } from "@/lib/savedTrip";
import type { Leg, Mode, RouteCard } from "@/lib/types";
import { useLiveEvents, useRefreshLiveEvents } from "@/lib/useLiveEvents";
import Icon from "./Icon";
import Loader from "./Loader";
import MapView from "./MapView";

type Modal = null | "report" | "share" | "sos";
type LegState = "done" | "now" | "next";

const MODE_ICON: Record<string, string> = {
  local: "train", metro: "subway", bus: "directions_bus", walk: "directions_walk",
  taxi: "local_taxi", auto: "electric_rickshaw", cab: "directions_car", ferry: "directions_boat",
};

/** Fill a translated template, putting React nodes (e.g. bold text) where its {placeholders} are. */
function rich(text: string, nodes: Record<string, React.ReactNode>): React.ReactNode {
  return text.split(/(\{\w+\})/).map((part, i) => {
    const k = /^\{(\w+)\}$/.exec(part)?.[1];
    return <Fragment key={i}>{k && k in nodes ? nodes[k] : part}</Fragment>;
  });
}

const modeWord = (mode: string) => MODE_LABEL[mode as Mode] ?? mode;

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
function useJourney(id: string | null | undefined, fast = false): [Journey | null, (j: Journey) => void, boolean] {
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
    // While the demo clock plays, a problem can be "possible" for only a few real seconds: check every second.
    const t = setInterval(tick, fast ? 1000 : 3000);
    return () => { alive = false; clearInterval(t); };
  }, [id, fast]);
  return [id && !lost ? journey : null, setJourney, lost];
}

/* ---------------------------------------------------------------- page */

export default function TrackView() {
  const t = useT(M);
  const [trip, setTrip] = useState<SavedTrip | null | undefined>(undefined); // undefined = loading
  useEffect(() => {
    Promise.resolve().then(() => setTrip(loadTrip()));
  }, []);

  if (trip === undefined) return <main className="px-6 py-10 text-sm"><Loader label={t("loadingTrip")} /></main>;
  if (!trip) return <NoTrip onStarted={setTrip} />;
  return <LiveTrip trip={trip} onTrip={setTrip} />;
}

function LiveTrip({ trip, onTrip }: { trip: SavedTrip; onTrip: (t: SavedTrip | null) => void }) {
  const t = useT(M);
  const tc = useT(COMMON);
  const [modal, setModal] = useState<Modal>(null);
  const [clock, setClock] = useDemoClock();
  const [journey, setJourney, lost] = useJourney(trip.journeyId, (clock?.speed ?? 0) > 0);
  const live = useLiveEvents();

  // A new alert (heads-up or better route) pauses a playing demo clock, so nobody misses it on stage.
  const [autoPaused, setAutoPaused] = useState<number | null>(null); // the speed to resume at
  const [keptAuto, setKeptAuto] = useState(false); // the 20 s ran out and the route was kept
  const pauseForAlert = useRef<() => void>(() => undefined);
  useEffect(() => {
    pauseForAlert.current = () => {
      if (!clock || clock.speed <= 0) return;
      const prev = clock.speed;
      updateClock({ speed: 0 }).then((c) => { setClock(c); setAutoPaused(prev); }).catch(() => undefined);
    };
  });
  const proposalId = journey?.proposal?.proposal_id;
  useEffect(() => { if (proposalId) pauseForAlert.current(); }, [proposalId]);
  const resume = () => {
    if (autoPaused === null) return;
    updateClock({ speed: autoPaused }).then((c) => { setClock(c); setAutoPaused(null); }).catch(() => undefined);
  };

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
  const destLabel = destination?.label ?? tc("place.destination");
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
              <span className="text-lg font-semibold">{t("liveTrip")}</span>
              <PhasePill phase={phase} />
              <Link href="/admin" title={t("clockTitle")}
                className="flex items-center gap-1 rounded-full bg-container px-2 py-0.5 font-mono text-micro font-bold text-on-surface-variant hover:bg-container-high">
                <Icon name="schedule" className="text-[16px]" /> {clock ? `${t("demoTime", { time: clock.now })}${clock.speed ? ` · ${t("speedX", { n: clock.speed })}` : ` · ${t("paused")}`}` : t("clockOffline")}
              </Link>
              {clock && phase !== "arrived" && (
                <ClockButtons speed={clock.speed} onChange={setClock} />
              )}
            </div>
            <p className="truncate text-small text-on-surface-variant">
              {traveller.origin.label} → {destLabel} · {t("routeLabel", { label: PLAN_LABEL[card.label] ?? card.label })} · {routeText(legs)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setModal("sos")} className="flex items-center gap-1 rounded-xl bg-error px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition-transform hover:opacity-95 active:scale-95">
            <Icon name="emergency" className="text-[20px]" /> {t("sos")}
          </button>
          <button onClick={() => setModal("share")} className="flex items-center gap-1 rounded-xl bg-container-lowest px-4 py-2.5 text-xs font-semibold shadow-sm transition-colors hover:bg-container">
            <Icon name="share" className="text-[20px] text-primary" /> {t("shareLink")}
          </button>
          <button onClick={endTrip} className="flex items-center gap-1 rounded-xl bg-container-lowest px-4 py-2.5 text-xs font-semibold shadow-sm transition-colors hover:bg-container">
            <Icon name="stop_circle" className="text-[20px] text-outline" /> {t("endTrip")}
          </button>
        </div>
      </div>

      {/* ---- Demo story (TR1–TR5) ---- */}
      {traveller.demo?.kind === "track" && clock && phase !== "arrived" && (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-xl border-2 border-primary/30 bg-primary-fixed/20 p-3 text-small">
          <Icon name="theater_comedy" className="text-[20px] text-primary" />
          <span className="min-w-0 flex-1"><b>{t("storyLabel", { id: traveller.traveller_id })}</b> {rich(t("storyMoment"), { time: <b>{traveller.demo.moment}</b> })} {storyText(activeLang(), traveller.traveller_id, { watch: traveller.demo.watch }).watch}</span>
          {clock.now < traveller.demo.moment && (
            <button type="button" onClick={() => updateClock({ set: traveller.demo!.moment }).then(setClock).catch(() => undefined)}
              className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-caption font-bold text-on-primary hover:bg-primary-container">
              <Icon name="fast_forward" className="text-[18px]" /> {t("jumpTo", { time: traveller.demo.moment })}
            </button>
          )}
        </div>
      )}

      {/* ---- Replan proposal / notice ---- */}
      {journey?.proposal && (
        <ReplanBanner key={journey.proposal.event_ids.join("+")} journey={journey} name={name} onDecided={(j, auto) => {
          setJourney(j);
          resume(); // the trip carries on from here, on the route the rider chose
          if (auto) { setKeptAuto(true); setTimeout(() => setKeptAuto(false), 8000); }
        }} />
      )}
      {!journey?.proposal && keptAuto && (
        <div className="anim-in mb-2 flex items-start gap-2 rounded-xl bg-container p-3 text-small" role="status">
          <Icon name="timer_off" className="text-[20px] text-primary" /> {t("keptAuto")}
        </div>
      )}
      {trip.journeyId && phase !== "arrived" && (
        <HeadsUp journeyId={trip.journeyId} hits={hits} legs={legs} name={name} skip={journey?.proposal?.event_ids ?? []}
          onShow={pauseForAlert} paused={autoPaused !== null && clock?.speed === 0} onResume={resume} />
      )}
      {autoPaused !== null && clock?.speed === 0 && (
        <div className="anim-in mb-2 flex flex-wrap items-center gap-2 rounded-xl bg-container p-2.5 text-small">
          <Icon name="pause_circle" className="text-[20px] text-primary" />
          <span className="min-w-0 flex-1">{t("alertPaused")}</span>
          <button type="button" onClick={resume}
            className="flex min-h-9 items-center gap-1 rounded-lg bg-primary px-3 text-caption font-bold text-on-primary hover:bg-primary-container">
            <Icon name="play_arrow" className="text-[18px]" /> {t("resumeClock")}
          </button>
        </div>
      )}
      {!journey?.proposal && journey?.notice && (
        <div key={journey.notice} className="anim-in mb-2 flex items-start gap-2 rounded-xl bg-tertiary-fixed p-3 text-small text-tertiary">
          <Icon name="info" className="text-[20px]" /> {journey.notice}
        </div>
      )}
      {lost && (
        <div className="mb-2 flex items-start gap-2 rounded-xl bg-amber-soft p-3 text-small text-amber-ink">
          <Icon name="sync_problem" className="text-[20px]" />
          {t("lost")}
        </div>
      )}
      {!trip.journeyId && (
        <div className="mb-2 flex items-start gap-2 rounded-xl bg-amber-soft p-3 text-small text-amber-ink">
          <Icon name="cloud_off" className="text-[20px]" />
          {t("offlineTrip")}
        </div>
      )}

      {/* ---- 4 metric cards ---- */}
      <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label={phase === "upcoming" ? t("startsIn") : t("remaining")} icon="schedule" iconCls="bg-primary-fixed/40 text-primary"
          value={<><span className="text-display font-bold tracking-tight tabular-nums">{phase === "upcoming" ? startMin - nowMin : remaining}</span><span className="text-lg font-bold text-primary">{t("mins")}</span></>}
          footLeft={<span className="flex items-center gap-1 text-primary"><Icon name="update" className="text-[18px]" /> {t("followsClock")}</span>}
          footRight={<span className="font-mono text-micro font-bold text-outline">{t("tripMin", { min: card.duration_min })}</span>} />
        <MetricCard label={t("estArrival")} icon="sports_score" iconCls="bg-secondary-container text-on-secondary-container"
          value={<span className="text-display font-bold tracking-tight tabular-nums">{hhmm(eta)}</span>}
          footLeft={confirmedDelay > 0 || blocked
            ? <span className="flex items-center gap-1 font-semibold text-error"><Icon name="warning" className="text-[18px]" /> {blocked ? t("routeBlocked") : t("delayConfirmed", { min: confirmedDelay })}</span>
            : <span className="flex items-center gap-1 font-semibold text-primary"><Icon name="check_circle" className="text-[18px]" /> {t("onSchedule")}</span>}
          footRight={<span className="max-w-[9rem] truncate text-micro font-bold">{destLabel}</span>} />
        <MetricCard label={t("fare")} icon="payments" iconCls="bg-tertiary-fixed text-tertiary"
          value={<><span className="text-display font-bold tracking-tight tabular-nums">₹{card.cost_inr}</span><span className="text-xs font-semibold text-on-surface-variant">{t("total")}</span></>}
          footLeft={<span className="flex items-center gap-1 text-on-surface-variant"><span className="h-2 w-2 rounded-full bg-primary" /> {t("soFar", { amt: paid })}</span>}
          footRight={<span className="text-micro font-bold text-tertiary">{t(card.transfers === 1 ? "change1" : "changes", { n: card.transfers })}</span>} />
        <button onClick={() => setModal("report")} disabled={!target}
          className="group flex flex-col justify-between rounded-xl bg-gradient-to-br from-tertiary-fixed to-container p-5 text-left shadow-sm transition-all hover:shadow-md disabled:opacity-50">
          <div className="flex w-full items-start justify-between">
            <div className="flex flex-col">
              <span className="eyebrow text-tertiary">Pakka Check</span>
              <span className="mt-1 text-xl font-semibold transition-colors group-hover:text-tertiary">{t("reportIssue")}</span>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-tertiary text-on-primary transition-transform group-hover:scale-105">
              <Icon name="report_problem" className="text-[22px]" />
            </div>
          </div>
          <div className="mt-4 flex w-full items-center justify-between pt-1">
            <span className="truncate text-small text-tertiary">{target ? t("atPlace", { place: target.label }) : t("reportHint")}</span>
            <Icon name="arrow_forward" className="text-[20px] text-tertiary transition-transform group-hover:translate-x-1" />
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
                <span className="eyebrow">{t("stepByStep")}</span>
                <span className="text-lg font-semibold">{t("milestones")}</span>
              </div>
              <span className="rounded-full bg-container px-2 py-1 font-mono text-micro font-bold text-on-surface-variant">{t(legs.length === 1 ? "leg1" : "legs", { n: legs.length })}</span>
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
                <Icon name="alt_route" className="text-[20px]" /> {t("otherRoutes")}
              </Link>
              <Link href="/report" className="flex items-center justify-center gap-1.5 rounded-xl bg-container px-2 py-2.5 text-xs font-semibold shadow-sm transition-colors hover:bg-container-high">
                <Icon name="campaign" className="text-[20px]" /> {t("liveReports")}
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
                <div className="flex items-center gap-1.5 rounded-full bg-primary-fixed px-2 py-1 text-micro font-bold text-on-primary-fixed">
                  <span className={`tb-live-dot ${phase === "moving" ? "is-live" : ""}`} />
                  {phase === "moving" ? t("position") : phase === "upcoming" ? t("notStartedYet") : t("arrived")}
                </div>
              </div>
              <span className="text-small text-on-surface-variant">{mapEvents.length ? t(mapEvents.length === 1 ? "problem1" : "problems", { n: mapEvents.length }) : t("noProblems")}</span>
            </div>
            <div className="h-[520px] w-full">
              <MapView card={card} origin={traveller.origin} destination={destination} events={mapEvents} here={here} />
            </div>
            <div className="flex flex-wrap items-center gap-4 bg-container-lowest p-4 text-small">
              {legendFor(legs).map((l) => (
                <span key={l.label} className="flex items-center gap-1"><span className="h-1.5 w-4 rounded-full" style={{ background: l.color }} /> {l.label}</span>
              ))}
              <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full border-2 border-white bg-primary shadow" /> {t("you")}</span>
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
  const t = useT(M);
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
      setError(translate(M, "demoError"));
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
          <h1 className="text-xl font-semibold">{t("noTrip")}</h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            {rich(t("noTripBody"), { start: <b>{t("startTrip")}</b> })}
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row">
          <Link href="/plan" className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-on-primary hover:bg-primary-container">
            <Icon name="alt_route" className="text-[20px]" /> {t("planTrip")}
          </Link>
          <button onClick={startDemo} disabled={busy}
            className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-container px-4 py-3 text-sm font-semibold hover:bg-container-high disabled:opacity-50">
            <Icon name="play_circle" className="text-[20px] text-primary" /> {busy ? t("starting") : t("demoBtn")}
          </button>
        </div>
        <p className="text-caption text-outline">{t("demoNote")}</p>
        {error && <p className="rounded-xl bg-amber-soft px-3 py-2 text-small text-amber-ink">{error}</p>}
      </div>
    </main>
  );
}

/* ---------------------------------------------------------------- pieces */

function routeText(legs: Leg[]): string {
  const parts: string[] = [];
  for (const l of legs) {
    const p = l.line_id ? lineShortName(l.line_id) : l.mode === "walk" ? null : modeWord(l.mode);
    if (p && parts[parts.length - 1] !== p) parts.push(p);
  }
  return parts.join(" → ") || MODE_LABEL.walk;
}

function legendFor(legs: Leg[]) {
  const seen = new Map<string, string>();
  for (const l of legs) {
    if (l.line_id && lines[l.line_id]) seen.set(lineShortName(l.line_id), lines[l.line_id].color);
    else if (l.mode === "walk") seen.set(MODE_LABEL.walk, "#8a94a6");
    else seen.set(modeWord(l.mode), "#64748b");
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
  const t = useT(M);
  const set = (body: { speed?: number; advance_min?: number }) => updateClock(body).then(onChange).catch(() => undefined);
  const btn = "flex items-center gap-0.5 rounded-full bg-primary px-2 py-0.5 text-micro font-bold text-on-primary hover:bg-primary-container";
  return speed === 0 ? (
    <>
      <button type="button" onClick={() => set({ speed: 10 })} className={btn} title={t("play10Title")}>
        <Icon name="play_arrow" className="text-[16px]" /> {t("play10")}
      </button>
      <button type="button" onClick={() => set({ advance_min: 5 })} className={btn.replace("bg-primary ", "bg-container ").replace("text-on-primary", "text-on-surface")} title={t("jump5Title")}>
        {t("plus5")}
      </button>
    </>
  ) : (
    <button type="button" onClick={() => set({ speed: 0 })} className={btn.replace("bg-primary ", "bg-container ").replace("text-on-primary", "text-on-surface")}>
      <Icon name="pause" className="text-[16px]" /> {t("pause")}
    </button>
  );
}

function PhasePill({ phase }: { phase: "upcoming" | "moving" | "arrived" }) {
  const t = useT(M);
  const map = {
    upcoming: { text: t("notStarted"), cls: "bg-container-high text-on-surface-variant" },
    moving: { text: t("onTheWay"), cls: "bg-primary-fixed text-on-primary-fixed" },
    arrived: { text: t("arrived"), cls: "bg-secondary-container text-on-secondary-container" },
  }[phase];
  return (
    <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-micro font-bold uppercase ${map.cls}`}>
      {phase === "moving" && <span className="tb-live-dot is-live !h-1.5 !w-1.5" />} {map.text}
    </span>
  );
}

function CurrentLeg({ phase, leg, nowMin, name, destLabel }: {
  phase: "upcoming" | "moving" | "arrived"; leg: Leg | null; nowMin: number; name: (id: string) => string; destLabel: string;
}) {
  const t = useT(M);
  let badge = "";
  let title = "";
  let sub: React.ReactNode = null;
  if (phase === "arrived" || !leg) {
    badge = t("badgeDone");
    title = t("arrivedAt", { place: destLabel });
    sub = t("tripComplete");
  } else if (phase === "upcoming") {
    badge = leg.line_id ? lineShortName(leg.line_id) : modeWord(leg.mode);
    title = t("first", { step: legVerb(leg, name) });
    sub = rich(t("leavesAt", { min: toMin(leg.depart) - nowMin }), { time: <b className="text-primary">{leg.depart}</b> });
  } else if (leg.line_id) {
    const ns = nextStop(leg, nowMin);
    badge = lineShortName(leg.line_id);
    title = t("onLine", { line: lines[leg.line_id]?.name ?? lineShortName(leg.line_id), place: name(leg.to_id) });
    sub = rich(t("nextStop", { min: ns.inMin, place: name(leg.to_id), time: leg.arrive }), { stop: <b className="text-primary">{name(ns.id)}</b> });
  } else {
    badge = modeWord(leg.mode);
    title = legVerb(leg, name);
    sub = t("legLeft", { min: Math.max(0, toMin(leg.arrive) - nowMin), time: leg.arrive });
  }
  return (
    <div className="mt-4 flex flex-col items-start gap-2 rounded-xl bg-container-lowest p-4 shadow-sm sm:flex-row sm:items-center">
      <div className="flex shrink-0 items-center gap-1 rounded-lg bg-primary px-2 py-1 text-micro font-bold uppercase text-on-primary">
        <Icon name={leg ? MODE_ICON[leg.mode] ?? "route" : "flag"} className="text-[18px]" /> {badge}
      </div>
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-semibold">{title}</span>
        <span className="text-small text-on-surface-variant">{sub}</span>
      </div>
    </div>
  );
}

function legVerb(leg: Leg, name: (id: string) => string): string {
  if (leg.line_id) return translate(M, "board", { line: lineShortName(leg.line_id), from: name(leg.from_id), to: name(leg.to_id) });
  if (leg.mode === "walk") {
    const change = leg.from_id !== "origin" && leg.to_id !== "destination";
    return change
      ? translate(M, "changeWalk", { from: name(leg.from_id), to: name(leg.to_id) })
      : translate(M, "walkTo", { to: name(leg.to_id) });
  }
  return translate(M, "rideFrom", { mode: modeWord(leg.mode), from: name(leg.from_id), to: name(leg.to_id) });
}

function MetricCard({ label, icon, iconCls, value, footLeft, footRight }: {
  label: string; icon: string; iconCls: string; value: React.ReactNode; footLeft: React.ReactNode; footRight: React.ReactNode;
}) {
  return (
    <div className="flex flex-col justify-between rounded-xl bg-container-lowest p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="flex flex-col">
          <span className="eyebrow">{label}</span>
          <div className="mt-1 flex items-baseline gap-1">{value}</div>
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconCls}`}>
          <Icon name={icon} className="text-[22px]" />
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-2 pt-1 text-small">
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
  const t = useT(M);
  const stops = leg.line_id ? rideStops(leg).length - 1 : 0;
  return (
    <div className="relative flex items-start gap-4 pb-5">
      <div className={`absolute bottom-0 left-4 top-8 w-0.5 ${state === "done" || state === "now" ? "bg-primary" : "bg-container-highest"}`} />
      <div className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${NODE[state]}`}>
        {state === "now" ? (
          <>
            <span className="absolute h-3 w-3 animate-ping rounded-full bg-primary motion-reduce:animate-none motion-reduce:opacity-30" />
            <span className="relative h-3 w-3 rounded-full bg-primary" />
          </>
        ) : (
          <Icon name={state === "done" ? "check" : MODE_ICON[leg.mode] ?? "route"} className="text-[18px]" />
        )}
      </div>
      <div className={`flex min-w-0 flex-1 flex-col rounded-xl p-2 ${BOX[state]}`}>
        <div className="flex flex-wrap items-center justify-between gap-1">
          <div className="flex min-w-0 items-center gap-1">
            {leg.line_id && <span className="rounded bg-container-highest px-1.5 py-0.5 text-micro font-bold">{lineShortName(leg.line_id)}</span>}
            <span className={`text-sm ${state === "now" ? "font-bold text-primary" : "font-semibold"}`}>{legVerb(leg, name)}</span>
            {state === "now" && <span className="rounded-full bg-primary px-1 py-0.5 text-micro font-bold uppercase text-on-primary">{t("now")}</span>}
          </div>
          <span className={`font-mono text-micro font-bold ${state === "now" ? "text-primary" : "text-on-surface-variant"}`}>{leg.depart}–{leg.arrive}</span>
        </div>
        <p className="mt-0.5 text-small text-on-surface-variant">
          {t("durMin", { min: leg.duration_min })}{stops > 0 ? ` · ${t(stops === 1 ? "stop1" : "stops", { n: stops })}` : ""}{leg.cost_inr ? ` · ₹${leg.cost_inr}` : ""}
          {state === "now" && !leg.line_id ? ` · ${t("minLeft", { min: Math.max(0, toMin(leg.arrive) - nowMin) })}` : ""}
          {!leg.step_free ? ` · ${t("stairs")}` : ""}
        </p>
        {hits.map((h) => (
          <span key={h.event_id} className="mt-1 flex items-center gap-1 rounded-md px-2 py-1 text-micro font-semibold"
            style={{ background: h.status === "confirmed" ? "var(--error-container)" : "var(--tertiary-fixed)", color: h.status === "confirmed" ? "var(--on-error-container)" : "var(--tertiary)" }}>
            <Icon name={h.blocked ? "block" : "schedule"} className="text-[16px]" />
            {h.title} · {STATUS_STYLE[h.status].label} · {t("pctSure", { pct: pct(h.confidence) })}{h.blocked ? ` · ${t("cantUse")}` : h.delay_min ? ` · ${t("minLate", { min: h.delay_min })}` : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

function Arrival({ label, time, reached, delayed }: { label: string; time: string; reached: boolean; delayed: boolean }) {
  const t = useT(M);
  return (
    <div className="relative flex items-start gap-4">
      <div className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${reached ? NODE.done : "bg-container text-on-surface shadow-sm"}`}>
        <Icon name="flag" className="text-[18px]" />
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-xl p-2">
        <span className="text-sm font-bold">{t("arriveAt", { place: label })}</span>
        <span className={`font-mono text-micro font-bold ${delayed ? "text-error" : "text-on-surface-variant"}`}>{time}{delayed ? ` ${t("delayed")}` : ""}</span>
      </div>
    </div>
  );
}

function RouteProblems({ hits, connected, journeyId }: { hits: LegHit[]; connected: boolean; journeyId?: string | null }) {
  const t = useT(M);
  const unique = [...new Map(hits.map((h) => [h.event_id, h])).values()];
  return (
    <div className="flex flex-col rounded-xl bg-container-lowest p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Icon name="verified_user" className="text-[20px] text-primary" />
          <span className="text-sm font-semibold">{t("problemsTitle")}</span>
        </div>
        <span className="text-micro font-bold text-primary">Pakka Check</span>
      </div>
      {!journeyId ? (
        <p className="mt-3 text-small text-on-surface-variant">{t("needsServer")}</p>
      ) : !connected ? (
        <p className="mt-3 text-small text-on-surface-variant">{t("checking")}</p>
      ) : unique.length === 0 ? (
        <p className="mt-3 flex items-center gap-1 text-small text-primary"><Icon name="check_circle" className="text-[18px]" /> {t("nothingAhead")}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {unique.map((h) => (
            <li key={h.event_id} className="flex items-center justify-between gap-2 rounded-lg bg-container-low p-2">
              <span className="min-w-0">
                <Link href={`/events/${h.event_id}`} className="block truncate text-small font-semibold hover:text-primary hover:underline">{h.title}</Link>
                <span className="text-micro text-on-surface-variant">
                  {h.blocked ? t("blocksRoute") : h.delay_min ? t("aboutPlus", { min: h.delay_min }) : t("maySlow")}
                  {h.status === "possible" ? ` · ${t("notConfirmed")}` : ""}
                </span>
              </span>
              <span className="shrink-0 rounded-md px-2 py-0.5 text-micro font-bold"
                style={{ background: h.status === "confirmed" ? "var(--error-container)" : "var(--tertiary-fixed)", color: h.status === "confirmed" ? "var(--on-error-container)" : "var(--tertiary)" }}>
                {STATUS_STYLE[h.status].label} · {t("pctSure", { pct: pct(h.confidence) })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Pop-up (bottom of the screen, so the top bar and Emergency stay visible) for a POSSIBLE problem
 *  on a part of the trip still ahead: a precaution only. Each problem
 *  is shown once per trip (remembered in this browser). Once Pakka Check confirms it, the replan
 *  banner above takes over, so the heads-up for it goes away. */
function HeadsUp({ journeyId, hits, legs, name, skip, onShow, paused, onResume }: {
  journeyId: string; hits: LegHit[]; legs: Leg[]; name: (id: string) => string;
  /** Problems the replan banner is already about (e.g. after the demo clock was moved back). */
  skip: string[];
  /** Called once each time a new heads-up appears (pauses a playing demo clock). */
  onShow: RefObject<() => void>;
  paused: boolean;
  onResume: () => void;
}) {
  const t = useT(M);
  const key = `travelbuddy.headsUp.${journeyId}`;
  const [seen, setSeen] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(key) ?? "[]"); } catch { return []; }
  });
  const waiting = [...new Map(hits.filter((h) => h.status === "possible" && !seen.includes(h.event_id) && !skip.includes(h.event_id))
    .map((h) => [h.event_id, h])).values()];
  const h = waiting[0];
  const shownId = h?.event_id;
  useEffect(() => { if (shownId) onShow.current(); }, [shownId, onShow]);
  if (!h) return null;
  function dismiss() {
    const next = [...seen, h.event_id];
    setSeen(next);
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* private mode: show again next time */ }
  }
  const leg = legs[h.leg_idx];
  return (
    <div role="alert" key={h.event_id}
      className="anim-in fixed inset-x-4 bottom-24 z-[1250] flex flex-col gap-3 rounded-2xl border-l-4 border-tertiary bg-container-lowest p-4 shadow-float ring-1 ring-hairline sm:inset-x-auto sm:right-6 sm:w-[30rem]">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-tertiary-fixed text-tertiary">
          <Icon name="warning" className="text-[22px]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-body font-bold">{t("headsUpTitle")}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-small">
            <span className="font-semibold">{h.title}</span>
            <span className="rounded-md bg-tertiary-fixed px-2 py-0.5 text-micro font-bold text-tertiary">
              {STATUS_STYLE.possible.label} · {t("pctSure", { pct: pct(h.confidence) })}
            </span>
          </p>
          {leg && <p className="mt-1 text-small text-on-surface-variant">{t("headsUpWhere", { step: legVerb(leg, name) })}</p>}
          <p className="mt-1 text-small text-on-surface-variant">{t("headsUpWatch")}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={dismiss}
          className="min-h-10 rounded-xl bg-primary px-4 text-small font-semibold text-on-primary hover:bg-primary-container">{t("gotIt")}</button>
        <Link href={`/events/${h.event_id}`} className="flex min-h-10 items-center rounded-xl bg-container px-4 text-small font-semibold hover:bg-container-high">{t("seeDetails")}</Link>
        {paused && (
          <button type="button" onClick={onResume} className="flex min-h-10 items-center gap-1 rounded-xl bg-container px-3 text-small font-semibold hover:bg-container-high">
            <Icon name="play_arrow" className="text-[20px] text-primary" /> {t("resumeClock")}
          </button>
        )}
        {waiting.length > 1 && <span className="ml-auto text-caption text-on-surface-variant">{t("headsUpMore", { n: waiting.length - 1 })}</span>}
      </div>
    </div>
  );
}

/** Seconds the rider has to choose; then the original route is kept automatically. */
const AUTO_KEEP_S = 20;

function ReplanBanner({ journey, name, onDecided }: {
  journey: Journey; name: (id: string) => string;
  /** `auto` = nobody chose within AUTO_KEEP_S, so the route was kept for them. */
  onDecided: (j: Journey, auto: boolean) => void;
}) {
  const t = useT(M);
  const p = journey.proposal!;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Countdown in real seconds (not demo time). Mounted once per set of problems (keyed by their
  // event ids), so a re-issued proposal for the same problem doesn't restart it.
  const [leftMs, setLeftMs] = useState(AUTO_KEEP_S * 1000);
  const decided = useRef(false);
  const decideNow = useRef<(accept: boolean, auto: boolean) => void>(() => undefined);
  useEffect(() => {
    const end = Date.now() + AUTO_KEEP_S * 1000;
    const id = setInterval(() => {
      if (decided.current) { clearInterval(id); return; }
      const ms = Math.max(0, end - Date.now());
      setLeftMs(ms);
      if (ms === 0) { clearInterval(id); decideNow.current(false, true); }
    }, 250);
    return () => clearInterval(id);
  }, []);
  // Only the part that changes (legs already done are kept as they were).
  // (compared by route, not times: a delay on the ride you're on shifts its times but isn't "new")
  const same = (a?: Leg, b?: Leg) => !!a && !!b && a.mode === b.mode && a.line_id === b.line_id && a.from_id === b.from_id && a.to_id === b.to_id;
  const firstNew = p.new_card.legs.findIndex((l, k) => !same(l, journey.card.legs[k]));
  const newLegs = firstNew < 0 ? p.new_card.legs : p.new_card.legs.slice(firstNew);
  async function decide(accept: boolean, auto = false) {
    decided.current = true; // stops the countdown
    setBusy(true);
    setError(null);
    try {
      onDecided(await decideReplan(journey.journey_id, accept), auto);
    } catch {
      // The proposal may already be gone (decided in another tab, or the trip moved on): refresh
      // the trip and carry on instead of showing an error.
      const fresh = await getJourney(journey.journey_id).catch(() => null);
      if (fresh && !fresh.proposal) onDecided(fresh, auto);
      else { decided.current = false; setError(translate(M, "replanError")); }
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => { decideNow.current = decide; });
  return (
    <div className="anim-in mb-2 flex flex-col gap-3 rounded-xl border-2 border-error bg-container-lowest p-4 shadow-md" role="alert">
      <div className="flex items-start gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-error text-white"><Icon name="alt_route" className="text-[20px]" /></span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">{t("betterRoute")}</p>
          <p className="text-small text-on-surface-variant">{p.message}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-caption">
        <span className="rounded-md bg-container px-2 py-1 font-semibold">{t("fromPlace", { place: p.from_label, steps: newLegs.map((l) => legVerb(l, name)).join(" · ") })}</span>
        <span className="rounded-md bg-container px-2 py-1 font-semibold">{t("arriveTime", { time: p.new_card.legs[p.new_card.legs.length - 1].arrive })}</span>
        <span className={`rounded-md px-2 py-1 font-bold ${p.delta.min <= 0 ? "bg-primary-fixed text-on-primary-fixed" : "bg-tertiary-fixed text-tertiary"}`}>
          {p.delta.min > 0 ? t("minLater", { min: p.delta.min }) : p.delta.min < 0 ? t("minSooner", { min: -p.delta.min }) : t("sameTime")}
        </span>
        <span className="rounded-md bg-container px-2 py-1 font-bold">{p.delta.inr > 0 ? t("costMore", { amt: p.delta.inr }) : p.delta.inr < 0 ? t("costLess", { amt: -p.delta.inr }) : t("sameFare")}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => decide(true)} disabled={busy} className="min-h-10 rounded-xl bg-primary px-4 text-small font-semibold text-on-primary hover:bg-primary-container disabled:opacity-50">
          {t("switchRoute")}
        </button>
        <button onClick={() => decide(false)} disabled={busy} className="min-h-10 rounded-xl bg-container px-4 text-small font-semibold hover:bg-container-high disabled:opacity-50">
          {t("keepRoute")}
        </button>
        {!busy && <AutoKeepTimer ms={leftMs} total={AUTO_KEEP_S * 1000} />}
      </div>
      {error && <p className="text-caption text-error">{error}</p>}
    </div>
  );
}

/** The 20-second "auto-keep" countdown: a ring that drains around the seconds left, the same
 *  height as the buttons beside it. Turns gold under 10 s and red (gently pulsing) under 5 s. */
function AutoKeepTimer({ ms, total }: { ms: number; total: number }) {
  const t = useT(M);
  const s = Math.ceil(ms / 1000);
  const r = 14;
  const c = 2 * Math.PI * r;
  const tone = s <= 5 ? "text-error" : s <= 10 ? "text-tertiary" : "text-primary";
  return (
    <span role="timer" aria-label={t("autoKeepAria", { n: s })} title={t("autoKeepAria", { n: s })}
      className={`flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-current/8 py-1 pl-1 pr-3 ring-1 ring-current/30 ${tone}`}>
      <span className={`relative grid h-8 w-8 place-items-center ${s <= 5 ? "motion-safe:animate-pulse" : ""}`}>
        <svg viewBox="0 0 32 32" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden>
          <circle cx="16" cy="16" r={r} fill="var(--surface-container-lowest)" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
          <circle cx="16" cy="16" r={r} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={c * (1 - ms / total)} style={{ transition: "stroke-dashoffset 250ms linear" }} />
        </svg>
        <span className="relative text-small font-extrabold tabular-nums leading-none">{s}</span>
      </span>
      <span className="text-caption font-bold">{t("autoKeep")}</span>
    </span>
  );
}

/* ---------------------------------------------------------------- modals */

function ModalShell({ title, sub, icon, iconCls, onClose, children }: {
  title: string; sub: string; icon: string; iconCls: string; onClose: () => void; children: React.ReactNode;
}) {
  const tc = useT(COMMON);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[1300] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <button className="anim-backdrop absolute inset-0 bg-scrim backdrop-blur-sm" aria-label={tc("close")} onClick={onClose} />
      <div className="anim-dialog relative flex w-full max-w-lg flex-col gap-4 rounded-2xl bg-container-lowest p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconCls}`}><Icon name={icon} className="text-[24px]" /></div>
            <div className="flex flex-col">
              <span className="text-lg font-semibold">{title}</span>
              <span className="text-small text-on-surface-variant">{sub}</span>
            </div>
          </div>
          <button onClick={onClose} aria-label={tc("close")} className="flex h-8 w-8 items-center justify-center rounded-lg text-outline hover:bg-container">
            <Icon name="close" className="text-[20px]" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ReportModal({ target, onClose }: { target: { stop_id: string; line_id: string | null; label: string }; onClose: () => void }) {
  const t = useT(M);
  const tc = useT(COMMON);
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
        // sent to Pakka Check in English (c.label); the commuter's own words go as typed
        text: details.trim() || `${c.label} near ${target.label}`,
        type: c.type, severity: "medium",
        affected: { stop_ids: [target.stop_id], line_ids: target.line_id ? [target.line_id] : [], transfer_ids: [] },
      });
      setResult({ ok: true, out });
      recordReport(out.event_id, t("reportText", { what: t(`cat.${c.id}`), place: target.label }));
      refresh();
    } catch {
      setResult({ ok: false, msg: t("sendError") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title={t("reportTitle")} sub={t("reportSub")} icon="flag" iconCls="bg-tertiary-fixed text-tertiary" onClose={onClose}>
      {result ? (
        <div className="flex flex-col gap-3">
          {result.ok ? (
            <p className="tb-success flex items-start gap-2 rounded-xl bg-primary-soft p-3 text-sm text-primary-ink">
              <Icon name="check_circle" />
              {result.out
                ? t("received", { time: result.out.reported_at, status: STATUS_STYLE[result.out.status].label, pct: pct(result.out.confidence) })
                : t("facilityLogged")}
            </p>
          ) : (
            <p className="rounded-xl bg-amber-soft p-3 text-sm text-amber-ink">{result.msg}</p>
          )}
          <button onClick={onClose} className="self-end rounded-xl bg-primary px-5 py-2.5 text-xs font-semibold text-on-primary">{t("doneBtn")}</button>
        </div>
      ) : (
        <>
          <p className="text-small text-on-surface-variant">
            {rich(t("filedAgainst"), { place: <b>{target.label}</b> })}
          </p>
          <div className="flex flex-col gap-1">
            <span className="text-micro font-bold uppercase">{t("category")}</span>
            <div className="grid grid-cols-2 gap-2">
              {reportCategories.map((c) => (
                <button key={c.id} type="button" onClick={() => setCat(c.id)} aria-pressed={cat === c.id}
                  className={`flex items-center gap-2 rounded-xl p-2 text-left text-xs font-semibold transition-colors ${cat === c.id ? "bg-primary-fixed text-on-primary-fixed" : "bg-container hover:bg-primary-fixed hover:text-on-primary-fixed"}`}>
                  <Icon name={c.icon} className={`text-[20px] ${c.iconCls}`} /> {t(`cat.${c.id}`)}
                </button>
              ))}
            </div>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-micro font-bold uppercase">{t("details")}</span>
            <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={3} maxLength={500}
              placeholder={t("detailsPh")}
              className="w-full resize-none rounded-xl bg-container p-2 text-small placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary" />
          </label>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button onClick={onClose} className="rounded-xl bg-container px-4 py-2.5 text-xs font-semibold hover:bg-container-high">{tc("cancel")}</button>
            <button onClick={dispatch} disabled={busy} className="rounded-xl bg-primary px-5 py-2.5 text-xs font-semibold text-on-primary shadow-sm hover:bg-primary-container disabled:opacity-50">
              {busy ? t("sending") : t("sendReport")}
            </button>
          </div>
        </>
      )}
    </ModalShell>
  );
}

function ShareModal({ destLabel, eta, onClose }: { destLabel: string; eta: string; onClose: () => void }) {
  const t = useT(M);
  const [copied, setCopied] = useState(false);
  return (
    <ModalShell title={t("shareTitle")} sub={t("shareSub")} icon="share_location" iconCls="bg-primary-fixed text-primary" onClose={onClose}>
      <p className="text-small text-on-surface-variant">{t("shareBody", { time: eta, place: destLabel })}</p>
      <div className="flex items-center justify-between gap-2 rounded-xl bg-container p-2">
        <span className="truncate font-mono text-small">{share.link}</span>
        <button onClick={() => { navigator.clipboard?.writeText(share.link).catch(() => undefined); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
          className="shrink-0 rounded-lg bg-primary px-2 py-1.5 text-micro font-bold text-on-primary">{copied ? t("copied") : t("copyLink")}</button>
      </div>
      <div className="flex items-center gap-1 text-micro font-bold text-on-surface-variant">
        <Icon name="info" className="text-[18px] text-primary" /> {t("sampleLink")}
      </div>
    </ModalShell>
  );
}

function SosModal({ onClose }: { onClose: () => void }) {
  const t = useT(M);
  const tc = useT(COMMON);
  return (
    <ModalShell title={t("sos")} sub={t("sosSub")} icon="emergency" iconCls="bg-error text-white" onClose={onClose}>
      <p className="text-sm">
        {rich(t("sosBody"), { bold: <b>{t("sosBold")}</b> })}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <a href="tel:112" className="flex flex-col rounded-xl bg-error-container p-3 text-on-error-container">
          <span className="text-2xl font-bold">112</span><span className="text-small">{t("police")}</span>
        </a>
        <a href="tel:139" className="flex flex-col rounded-xl bg-container p-3">
          <span className="text-2xl font-bold">139</span><span className="text-small">{t("railway")}</span>
        </a>
      </div>
      <button onClick={onClose} className="self-end rounded-xl bg-container px-4 py-2.5 text-xs font-semibold hover:bg-container-high">{tc("close")}</button>
    </ModalShell>
  );
}
