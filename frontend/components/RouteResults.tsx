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
import { activeEvents } from "@/lib/network";
import { startTrip } from "@/lib/savedTrip";
import { tripHref } from "@/lib/tripUrl";
import type { Leg, Mode, PlanLabel, PlanResponse, RouteCard, Traveller } from "@/lib/types";
import { useLiveEvents } from "@/lib/useLiveEvents";
import Icon from "./Icon";
import MapView from "./MapView";
import StoryPanel from "./StoryPanel";

type Plan = PlanResponse & { sample?: boolean };
type State = { status: "loading" } | { status: "error"; message: string } | { status: "not_connected" } | { status: "ready"; plan: Plan };

const LABEL_STYLE: Record<PlanLabel, { icon: string; chip: string; title: string }> = {
  optimal: { icon: "auto_awesome", chip: "bg-primary-fixed text-on-primary-fixed", title: "Optimal" },
  fastest: { icon: "bolt", chip: "bg-secondary-container text-on-secondary-container", title: "Fastest Route" },
  cheapest: { icon: "savings", chip: "bg-tertiary-fixed text-tertiary", title: "Budget Champion" },
};
const REL_STYLE = {
  green: "bg-primary-soft text-primary-ink",
  yellow: "bg-amber-soft text-amber-ink",
  red: "bg-error-container text-on-error-container",
} as const;

const FILTERS: { id: string; label: string; icon: string; modes: Mode[] | null }[] = [
  { id: "all", label: "Overall (Multimodal)", icon: "all_inclusive", modes: null },
  { id: "metro", label: "Metro", icon: "subway", modes: ["metro"] },
  { id: "local", label: "Local Rail", icon: "train", modes: ["local"] },
  { id: "bus", label: "BEST Bus", icon: "directions_bus", modes: ["bus"] },
  { id: "road", label: "Auto / Taxi", icon: "local_taxi", modes: ["auto", "taxi", "cab"] },
];

function km(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

export default function RouteResults({ traveller }: { traveller: Traveller | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const live = useLiveEvents();
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

  if (!traveller) return <p className="mx-auto w-full max-w-7xl px-6 py-6">This trip link is broken — plan it again.</p>;

  async function startTracking(card: RouteCard) {
    const qs = search.toString();
    const fresh = await freshCard(traveller!, card);
    await startTrip({ traveller: traveller!, destination, card: fresh, resultsHref: qs ? `${pathname}?${qs}` : pathname, savedAt: new Date().toISOString() });
    router.push("/track");
  }

  const departText = traveller.leave_at ? `Depart: ${traveller.leave_at}` : traveller.arrive_by
    ? `${traveller.hard_deadline ? "Must arrive" : "Arrive"} by ${traveller.arrive_by}` : `Depart: Now${plan?.as_of ? ` (${plan.as_of})` : ""}`;
  const constraints = [
    traveller.arrive_by && traveller.leave_at && { icon: "flag", text: `${traveller.hard_deadline ? "Must arrive" : "Arrive"} by ${traveller.arrive_by}` },
    traveller.max_budget_inr && { icon: "payments", text: `≤ ₹${traveller.max_budget_inr}` },
    traveller.max_walk_min && { icon: "directions_walk", text: `≤ ${traveller.max_walk_min} min walk` },
    traveller.max_transfers != null && { icon: "sync_alt", text: `≤ ${traveller.max_transfers} changes` },
    traveller.step_free && { icon: "accessible", text: "Step-free" },
    traveller.heavy_luggage && { icon: "luggage", text: "Heavy luggage" },
    traveller.avoid_crowds && { icon: "groups", text: "Avoid crowds" },
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
            {destination?.label ?? "Day itinerary"}
            {destination && <span className="chip ml-2 bg-container align-middle text-on-surface-variant">{km(traveller.origin, destination).toFixed(1)} km</span>}
          </h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-small text-on-surface-variant">
            <span>{traveller.traveller_id === "CUSTOM" ? "Your trip" : traveller.name}</span>
            {live?.source === "backend" && <span className="flex items-center gap-1"><Icon name="sensors" className="text-[16px] text-primary" /> Pakka Check live at {live.asOf}</span>}
            {active.length > 0 && <span className="flex items-center gap-1 text-tertiary"><Icon name="warning" className="text-[16px]" /> {active.length} live problem{active.length === 1 ? "" : "s"} in Mumbai</span>}
            {plan?.sample && <span className="rounded-full bg-amber-soft px-2 py-0.5 font-semibold text-amber-ink">Sample numbers — backend offline</span>}
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
          <button type="button" title="Copy link to this trip" aria-label="Copy link"
            onClick={() => { navigator.clipboard?.writeText(window.location.href).catch(() => undefined); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className="grid h-10 w-10 place-items-center rounded-xl bg-container-low hover:bg-container">
            <Icon name={copied ? "check" : "share"} className="text-[20px]" />
          </button>
        </div>
      </section>

      {traveller.demo && traveller.traveller_id !== "CUSTOM" && (
        <StoryPanel traveller={traveller} onReplan={() => setReloadKey((k) => k + 1)} resultsHref={pathname} />
      )}

      {state.status === "loading" && <p className="text-on-surface-variant">Finding routes and checking live reports…</p>}
      {state.status === "error" && <p className="rounded-xl bg-error-container p-3 text-sm text-on-error-container">Couldn’t load routes: {state.message}</p>}
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
                  <Icon name={f.icon} className="text-[18px]" /> {f.label}
                  {f.id === "all" && <span className="rounded-full bg-primary-fixed px-1.5 text-micro text-on-primary-fixed">{counts.all}</span>}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-caption font-bold uppercase tracking-wider text-outline">Sort:</span>
              {ordered.map((c) => {
                const on = c.plan_id === selectedId;
                return (
                  <button key={c.plan_id} onClick={() => setSelectedId(c.plan_id)} aria-pressed={on}
                    className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-small font-semibold transition ${
                      on ? "bg-primary text-on-primary shadow-sm" : "bg-container-lowest text-on-surface shadow-sm hover:bg-container-low"}`}>
                    <Icon name={LABEL_STYLE[c.label].icon} className="text-[18px]" />
                    {PLAN_LABEL[c.label]}{c.recommended ? " (Recommended)" : ""}
                    <span className={on ? "text-on-primary/80" : "text-on-surface-variant"}>
                      {c.label === "cheapest" ? `₹${c.cost_inr}` : `${c.duration_min}m`}
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
              {shown.length === 0 && <p className="rounded-xl bg-container-low p-4 text-sm text-on-surface-variant">No plan uses this mode. Pick another filter.</p>}

              {(plan.notes?.length ?? 0) > 0 && (
                <section className="flex flex-col gap-1.5 rounded-2xl bg-container-lowest p-4 shadow-sm">
                  <h2 className="flex items-center gap-2 text-sm font-semibold"><Icon name="verified_user" className="text-[18px] text-primary" /> What Pakka Check changed</h2>
                  {plan.notes!.map((n) => (
                    <p key={n} className="flex items-start gap-2 text-small text-on-surface-variant">
                      <Icon name={n.startsWith("Avoided") ? "block" : "info"} className={`text-[16px] ${n.startsWith("Avoided") ? "text-error" : "text-secondary"}`} /> {n}
                    </p>
                  ))}
                </section>
              )}

              {plan.rejected.length > 0 && (
                <section className="rounded-2xl bg-container-lowest p-4 shadow-sm">
                  <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Icon name="block" className="text-[18px] text-error" /> Rejected options</h2>
                  <ul className="flex flex-col divide-y divide-hairline-soft text-sm">
                    {plan.rejected.map((r) => (
                      <li key={r.summary} className="py-2">
                        <span className="font-semibold">{readableRoute(r.summary)}</span>
                        <span className="block text-small text-on-surface-variant">{r.reason}</span>
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
const MODE_WORDS: Record<string, string> = { local: "local trains", metro: "metro", bus: "BEST buses", auto: "autos", taxi: "taxis", cab: "app cabs" };
const ALL_MODES: Mode[] = ["walk", "local", "metro", "bus", "auto", "taxi", "cab"];

function listWords(xs: string[]): string {
  return xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

type Fix = { label: string; why: string; icon: string; traveller: Traveller; primary?: boolean };

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
        const kind = allowed.every((m) => m === "local" || m === "metro") ? (allowed.length > 1 ? "train or metro station" : allowed[0] === "metro" ? "metro station" : "train station") : "stop";
        reasons.push(`${e.place.label} is about ${n.km.toFixed(1)} km from the nearest ${kind} (${n.st.name}) — roughly a ${mins}-minute walk, which is too far.`);
      }
    }
    if (!reasons.length) reasons.push(`There's no connection between these two places using only ${listWords(allowed.map((m) => MODE_WORDS[m] ?? m))}.`);
    const missing = ALL_MODES.filter((m) => m !== "walk" && !(t.modes_allowed as string[]).includes(m));
    if (missing.length) {
      fixes.push({ label: `Add ${listWords(missing.filter((m) => m !== "cab").map((m) => MODE_WORDS[m]))}`, icon: "add_road", primary: true,
        why: "Use a bus, auto or taxi just for the stretch that's too far to walk.", traveller: { ...base, modes_allowed: ALL_MODES } });
    }
  }

  // 2. Routes exist but break one of the traveller's limits.
  const costs = num(/est\. (\d+) rupees/);
  if (costs.length && t.max_budget_inr != null) {
    const need = Math.min(...costs);
    reasons.push(`The cheapest way costs about ₹${need}, but your budget is ₹${t.max_budget_inr}.`);
    fixes.push({ label: `Raise budget to ₹${need}`, icon: "payments", why: `₹${need - t.max_budget_inr} more than you set.`, traveller: { ...base, max_budget_inr: need } });
  }
  const walks = num(/Walking time (\d+) min/);
  if (walks.length && t.max_walk_min != null) {
    const need = Math.min(...walks);
    reasons.push(`Every route needs at least ${need} minutes of walking; you allowed ${t.max_walk_min}.`);
    fixes.push({ label: `Allow ${need} min of walking`, icon: "directions_walk", why: `${need - t.max_walk_min} minutes more on foot.`, traveller: { ...base, max_walk_min: need } });
  }
  const changes = num(/Requires (\d+) transfers/);
  if (changes.length && t.max_transfers != null) {
    const need = Math.min(...changes);
    reasons.push(`The routes need ${need} change${need === 1 ? "" : "s"} of train or bus; you allowed ${t.max_transfers}.`);
    fixes.push({ label: `Allow ${need} change${need === 1 ? "" : "s"}`, icon: "sync_alt", why: "One more switch between vehicles.", traveller: { ...base, max_transfers: need } });
  }
  const late = rejected.map((r) => r.reason.match(/Arrives at (\d\d:\d\d), after strict deadline/)).filter(Boolean).map((m) => m![1]).sort();
  if (late.length) {
    reasons.push(`Leaving now, the earliest arrival is ${late[0]} — after your must-arrive time of ${t.arrive_by}.`);
    fixes.push({ label: `Arrive by ${late[0]} instead`, icon: "schedule", why: "Keep the trip, accept arriving a bit later.", traveller: { ...base, arrive_by: late[0] } });
    fixes.push({ label: "Make the arrival time flexible", icon: "flag", why: "Show routes even if they arrive late.", traveller: { ...base, hard_deadline: false } });
  }
  if (rejected.some((r) => r.reason.startsWith("Not step-free"))) {
    reasons.push("The routes we found have stairs somewhere (a station or a change between platforms), and you asked for step-free only.");
    fixes.push({ label: "Add taxi / cab door-to-door", icon: "local_taxi", why: "Usually the most accessible option.", traveller: { ...base, modes_allowed: [...new Set([...t.modes_allowed, "taxi", "cab"] as Mode[])] } });
  }
  const blocked = rejected.filter((r) => r.reason.includes("confirmed by Pakka Check"));
  if (blocked.length) {
    reasons.push(`Some routes would go through a problem that commuters and official sources have confirmed (${blocked[0].reason.replace(/^Uses /, "").replace(/ \(confirmed by Pakka Check\)$/, "")}), so we left them out.`);
  }
  if (!reasons.length) reasons.push("None of the routes we found fit all the limits you set.");
  if (fixes.length && !fixes.some((f) => f.primary)) fixes[0].primary = true;   // highlight the most direct fix
  if (!fixes.length || !fixes.some((f) => f.label.startsWith("Add"))) {
    fixes.push({ label: "Relax all limits", icon: "tune", why: "No budget cap, up to 25 min walking, up to 3 changes, all transport.",
      traveller: { ...base, max_budget_inr: null, max_walk_min: Math.max(t.max_walk_min ?? 15, 25), max_transfers: Math.max(t.max_transfers ?? 2, 3), modes_allowed: ALL_MODES } });
  }
  return { reasons, fixes };
}

function NoRoute({ traveller, rejected }: { traveller: Traveller; rejected: PlanResponse["rejected"] }) {
  const { reasons, fixes } = explainNoRoute(traveller, rejected);
  const allowed = traveller.modes_allowed.filter((m) => m !== "walk").map((m) => MODE_WORDS[m] ?? m);
  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-container-lowest p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-soft text-amber-ink"><Icon name="wrong_location" /></span>
        <div>
          <h2 className="text-lg font-semibold">We couldn&apos;t find a route that fits all your choices</h2>
          <p className="text-sm text-on-surface-variant">
            You asked for {allowed.length ? listWords(allowed) : "walking only"}
            {traveller.max_walk_min != null ? `, up to ${traveller.max_walk_min} min of walking` : ""}
            {traveller.max_budget_inr != null ? `, a ₹${traveller.max_budget_inr} budget` : ""}
            {traveller.max_transfers != null ? ` and at most ${traveller.max_transfers} change${traveller.max_transfers === 1 ? "" : "s"}` : ""}
            {traveller.step_free ? ", step-free only" : ""}.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <h3 className="text-caption font-bold uppercase tracking-wider text-on-surface-variant">Why</h3>
        <ul className="flex flex-col gap-1.5">
          {reasons.map((r) => (
            <li key={r} className="flex items-start gap-2 rounded-xl bg-amber-soft/60 px-3 py-2 text-sm text-on-surface">
              <Icon name="info" className="text-[18px] text-amber-ink" /> {r}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-caption font-bold uppercase tracking-wider text-on-surface-variant">What you can do</h3>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
          {fixes.map((f) => (
            <Link key={f.label} href={tripHref(f.traveller)}
              className={`flex items-start gap-3 rounded-xl p-3 transition ${f.primary ? "bg-primary text-on-primary hover:bg-primary-container" : "bg-container-low hover:bg-container"}`}>
              <Icon name={f.icon} className="text-[22px]" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{f.label}{f.primary ? " (recommended)" : ""}</span>
                <span className={`block text-caption ${f.primary ? "text-on-primary/85" : "text-on-surface-variant"}`}>{f.why}</span>
              </span>
            </Link>
          ))}
          <Link href={`/plan?from=${encodeURIComponent(traveller.origin.label)}&to=${encodeURIComponent(traveller.destination?.label ?? "")}`}
            className="flex items-start gap-3 rounded-xl bg-container-low p-3 transition hover:bg-container">
            <Icon name="edit" className="text-[22px]" />
            <span>
              <span className="block text-sm font-semibold">Change the trip myself</span>
              <span className="block text-caption text-on-surface-variant">Open the planner with these two places filled in.</span>
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
  return parts.join(" → ") || "Walk";
}

function fareBreakdown(card: RouteCard): string {
  const byMode = new Map<string, number>();
  for (const l of card.legs) if (l.cost_inr) byMode.set(legName(l), (byMode.get(legName(l)) ?? 0) + l.cost_inr);
  return [...byMode].map(([k, v]) => `${k} ₹${v}`).join(" + ") || "Free (walking)";
}

function interchanges(card: RouteCard, traveller: Traveller, dest?: string): string | null {
  const rides = card.legs.filter((l) => l.mode !== "walk");
  if (rides.length < 2) return rides.length === 1 ? "Direct · no changes" : null;
  const at = rides.slice(1).map((l) => placeName(l.from_id, traveller, dest));
  return `${rides.length - 1} interchange${rides.length > 2 ? "s" : ""} at ${[...new Set(at)].join(", ")}`;
}

/* ---------------------------------------------------------------- pieces */

function ResultCard({ card, traveller, destinationLabel, fastest, selected, onSelect, onTrack }: {
  card: RouteCard; traveller: Traveller; destinationLabel?: string; fastest: number; selected: boolean; onSelect: () => void; onTrack: () => void;
}) {
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
          <Icon name={style.icon} className="text-[16px]" /> {card.recommended ? `Recommended ${PLAN_LABEL[card.label]}` : style.title}
        </span>
        <span className={`rounded-full px-2.5 py-1 text-caption font-bold ${REL_STYLE[card.reliability_colour]}`}>{pct(card.reliability)} reliable</span>
        {risky.length > 0 && (
          <span className="flex items-center gap-1 rounded-full bg-error-container px-2.5 py-1 text-caption font-bold text-on-error-container">
            <Icon name="warning" className="text-[16px]" /> Live problem on route
          </span>
        )}
        <span className="ml-auto flex items-center gap-1 text-caption font-semibold text-primary">
          <span className="h-2 w-2 rounded-full bg-primary" /> Score {card.score.toFixed(1)}/10
        </span>
      </div>

      <div className="flex items-end justify-between gap-3">
        <p className="flex flex-wrap items-baseline gap-2">
          <span className="text-display font-bold leading-none tracking-tight tabular-nums">{card.duration_min} min</span>
          <span className="text-sm text-on-surface-variant tabular-nums">{last.arrive} arrival</span>
          {faster === 0 && card.label !== "fastest" && <span className="rounded bg-primary-fixed px-1.5 py-0.5 text-micro font-bold text-on-primary-fixed">Fastest</span>}
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
                    <Icon name="directions_walk" className="text-[18px]" />{leg.duration_min}m
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 rounded-lg bg-container-lowest px-2 py-1 shadow-sm">
                    <span className="rounded px-1.5 py-0.5 text-micro font-bold text-white" style={{ backgroundColor: legColor(leg) }}>
                      {hit ? "⚠ " : ""}{legName(leg)}
                    </span>
                    <span className="text-small font-semibold tabular-nums">{leg.duration_min}m</span>
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
          <span className="flex items-center gap-1"><Icon name="directions_walk" className="text-[16px]" /> {card.walk_min} min walking</span>
          {!card.legs.every((l) => l.step_free) && <span className="flex items-center gap-1"><Icon name="stairs" className="text-[16px]" /> Stairs on route</span>}
          {risky.length > 0 && (
            <span className="flex items-center gap-1 font-semibold text-error"><Icon name="warning" className="text-[16px]" /> {risky.length} leg{risky.length === 1 ? "" : "s"} with a reported problem</span>
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
                  {id} · {pct(leg.risk)} risk
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
          <li className="flex justify-between border-t border-hairline-soft pt-1 font-bold"><span>Total</span><span>₹{card.cost_inr}</span></li>
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <button onClick={() => setPanel(panel === "steps" ? null : "steps")} className="mr-auto flex items-center gap-1 text-small font-semibold text-primary">
          {panel === "steps" ? "Hide steps" : `View ${card.legs.length} steps`} <Icon name="keyboard_arrow_right" className="text-[18px]" />
        </button>
        <button onClick={() => setPanel(panel === "fare" ? null : "fare")} className="rounded-xl bg-container-low px-4 py-2.5 text-small font-semibold hover:bg-container">
          Fare Breakdown
        </button>
        <button onClick={onTrack} className={`flex items-center gap-1 rounded-xl px-4 py-2.5 text-small font-semibold ${selected ? "bg-primary text-on-primary hover:bg-primary-container" : "bg-container-low hover:bg-container"}`}>
          <Icon name="near_me" className="text-[18px]" /> Start Tracking
        </button>
      </div>
    </article>
  );
}

function ActiveSelection({ card, onTrack }: { card: RouteCard; onTrack: () => void }) {
  const lines = [...new Map(card.legs.filter((l) => l.mode !== "walk").map((l) => [legName(l), legColor(l)])).entries()];
  return (
    <div className="absolute inset-x-3 bottom-3 z-[500] flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl bg-container-lowest/95 p-4 shadow-float backdrop-blur-sm">
      <div className="min-w-[10rem] flex-1">
        <span className="chip whitespace-nowrap bg-primary text-micro uppercase tracking-wider text-on-primary">Active selection</span>
        <p className="mt-1.5 truncate text-body font-semibold">{PLAN_LABEL[card.label]} · {legSummary(card)}</p>
        <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-caption text-on-surface-variant">
          {lines.map(([name, color]) => <li key={name} className="flex items-center gap-1"><span className="h-1 w-3 rounded-full" style={{ background: color }} /> {name}</li>)}
        </ul>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="whitespace-nowrap text-title font-bold tabular-nums text-primary">{card.duration_min} mins</p>
          <p className="text-small font-semibold tabular-nums">₹{card.cost_inr}</p>
        </div>
        <button onClick={onTrack} className="btn-primary">
          <Icon name="navigation" className="text-[20px]" /> Start trip
        </button>
      </div>
    </div>
  );
}

function TradeOffMatrix({ cards, selectedId, onSelect }: { cards: RouteCard[]; selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <section className="overflow-hidden rounded-2xl bg-container-lowest shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 p-4">
        <h2 className="flex items-center gap-2 text-subtitle font-semibold"><Icon name="table_chart" className="text-[20px] text-primary" /> Corridor Trade-off Matrix</h2>
        <span className="text-caption text-on-surface-variant">time · fare · changes · walk · reliability</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-container-low eyebrow">
            <tr>
              <th className="px-4 py-2.5">Route</th>
              <th className="px-3 py-2.5 text-right">Time</th>
              <th className="px-3 py-2.5 text-right">Fare</th>
              <th className="px-3 py-2.5 text-right">Changes</th>
              <th className="px-3 py-2.5 text-right">Walk</th>
              <th className="px-4 py-2.5 text-right">Reliability</th>
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
                  <td className={`px-3 py-2.5 text-right ${best((x) => x.duration_min)}`}>{c.duration_min} min</td>
                  <td className={`px-3 py-2.5 text-right ${best((x) => x.cost_inr)}`}>₹{c.cost_inr}</td>
                  <td className={`px-3 py-2.5 text-right ${best((x) => x.transfers)}`}>{c.transfers}</td>
                  <td className={`px-3 py-2.5 text-right ${best((x) => x.walk_min)}`}>{c.walk_min}m</td>
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
  const labels: PlanLabel[] = ["fastest", "optimal", "cheapest"];
  const rows = labels.map((l) => ({ l, a: aware.cards.find((c) => c.label === l), b: baseline.cards.find((c) => c.label === l) }))
    .filter((r) => r.a && r.b);
  const changed = rows.some((r) => legSummary(r.a!) !== legSummary(r.b!) || r.a!.duration_min !== r.b!.duration_min || r.a!.reliability !== 1);
  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-container-lowest p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold"><Icon name="compare_arrows" className="text-primary" /> Normal app vs TravelBuddy</h2>
        <Link href="/compare" className="text-caption font-semibold text-primary hover:underline">Full evaluation →</Link>
      </div>
      <p className="text-small text-on-surface-variant">
        {changed ? "A schedule-only app ignores live reports. Here's what it would tell you for this same trip:"
          : "No live problem affects this trip right now, so a schedule-only app would show the same routes."}
      </p>
      {changed && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-small">
            <thead className="eyebrow">
              <tr><th className="py-1.5">Option</th><th className="py-1.5">Normal app</th><th className="py-1.5">TravelBuddy</th></tr>
            </thead>
            <tbody className="divide-y divide-hairline-soft">
              {rows.map(({ l, a, b }) => (
                <tr key={l}>
                  <td className="py-2 pr-2 font-semibold">{PLAN_LABEL[l]}</td>
                  <td className="py-2 pr-2">{legSummary(b!)}<span className="block text-on-surface-variant">{b!.duration_min} min · 100% (assumed)</span></td>
                  <td className="py-2">{legSummary(a!)}<span className={`block font-semibold ${a!.reliability < 0.9 ? "text-error" : "text-primary"}`}>{a!.duration_min} min · {pct(a!.reliability)} reliable</span></td>
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
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="flex flex-col gap-3 rounded-2xl bg-container-lowest p-5 shadow-sm">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-secondary-container text-on-secondary-container"><Icon name="cloud_off" /></span>
        <h2 className="text-xl font-semibold">Can’t reach the TravelBuddy server</h2>
        <p className="text-sm leading-relaxed text-on-surface-variant">
          Start the backend (<code className="rounded bg-container-low px-1">uvicorn app.main:app --port 8000</code>) and reload. Meanwhile, try an{" "}
          <Link href="/routes/TR3" className="font-semibold text-primary">example trip</Link>.
        </p>
        <details className="text-sm">
          <summary className="cursor-pointer font-semibold">Request that will be sent</summary>
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
