"use client";

// Route Results — the team's design (stitch: mobilink_web_route_results_comparison) on real data:
// disruption-aware plans from POST /plan (A5), each with score, reliability, live problems and
// fares; mode filter + sort; map with the active selection; trade-off matrix; and a side-by-side
// with what a schedule-only app would show for the same trip (PS: compare).

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getBaselinePlan, getClock, getPlan, planRequest, RoutingNotConnected, stations } from "@/lib/api";
import { legColor, lineShortName, MODE_LABEL, PLAN_LABEL, pct, placeName, readableRoute } from "@/lib/format";
import { toMin } from "@/lib/geo";
import { activeLang, translate, useT, type Vars } from "@/lib/i18n";
import { storyText } from "@/lib/i18n/messages/StoryPanel";
import { COMMON } from "@/lib/i18n/common";
import { M, type RouteResultsKey } from "@/lib/i18n/messages/RouteResults";
import { activeEvents } from "@/lib/network";
import { startTrip } from "@/lib/savedTrip";
import { recordPlanned, recordStarted } from "@/lib/profile";
import { tripHref } from "@/lib/tripUrl";
import type { Leg, Mode, PlanLabel, PlanResponse, RouteCard, Traveller } from "@/lib/types";
import { useLiveEvents } from "@/lib/useLiveEvents";
import Icon from "./Icon";
import MapView from "./MapView";
import StoryPanel from "./StoryPanel";

type Plan = PlanResponse & { sample?: boolean };
type State = { status: "loading" } | { status: "error"; message: string } | { status: "not_connected" } | { status: "ready"; plan: Plan };

const LABEL_STYLE: Record<PlanLabel, { icon: string; chip: string; title: RouteResultsKey }> = {
  optimal: { icon: "auto_awesome", chip: "bg-primary-fixed text-on-primary-fixed", title: "label.optimal" },
  fastest: { icon: "bolt", chip: "bg-secondary-container text-on-secondary-container", title: "label.fastest" },
  cheapest: { icon: "savings", chip: "bg-tertiary-fixed text-tertiary", title: "label.cheapest" },
};
const REL_STYLE = {
  green: "bg-primary-soft text-primary-ink",
  yellow: "bg-amber-soft text-amber-ink",
  red: "bg-error-container text-on-error-container",
} as const;

const FILTERS: { id: string; label: RouteResultsKey; icon: string; modes: Mode[] | null }[] = [
  { id: "all", label: "filter.all", icon: "all_inclusive", modes: null },
  { id: "metro", label: "filter.metro", icon: "subway", modes: ["metro"] },
  { id: "local", label: "filter.local", icon: "train", modes: ["local"] },
  { id: "bus", label: "filter.bus", icon: "directions_bus", modes: ["bus"] },
  { id: "road", label: "filter.road", icon: "local_taxi", modes: ["auto", "taxi", "cab"] },
];

function km(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/** Text in the active language, for helpers that run during render. */
function tr(key: RouteResultsKey, vars?: Vars): string {
  return translate(M, key, vars);
}


/** Backend "avoided a confirmed problem" notes, in any app language (see backend app/i18n.py note.avoided). */
const isAvoided = (note: string) => /^(Avoided|टाला गया|टाळले):/.test(note);

export default function RouteResults({ traveller }: { traveller: Traveller | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const live = useLiveEvents();
  const t = useT(M);
  const [state, setState] = useState<State>({ status: "loading" });
  const [baseline, setBaseline] = useState<PlanResponse | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [copied, setCopied] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!traveller) return;
    let cancelled = false;
    getPlan(traveller)
      .then((plan) => {
        if (cancelled) return;
        setState({ status: "ready", plan });
        recordPlanned(traveller, window.location.pathname + window.location.search);
        setSelectedId((plan.cards.find((c) => c.recommended) ?? plan.cards[0])?.plan_id ?? null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState(err instanceof RoutingNotConnected ? { status: "not_connected" } : { status: "error", message: String(err) });
      });
    getBaselinePlan(traveller).then((b) => !cancelled && setBaseline(b)).catch(() => undefined);
    return () => { cancelled = true; };
  }, [traveller, reloadKey]);

  const plan = state.status === "ready" ? state.plan : null;
  const active = useMemo(() => activeEvents(live?.events), [live]);
  const destination = plan?.destination ?? traveller?.destination ?? null;
  const ordered = useMemo(() => {
    const order: PlanLabel[] = ["optimal", "fastest", "cheapest"];
    return plan ? [...plan.cards].sort((a, b) => Number(b.recommended) - Number(a.recommended) || order.indexOf(a.label) - order.indexOf(b.label)) : [];
  }, [plan]);
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.id, ordered.filter((c) => usesModes(c, f.modes)).length])), [ordered]);
  const shown = ordered.filter((c) => usesModes(c, FILTERS.find((f) => f.id === filter)!.modes));
  const selected = plan?.cards.find((c) => c.plan_id === selectedId) ?? null;

  if (!traveller) return <p className="mx-auto w-full max-w-7xl px-6 py-6">{t("broken")}</p>;

  async function startTracking(card: RouteCard) {
    const qs = search.toString();
    const fresh = await freshCard(traveller!, card);
    await startTrip({ traveller: traveller!, destination, card: fresh, resultsHref: qs ? `${pathname}?${qs}` : pathname, savedAt: new Date().toISOString() });
    recordStarted(traveller!, fresh.label);
    router.push("/track");
  }

  const departText = traveller.leave_at ? t("departAt", { time: traveller.leave_at }) : traveller.arrive_by
    ? t(traveller.hard_deadline ? "mustArriveBy" : "arriveBy", { time: traveller.arrive_by })
    : plan?.as_of ? t("departNowAsOf", { time: plan.as_of }) : t("departNow");
  const constraints = [
    traveller.arrive_by && traveller.leave_at && { icon: "flag", text: t(traveller.hard_deadline ? "mustArriveBy" : "arriveBy", { time: traveller.arrive_by }) },
    traveller.max_budget_inr && { icon: "payments", text: `≤ ₹${traveller.max_budget_inr}` },
    traveller.max_walk_min && { icon: "directions_walk", text: t("c.walk", { n: traveller.max_walk_min }) },
    traveller.max_transfers != null && { icon: "sync_alt", text: t("c.changes", { n: traveller.max_transfers }) },
    traveller.step_free && { icon: "accessible", text: t("c.stepFree") },
    traveller.heavy_luggage && { icon: "luggage", text: t("c.luggage") },
    traveller.avoid_crowds && { icon: "groups", text: t("c.crowds") },
  ].filter(Boolean) as { icon: string; text: string }[];
  const onRoute = selected ? new Set(selected.legs.flatMap((l) => l.event_ids)) : new Set<string>();

  return (
    <main className="flex w-full flex-col gap-4 px-4 pb-16 pt-4 md:px-6">
      {/* ---- Route header ---- */}
      <section className="flex flex-col gap-3 rounded-2xl bg-container-lowest p-4 shadow-sm lg:flex-row lg:items-center">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary text-on-primary"><Icon name="swap_calls" /></span>
        <div className="min-w-0 flex-1">
          <h1 className="text-title font-semibold md:text-[1.625rem] md:leading-8">
            {traveller.origin.label}{" "}
            <Icon name="arrow_forward" className="mx-0.5 text-[22px] text-primary" />{" "}
            {destination?.label ?? t("dayItinerary")}
            {destination && <span className="chip ml-2 bg-container align-middle text-on-surface-variant">{t("km", { n: km(traveller.origin, destination).toFixed(1) })}</span>}
          </h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-small text-on-surface-variant">
            <span>{traveller.traveller_id === "CUSTOM" ? t("yourTrip") : storyText(activeLang(), traveller.traveller_id, { name: traveller.name }).name}</span>
            {live?.source === "backend" && <span className="flex items-center gap-1"><Icon name="sensors" className="text-[16px] text-primary" /> {t("liveAt", { time: live.asOf ?? "" })}</span>}
            {active.length > 0 && <span className="flex items-center gap-1 text-tertiary"><Icon name="warning" className="text-[16px]" /> {t(active.length === 1 ? "liveProblem" : "liveProblems", { n: active.length })}</span>}
            {plan?.sample && <span className="rounded-full bg-amber-soft px-2 py-0.5 font-semibold text-amber-ink">{t("sample")}</span>}
          </p>
          {constraints.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {constraints.map((c) => (
                <span key={c.text} className="flex items-center gap-1 rounded-lg bg-container-low px-2 py-1 text-caption font-semibold">
                  <Icon name={c.icon} className="text-[16px] text-on-surface-variant" /> {c.text}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/plan?from=${encodeURIComponent(traveller.origin.label)}&to=${encodeURIComponent(destination?.label ?? "")}`}
            className="flex items-center gap-1 rounded-xl bg-container-low px-4 py-2.5 text-small font-semibold hover:bg-container">
            <Icon name="edit_calendar" className="text-[18px]" /> {departText}
          </Link>
          <button type="button" title={t("copyTitle")} aria-label={t("copyAria")}
            onClick={() => { navigator.clipboard?.writeText(window.location.href).catch(() => undefined); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className="grid h-10 w-10 place-items-center rounded-xl bg-container-low hover:bg-container">
            <Icon name={copied ? "check" : "share"} className="text-[20px]" />
          </button>
        </div>
      </section>

      {traveller.demo && traveller.traveller_id !== "CUSTOM" && (
        <StoryPanel traveller={traveller} onReplan={() => setReloadKey((k) => k + 1)} resultsHref={pathname} />
      )}

      {state.status === "loading" && <p className="text-on-surface-variant">{t("loadingRoutes")}</p>}
      {state.status === "error" && <p className="rounded-xl bg-error-container p-3 text-sm text-on-error-container">{t("loadError", { msg: state.message })}</p>}
      {state.status === "not_connected" && <NotConnected traveller={traveller} destination={destination} />}

      {plan && plan.cards.length === 0 && (
        <NoRoute traveller={traveller} rejected={plan.rejected} />
      )}

      {plan && plan.cards.length > 0 && (
        <>
          {/* ---- Mode filter + sort ---- */}
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap gap-1 rounded-2xl bg-container-low p-1">
              {FILTERS.map((f) => (
                <button key={f.id} type="button" onClick={() => setFilter(f.id)} aria-pressed={filter === f.id} disabled={!counts[f.id]}
                  className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-small font-semibold transition disabled:opacity-40 ${
                    filter === f.id ? "bg-container-lowest text-primary shadow-sm" : "text-on-surface-variant hover:text-on-surface"}`}>
                  <Icon name={f.icon} className="text-[18px]" /> {t(f.label)}
                  {f.id === "all" && <span className="rounded-full bg-primary-fixed px-1.5 text-micro text-on-primary-fixed">{counts.all}</span>}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-caption font-bold uppercase tracking-wider text-outline">{t("sort")}</span>
              {ordered.map((c) => {
                const on = c.plan_id === selectedId;
                return (
                  <button key={c.plan_id} onClick={() => setSelectedId(c.plan_id)} aria-pressed={on}
                    className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-small font-semibold transition ${
                      on ? "bg-primary text-on-primary shadow-sm" : "bg-container-lowest text-on-surface shadow-sm hover:bg-container-low"}`}>
                    <Icon name={LABEL_STYLE[c.label].icon} className="text-[18px]" />
                    {PLAN_LABEL[c.label]}{c.recommended ? t("recommendedSuffix") : ""}
                    <span className={on ? "text-on-primary/80" : "text-on-surface-variant"}>
                      {c.label === "cheapest" ? `₹${c.cost_inr}` : t("minShort", { n: c.duration_min })}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            {/* ---- Cards ---- */}
            <div className="flex flex-col gap-4">
              {shown.map((card) => (
                <ResultCard key={card.plan_id} card={card} traveller={traveller} destinationLabel={destination?.label}
                  fastest={Math.min(...ordered.map((c) => c.duration_min))}
                  selected={card.plan_id === selectedId} onSelect={() => setSelectedId(card.plan_id)} onTrack={() => startTracking(card)} />
              ))}
              {shown.length === 0 && <p className="rounded-xl bg-container-low p-4 text-sm text-on-surface-variant">{t("noModePlan")}</p>}

              {(plan.notes?.length ?? 0) > 0 && (
                <section className="flex flex-col gap-1.5 rounded-2xl bg-container-lowest p-4 shadow-sm">
                  <h2 className="flex items-center gap-2 text-sm font-semibold"><Icon name="verified_user" className="text-[18px] text-primary" /> {t("pcChanged")}</h2>
                  {plan.notes!.map((n) => (
                    <p key={n} className="flex items-start gap-2 text-small text-on-surface-variant">
                      <Icon name={isAvoided(n) ? "block" : "info"} className={`text-[16px] ${isAvoided(n) ? "text-error" : "text-secondary"}`} /> {n}
                    </p>
                  ))}
                </section>
              )}

              {plan.rejected.length > 0 && (
                <section className="rounded-2xl bg-container-lowest p-4 shadow-sm">
                  <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Icon name="block" className="text-[18px] text-error" /> {t("rejected")}</h2>
                  <ul className="flex flex-col divide-y divide-hairline-soft text-sm">
                    {plan.rejected.map((r) => (
                      <li key={r.summary} className="py-2">
                        <span className="font-semibold">{readableRoute(r.summary)}</span>
                        <span className="block text-small text-on-surface-variant">{r.message || r.reason}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>

            {/* ---- Map + matrix + compare ---- */}
            <div className="flex flex-col gap-6 lg:sticky lg:top-20 lg:self-start">
              <div className="relative h-[480px] overflow-hidden rounded-2xl bg-container-lowest shadow-sm">
                {destination && <MapView card={selected} origin={traveller.origin} destination={destination}
                  events={active.filter((e) => onRoute.size === 0 || onRoute.has(e.event_id) || e.status === "confirmed")} />}
                {selected && <ActiveSelection card={selected} onTrack={() => startTracking(selected)} />}
              </div>
              <TradeOffMatrix cards={ordered} selectedId={selectedId} onSelect={setSelectedId} />
              {baseline && <CompareWithNormalApp aware={plan} baseline={baseline} />}
            </div>
          </div>
        </>
      )}
    </main>
  );
}

/** Nothing fits: explain in plain words what happened, why, and give one-click fixes. */
const MODE_WORDS: Record<string, RouteResultsKey> = { local: "mw.local", metro: "mw.metro", bus: "mw.bus", auto: "mw.auto", taxi: "mw.taxi", cab: "mw.cab" };
const modeWord = (m: string): string => (MODE_WORDS[m] ? tr(MODE_WORDS[m]) : m);
const ALL_MODES: Mode[] = ["walk", "local", "metro", "bus", "auto", "taxi", "cab"];

function listWords(xs: string[]): string {
  return xs.length <= 1 ? xs.join("") : tr("listAnd", { rest: xs.slice(0, -1).join(", "), last: xs[xs.length - 1] });
}

type Fix = { label: string; why: string; icon: string; traveller: Traveller; primary?: boolean; adds?: boolean };

function explainNoRoute(t: Traveller, rejected: PlanResponse["rejected"]) {
  const reasons: string[] = [];
  const fixes: Fix[] = [];
  const base = { ...t, traveller_id: "CUSTOM" };
  const allowed = t.modes_allowed.filter((m) => m !== "walk");
  const num = (re: RegExp) => rejected.map((r) => r.reason.match(re)).filter(Boolean).map((m) => Number(m![1]));

  // 1. No connection at all (e.g. only trains allowed and the place is far from a station).
  if (rejected.some((r) => r.summary === "Any route")) {
    const usable = Object.values(stations).filter((st) => (allowed as string[]).includes(st.mode));
    const nearest = (p: { lat: number; lon: number }) => usable
      .map((st) => ({ st, km: km(p, st) }))
      .sort((x, y) => x.km - y.km)[0];
    const ends = [{ who: "start", place: t.origin }, { who: "destination", place: t.destination }]
      .filter((e) => e.place) as { who: string; place: NonNullable<Traveller["destination"]> }[];
    for (const e of ends) {
      const n = nearest(e.place);
      if (n && n.km > 1.2) {
        const mins = Math.round(((n.km * 1.3) / (t.step_free || t.heavy_luggage ? 3 : 4.5)) * 60);
        const kind = tr(allowed.every((m) => m === "local" || m === "metro") ? (allowed.length > 1 ? "kind.trainOrMetro" : allowed[0] === "metro" ? "kind.metro" : "kind.train") : "kind.stop");
        reasons.push(tr("r.far", { place: e.place.label, km: n.km.toFixed(1), kind, station: n.st.name, mins }));
      }
    }
    if (!reasons.length) reasons.push(tr("r.noConnection", { modes: listWords(allowed.map(modeWord)) }));
    const missing = ALL_MODES.filter((m) => m !== "walk" && !(t.modes_allowed as string[]).includes(m));
    if (missing.length) {
      fixes.push({ label: tr("f.addModes", { modes: listWords(missing.filter((m) => m !== "cab").map(modeWord)) }), icon: "add_road", primary: true, adds: true,
        why: tr("f.addModesWhy"), traveller: { ...base, modes_allowed: ALL_MODES } });
    }
  }

  // 2. Routes exist but break one of the traveller's limits.
  const costs = num(/est\. (\d+) rupees/);
  if (costs.length && t.max_budget_inr != null) {
    const need = Math.min(...costs);
    reasons.push(tr("r.budget", { need, max: t.max_budget_inr }));
    fixes.push({ label: tr("f.budget", { n: need }), icon: "payments", why: tr("f.budgetWhy", { n: need - t.max_budget_inr }), traveller: { ...base, max_budget_inr: need } });
  }
  const walks = num(/Walking time (\d+) min/);
  if (walks.length && t.max_walk_min != null) {
    const need = Math.min(...walks);
    reasons.push(tr("r.walk", { need, max: t.max_walk_min }));
    fixes.push({ label: tr("f.walk", { n: need }), icon: "directions_walk", why: tr("f.walkWhy", { n: need - t.max_walk_min }), traveller: { ...base, max_walk_min: need } });
  }
  const changes = num(/Requires (\d+) transfers/);
  if (changes.length && t.max_transfers != null) {
    const need = Math.min(...changes);
    reasons.push(tr(need === 1 ? "r.change" : "r.changes", { need, max: t.max_transfers }));
    fixes.push({ label: tr(need === 1 ? "f.change" : "f.changes", { n: need }), icon: "sync_alt", why: tr("f.changesWhy"), traveller: { ...base, max_transfers: need } });
  }
  const late = rejected.map((r) => r.reason.match(/Arrives at (\d\d:\d\d), after strict deadline/)).filter(Boolean).map((m) => m![1]).sort();
  if (late.length) {
    reasons.push(tr("r.late", { time: late[0], by: t.arrive_by ?? "" }));
    fixes.push({ label: tr("f.arriveBy", { time: late[0] }), icon: "schedule", why: tr("f.arriveByWhy"), traveller: { ...base, arrive_by: late[0] } });
    fixes.push({ label: tr("f.flex"), icon: "flag", why: tr("f.flexWhy"), traveller: { ...base, hard_deadline: false } });
  }
  if (rejected.some((r) => r.reason.startsWith("Not step-free"))) {
    reasons.push(tr("r.stairs"));
    fixes.push({ label: tr("f.taxi"), icon: "local_taxi", why: tr("f.taxiWhy"), adds: true, traveller: { ...base, modes_allowed: [...new Set([...t.modes_allowed, "taxi", "cab"] as Mode[])] } });
  }
  const blocked = rejected.filter((r) => r.reason.includes("confirmed by Pakka Check"));
  if (blocked.length) {
    reasons.push(tr("r.blocked", { what: blocked[0].reason.replace(/^Uses /, "").replace(/ \(confirmed by Pakka Check\)$/, "") }));
  }
  if (!reasons.length) reasons.push(tr("r.none"));
  if (fixes.length && !fixes.some((f) => f.primary)) fixes[0].primary = true;   // highlight the most direct fix
  if (!fixes.length || !fixes.some((f) => f.adds)) {
    fixes.push({ label: tr("f.relax"), icon: "tune", why: tr("f.relaxWhy"),
      traveller: { ...base, max_budget_inr: null, max_walk_min: Math.max(t.max_walk_min ?? 15, 25), max_transfers: Math.max(t.max_transfers ?? 2, 3), modes_allowed: ALL_MODES } });
  }
  return { reasons, fixes };
}

function NoRoute({ traveller, rejected }: { traveller: Traveller; rejected: PlanResponse["rejected"] }) {
  const t = useT(M);
  const { reasons, fixes } = explainNoRoute(traveller, rejected);
  const allowed = traveller.modes_allowed.filter((m) => m !== "walk").map(modeWord);
  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-container-lowest p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-soft text-amber-ink"><Icon name="wrong_location" /></span>
        <div>
          <h2 className="text-lg font-semibold">{t("nr.title")}</h2>
          <p className="text-sm text-on-surface-variant">
            {t("nr.asked", {
              modes: allowed.length ? listWords(allowed) : t("nr.walkingOnly"),
              walk: traveller.max_walk_min != null ? t("nr.walk", { n: traveller.max_walk_min }) : "",
              budget: traveller.max_budget_inr != null ? t("nr.budget", { n: traveller.max_budget_inr }) : "",
              changes: traveller.max_transfers != null ? t(traveller.max_transfers === 1 ? "nr.change" : "nr.changes", { n: traveller.max_transfers }) : "",
              stepFree: traveller.step_free ? t("nr.stepFree") : "",
            })}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <h3 className="text-caption font-bold uppercase tracking-wider text-on-surface-variant">{t("nr.why")}</h3>
        <ul className="flex flex-col gap-1.5">
          {reasons.map((r) => (
            <li key={r} className="flex items-start gap-2 rounded-xl bg-amber-soft/60 px-3 py-2 text-sm text-on-surface">
              <Icon name="info" className="text-[18px] text-amber-ink" /> {r}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-caption font-bold uppercase tracking-wider text-on-surface-variant">{t("nr.whatToDo")}</h3>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
          {fixes.map((f) => (
            <Link key={f.label} href={tripHref(f.traveller)}
              className={`flex items-start gap-3 rounded-xl p-3 transition ${f.primary ? "bg-primary text-on-primary hover:bg-primary-container" : "bg-container-low hover:bg-container"}`}>
              <Icon name={f.icon} className="text-[22px]" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{f.label}{f.primary ? t("nr.recommended") : ""}</span>
                <span className={`block text-caption ${f.primary ? "text-on-primary/85" : "text-on-surface-variant"}`}>{f.why}</span>
              </span>
            </Link>
          ))}
          <Link href={`/plan?from=${encodeURIComponent(traveller.origin.label)}&to=${encodeURIComponent(traveller.destination?.label ?? "")}`}
            className="flex items-start gap-3 rounded-xl bg-container-low p-3 transition hover:bg-container">
            <Icon name="edit" className="text-[22px]" />
            <span>
              <span className="block text-sm font-semibold">{t("nr.changeMyself")}</span>
              <span className="block text-caption text-on-surface-variant">{t("nr.changeMyselfSub")}</span>
            </span>
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- helpers */

function usesModes(card: RouteCard, modes: Mode[] | null): boolean {
  return !modes || card.legs.some((l) => modes.includes(l.mode));
}

function legName(leg: Leg): string {
  return leg.line_id ? lineShortName(leg.line_id) : MODE_LABEL[leg.mode];
}

function legSummary(card: RouteCard): string {
  const parts: string[] = [];
  for (const l of card.legs) if (l.mode !== "walk" && parts[parts.length - 1] !== legName(l)) parts.push(legName(l));
  return parts.join(" → ") || translate(COMMON, "mode.walk");
}

function fareBreakdown(card: RouteCard): string {
  const byMode = new Map<string, number>();
  for (const l of card.legs) if (l.cost_inr) byMode.set(legName(l), (byMode.get(legName(l)) ?? 0) + l.cost_inr);
  return [...byMode].map(([k, v]) => `${k} ₹${v}`).join(" + ") || tr("fare.free");
}

function interchanges(card: RouteCard, traveller: Traveller, dest?: string): string | null {
  const rides = card.legs.filter((l) => l.mode !== "walk");
  if (rides.length < 2) return rides.length === 1 ? tr("ic.direct") : null;
  const at = rides.slice(1).map((l) => placeName(l.from_id, traveller, dest));
  return tr(rides.length > 2 ? "ic.many" : "ic.one", { n: rides.length - 1, places: [...new Set(at)].join(", ") });
}

/* ---------------------------------------------------------------- pieces */

function ResultCard({ card, traveller, destinationLabel, fastest, selected, onSelect, onTrack }: {
  card: RouteCard; traveller: Traveller; destinationLabel?: string; fastest: number; selected: boolean; onSelect: () => void; onTrack: () => void;
}) {
  const t = useT(M);
  const tc = useT(COMMON);
  const [panel, setPanel] = useState<null | "steps" | "fare">(null);
  const last = card.legs[card.legs.length - 1];
  const risky = card.legs.filter((l) => l.event_ids.length > 0 && l.risk >= 0.3);
  const faster = card.duration_min - fastest;
  const style = LABEL_STYLE[card.label];
  return (
    <article onClick={onSelect}
      className={`flex cursor-pointer flex-col gap-4 rounded-2xl bg-container-lowest p-5 shadow-sm transition hover:shadow-md ${selected ? "ring-2 ring-primary" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-caption font-bold ${style.chip}`}>
          <Icon name={style.icon} className="text-[16px]" /> {card.recommended ? t("card.recommended", { label: PLAN_LABEL[card.label] }) : t(style.title)}
        </span>
        <span className={`rounded-full px-2.5 py-1 text-caption font-bold ${REL_STYLE[card.reliability_colour]}`}>{t("reliable", { pct: pct(card.reliability) })}</span>
        {risky.length > 0 && (
          <span className="flex items-center gap-1 rounded-full bg-error-container px-2.5 py-1 text-caption font-bold text-on-error-container">
            <Icon name="warning" className="text-[16px]" /> {t("liveOnRoute")}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1 text-caption font-semibold text-primary">
          <span className="h-2 w-2 rounded-full bg-primary" /> {t("score", { n: card.score.toFixed(1) })}
        </span>
      </div>

      <div className="flex items-end justify-between gap-3">
        <p className="flex flex-wrap items-baseline gap-2">
          <span className="text-display font-bold leading-none tracking-tight tabular-nums">{t("min", { n: card.duration_min })}</span>
          <span className="text-sm text-on-surface-variant tabular-nums">{t("arrival", { time: last.arrive })}</span>
          {faster === 0 && card.label !== "fastest" && <span className="rounded bg-primary-fixed px-1.5 py-0.5 text-micro font-bold text-on-primary-fixed">{tc("plan.fastest")}</span>}
        </p>
        <p className="text-right">
          <span className="block text-display font-bold leading-none tracking-tight tabular-nums text-primary">₹{card.cost_inr}</span>
          <span className="text-caption text-on-surface-variant">{fareBreakdown(card)}</span>
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-xl bg-container-low p-3">
        <ol className="flex flex-wrap items-center gap-2 text-sm">
          {card.legs.map((leg, i) => {
            const hit = leg.event_ids.length > 0 && leg.risk >= 0.3;
            return (
              <li key={i} className="flex items-center gap-2">
                {i > 0 && <Icon name="arrow_forward" className="text-[16px] text-outline" />}
                {leg.mode === "walk" ? (
                  <span className={`flex items-center gap-0.5 text-small ${hit ? "font-semibold text-error" : "text-on-surface-variant"}`}>
                    {hit && <Icon name="warning" className="text-[16px]" />}
                    <Icon name="directions_walk" className="text-[18px]" />{t("minShort", { n: leg.duration_min })}
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 rounded-lg bg-container-lowest px-2 py-1 shadow-sm">
                    <span className="rounded px-1.5 py-0.5 text-micro font-bold text-white" style={{ backgroundColor: legColor(leg) }}>
                      {hit ? "⚠ " : ""}{legName(leg)}
                    </span>
                    <span className="text-small font-semibold tabular-nums">{t("minShort", { n: leg.duration_min })}</span>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-small text-on-surface-variant">
          {interchanges(card, traveller, destinationLabel) && (
            <span className="flex items-center gap-1"><Icon name="transfer_within_a_station" className="text-[16px]" /> {interchanges(card, traveller, destinationLabel)}</span>
          )}
          <span className="flex items-center gap-1"><Icon name="directions_walk" className="text-[16px]" /> {t("walking", { n: card.walk_min })}</span>
          {!card.legs.every((l) => l.step_free) && <span className="flex items-center gap-1"><Icon name="stairs" className="text-[16px]" /> {t("stairs")}</span>}
          {risky.length > 0 && (
            <span className="flex items-center gap-1 font-semibold text-error"><Icon name="warning" className="text-[16px]" /> {t(risky.length === 1 ? "riskyLeg" : "riskyLegs", { n: risky.length })}</span>
          )}
        </div>
      </div>

      <p className="flex items-start gap-2 text-small">
        <Icon name="tips_and_updates" className="text-[18px] text-primary" /> {card.reason}
      </p>

      {panel === "steps" && (
        <ol className="flex flex-col border-l-2 border-primary/40 pl-4">
          {card.legs.map((leg, i) => (
            <li key={i} className="relative pb-3 text-sm last:pb-0">
              <span className={`absolute -left-[22px] top-1 h-3 w-3 rounded-full border-2 border-container-lowest ${leg.mode === "walk" ? "bg-outline" : "bg-primary"}`} />
              <span className="tabular-nums text-on-surface-variant">{leg.depart}–{leg.arrive}</span>{" "}
              <span className="font-semibold">{placeName(leg.from_id, traveller, destinationLabel)} → {placeName(leg.to_id, traveller, destinationLabel)}</span>
              <span className="text-on-surface-variant"> · {legName(leg)}{leg.cost_inr ? ` · ₹${leg.cost_inr}` : ""}</span>
              {leg.event_ids.map((id) => (
                <Link key={id} href={`/events/${id}`} onClick={(e) => e.stopPropagation()}
                  className="ml-1 rounded bg-error-container px-1.5 py-0.5 text-micro font-bold text-on-error-container hover:underline">
                  {t("risk", { id, pct: pct(leg.risk) })}
                </Link>
              ))}
            </li>
          ))}
        </ol>
      )}
      {panel === "fare" && (
        <ul className="flex flex-col gap-1 rounded-xl bg-container-low p-3 text-small">
          {card.legs.filter((l) => l.cost_inr > 0).map((l, i) => (
            <li key={i} className="flex justify-between gap-2"><span>{legName(l)} · {placeName(l.from_id, traveller, destinationLabel)} → {placeName(l.to_id, traveller, destinationLabel)}</span><b>₹{l.cost_inr}</b></li>
          ))}
          <li className="flex justify-between border-t border-hairline-soft pt-1 font-bold"><span>{t("total")}</span><span>₹{card.cost_inr}</span></li>
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <button onClick={() => setPanel(panel === "steps" ? null : "steps")} className="mr-auto flex items-center gap-1 text-small font-semibold text-primary">
          {panel === "steps" ? t("hideSteps") : t("viewSteps", { n: card.legs.length })} <Icon name="keyboard_arrow_right" className="text-[18px]" />
        </button>
        <button onClick={() => setPanel(panel === "fare" ? null : "fare")} className="rounded-xl bg-container-low px-4 py-2.5 text-small font-semibold hover:bg-container">
          {t("fareBreakdown")}
        </button>
        <button onClick={onTrack} className={`flex items-center gap-1 rounded-xl px-4 py-2.5 text-small font-semibold ${selected ? "bg-primary text-on-primary hover:bg-primary-container" : "bg-container-low hover:bg-container"}`}>
          <Icon name="near_me" className="text-[18px]" /> {t("startTracking")}
        </button>
      </div>
    </article>
  );
}

function ActiveSelection({ card, onTrack }: { card: RouteCard; onTrack: () => void }) {
  const t = useT(M);
  const lines = [...new Map(card.legs.filter((l) => l.mode !== "walk").map((l) => [legName(l), legColor(l)])).entries()];
  return (
    <div className="absolute inset-x-3 bottom-3 z-[500] flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl bg-container-lowest/95 p-4 shadow-float backdrop-blur-sm">
      <div className="min-w-[10rem] flex-1">
        <span className="chip whitespace-nowrap bg-primary text-micro uppercase tracking-wider text-on-primary">{t("activeSel")}</span>
        <p className="mt-1.5 truncate text-body font-semibold">{PLAN_LABEL[card.label]} · {legSummary(card)}</p>
        <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-caption text-on-surface-variant">
          {lines.map(([name, color]) => <li key={name} className="flex items-center gap-1"><span className="h-1 w-3 rounded-full" style={{ background: color }} /> {name}</li>)}
        </ul>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="whitespace-nowrap text-title font-bold tabular-nums text-primary">{t("min", { n: card.duration_min })}</p>
          <p className="text-small font-semibold tabular-nums">₹{card.cost_inr}</p>
        </div>
        <button onClick={onTrack} className="btn-primary">
          <Icon name="navigation" className="text-[20px]" /> {t("startTrip")}
        </button>
      </div>
    </div>
  );
}

function TradeOffMatrix({ cards, selectedId, onSelect }: { cards: RouteCard[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const t = useT(M);
  return (
    <section className="overflow-hidden rounded-2xl bg-container-lowest shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 p-4">
        <h2 className="flex items-center gap-2 text-subtitle font-semibold"><Icon name="table_chart" className="text-[20px] text-primary" /> {t("matrix.title")}</h2>
        <span className="text-caption text-on-surface-variant">{t("matrix.sub")}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-container-low eyebrow">
            <tr>
              <th className="px-4 py-2.5">{t("th.route")}</th>
              <th className="px-3 py-2.5 text-right">{t("th.time")}</th>
              <th className="px-3 py-2.5 text-right">{t("th.fare")}</th>
              <th className="px-3 py-2.5 text-right">{t("th.changes")}</th>
              <th className="px-3 py-2.5 text-right">{t("th.walk")}</th>
              <th className="px-4 py-2.5 text-right">{t("th.reliability")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline-soft">
            {cards.map((c) => {
              const best = (k: (x: RouteCard) => number, hi = false) =>
                k(c) === (hi ? Math.max : Math.min)(...cards.map(k)) ? "font-bold text-primary" : "";
              return (
                <tr key={c.plan_id} onClick={() => onSelect(c.plan_id)}
                  className={`cursor-pointer tabular-nums hover:bg-container-low ${c.plan_id === selectedId ? "bg-primary-soft/60" : ""}`}>
                  <td className="px-4 py-2.5">
                    <span className="font-semibold">{PLAN_LABEL[c.label]}</span>
                    <span className="block text-caption text-on-surface-variant">{legSummary(c)}</span>
                  </td>
                  <td className={`px-3 py-2.5 text-right ${best((x) => x.duration_min)}`}>{t("min", { n: c.duration_min })}</td>
                  <td className={`px-3 py-2.5 text-right ${best((x) => x.cost_inr)}`}>₹{c.cost_inr}</td>
                  <td className={`px-3 py-2.5 text-right ${best((x) => x.transfers)}`}>{c.transfers}</td>
                  <td className={`px-3 py-2.5 text-right ${best((x) => x.walk_min)}`}>{t("minShort", { n: c.walk_min })}</td>
                  <td className={`px-4 py-2.5 text-right ${best((x) => x.reliability, true)}`}>
                    <span className={`rounded-md px-1.5 py-0.5 ${REL_STYLE[c.reliability_colour]}`}>{pct(c.reliability)}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Same trip in a schedule-only app (reports ignored) vs TravelBuddy, option by option. */
function CompareWithNormalApp({ aware, baseline }: { aware: PlanResponse; baseline: PlanResponse }) {
  const t = useT(M);
  const labels: PlanLabel[] = ["fastest", "optimal", "cheapest"];
  const rows = labels.map((l) => ({ l, a: aware.cards.find((c) => c.label === l), b: baseline.cards.find((c) => c.label === l) }))
    .filter((r) => r.a && r.b);
  const changed = rows.some((r) => legSummary(r.a!) !== legSummary(r.b!) || r.a!.duration_min !== r.b!.duration_min || r.a!.reliability !== 1);
  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-container-lowest p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold"><Icon name="compare_arrows" className="text-primary" /> {t("cmp.title")}</h2>
        <Link href="/compare" className="text-caption font-semibold text-primary hover:underline">{t("cmp.full")}</Link>
      </div>
      <p className="text-small text-on-surface-variant">
        {changed ? t("cmp.changed") : t("cmp.same")}
      </p>
      {changed && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-small">
            <thead className="eyebrow">
              <tr><th className="py-1.5">{t("th.option")}</th><th className="py-1.5">{t("cmp.normal")}</th><th className="py-1.5">TravelBuddy</th></tr>
            </thead>
            <tbody className="divide-y divide-hairline-soft">
              {rows.map(({ l, a, b }) => (
                <tr key={l}>
                  <td className="py-2 pr-2 font-semibold">{PLAN_LABEL[l]}</td>
                  <td className="py-2 pr-2">{legSummary(b!)}<span className="block text-on-surface-variant">{t("cmp.assumed", { min: b!.duration_min })}</span></td>
                  <td className="py-2">{legSummary(a!)}<span className={`block font-semibold ${a!.reliability < 0.9 ? "text-error" : "text-primary"}`}>{t("cmp.reliable", { min: a!.duration_min, pct: pct(a!.reliability) })}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function NotConnected({ traveller, destination }: { traveller: Traveller; destination: Traveller["destination"] }) {
  const live = useLiveEvents();
  const t = useT(M);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="flex flex-col gap-3 rounded-2xl bg-container-lowest p-5 shadow-sm">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-secondary-container text-on-secondary-container"><Icon name="cloud_off" /></span>
        <h2 className="text-xl font-semibold">{t("nc.title")}</h2>
        <p className="text-sm leading-relaxed text-on-surface-variant">
          {t("nc.before")}<code className="rounded bg-container-low px-1">uvicorn app.main:app --port 8000</code>{t("nc.after")}{" "}
          <Link href="/routes/TR3" className="font-semibold text-primary">{t("nc.example")}</Link>{t("nc.end")}
        </p>
        <details className="text-sm">
          <summary className="cursor-pointer font-semibold">{t("nc.request")}</summary>
          <pre className="mt-2 max-h-72 overflow-auto rounded-xl bg-container-low p-3 text-xs">{JSON.stringify(planRequest(traveller), null, 2)}</pre>
        </details>
      </section>
      <div className="h-[420px] overflow-hidden rounded-2xl bg-container-lowest shadow-sm">
        {destination && <MapView origin={traveller.origin} destination={destination} events={activeEvents(live?.events)} />}
      </div>
    </div>
  );
}

/**
 * If this route's departure has already passed on the demo clock (results opened earlier, or the
 * clock was played), re-plan from "now" and take the option with the same label — so the trip you
 * start is one you can still catch. Falls back to the card as shown.
 */
async function freshCard(traveller: Traveller, card: RouteCard): Promise<RouteCard> {
  try {
    const clock = await getClock();
    if (toMin(card.legs[0].depart) >= toMin(clock.now) - 1) return card;
    const plan = await getPlan({ ...traveller, traveller_id: "CUSTOM", leave_at: null, arrive_by: traveller.arrive_by });
    return plan.cards.find((c) => c.label === card.label) ?? plan.cards[0] ?? card;
  } catch {
    return card;
  }
}
