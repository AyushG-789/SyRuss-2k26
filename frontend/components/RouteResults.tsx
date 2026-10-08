"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getClock, getPlan, planRequest, RoutingNotConnected, USE_MOCKS } from "@/lib/api";
import { toMin } from "@/lib/geo";
import { legColor, lineShortName, MODE_LABEL, PLAN_LABEL, pct, placeName, readableRoute } from "@/lib/format";
import { startTrip } from "@/lib/savedTrip";
import type { PlanLabel, PlanResponse, RouteCard, Traveller } from "@/lib/types";
import { activeEvents } from "@/lib/network";
import { useLiveEvents } from "@/lib/useLiveEvents";
import Icon from "./Icon";
import MapView from "./MapView";

type State = { status: "loading" } | { status: "error"; message: string } | { status: "not_connected" } | { status: "ready"; plan: PlanResponse };

const LABEL_STYLE: Record<PlanLabel, { icon: string; chip: string }> = {
  optimal: { icon: "auto_awesome", chip: "bg-primary-fixed text-on-primary-fixed" },
  fastest: { icon: "bolt", chip: "bg-secondary-container text-on-secondary-container" },
  cheapest: { icon: "savings", chip: "bg-tertiary-fixed text-tertiary" },
};
const REL_STYLE = {
  green: "bg-primary-soft text-primary-ink",
  yellow: "bg-amber-soft text-amber-ink",
  red: "bg-error-container text-on-error-container",
} as const;

export default function RouteResults({ traveller }: { traveller: Traveller | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const live = useLiveEvents();
  const [state, setState] = useState<State>({ status: "loading" });
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
    return () => { cancelled = true; };
  }, [traveller]);

  const plan = state.status === "ready" ? state.plan : null;
  const active = useMemo(() => activeEvents(live?.events), [live]);
  const destination = plan?.destination ?? traveller?.destination ?? null;
  const selected = plan?.cards.find((c) => c.plan_id === selectedId) ?? null;
  const ordered = useMemo(() => {
    const order: PlanLabel[] = ["optimal", "fastest", "cheapest"];
    return plan ? [...plan.cards].sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label)) : [];
  }, [plan]);

  if (!traveller) return <p className="mx-auto w-full max-w-7xl px-6 py-6">This trip link is broken — plan it again.</p>;

  async function startTracking(card: RouteCard) {
    const qs = search.toString();
    const fresh = await freshCard(traveller!, card);
    await startTrip({ traveller: traveller!, destination, card: fresh, resultsHref: qs ? `${pathname}?${qs}` : pathname, savedAt: new Date().toISOString() });
    router.push("/track");
  }

  const chips = [
    { icon: "schedule", text: traveller.leave_at ? `Leave ${traveller.leave_at}` : traveller.arrive_by ? "Leave now" : `Leave now${plan?.as_of ? ` (${plan.as_of})` : ""}` },
    traveller.arrive_by && { icon: "flag", text: `${traveller.hard_deadline ? "Must arrive" : "Arrive"} by ${traveller.arrive_by}` },
    traveller.max_budget_inr && { icon: "payments", text: `≤ ₹${traveller.max_budget_inr}` },
    traveller.max_walk_min && { icon: "directions_walk", text: `≤ ${traveller.max_walk_min} min walk` },
    traveller.step_free && { icon: "accessible", text: "Step-free" },
  ].filter(Boolean) as { icon: string; text: string }[];

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-6 md:px-6">
      {/* ---- Header ---- */}
      <section className="card flex flex-wrap items-center gap-4 p-4">
        <span className="grid h-12 w-12 place-items-center rounded-xl bg-primary text-on-primary"><Icon name="directions_transit" /></span>
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-bold md:text-2xl">
            {traveller.origin.label} <Icon name="arrow_forward" className="text-primary" /> {destination?.label ?? "Day itinerary"}
          </h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-on-surface-variant">
            <span>{traveller.traveller_id === "CUSTOM" ? "Your trip" : traveller.name}</span>
            {plan?.as_of && <span className="flex items-center gap-1"><Icon name="sensors" className="text-[16px]" /> reports as of {plan.as_of}</span>}
            {USE_MOCKS && plan && traveller.traveller_id !== "CUSTOM" && <span className="rounded-full bg-amber-soft px-2 py-0.5 font-semibold text-amber-ink">Sample route numbers</span>}
          </p>
        </div>
        <div className="flex w-full flex-wrap gap-1.5 xl:w-auto">
          {chips.map((c) => (
            <span key={c.text} className="flex items-center gap-1 rounded-xl bg-container-low px-3 py-2 text-[13px] font-semibold">
              <Icon name={c.icon} className="text-[18px] text-on-surface-variant" /> {c.text}
            </span>
          ))}
          <Link href="/plan" className="btn-secondary !min-h-9 text-[13px]"><Icon name="edit" className="text-[18px]" /> Change</Link>
        </div>
      </section>

      {state.status === "loading" && <p className="text-on-surface-variant">Finding routes…</p>}
      {state.status === "error" && <p className="rounded-xl bg-error-container p-3 text-sm text-on-error-container">Couldn’t load routes: {state.message}</p>}
      {state.status === "not_connected" && (
        <NotConnected traveller={traveller} destination={destination} />
      )}

      {plan && (
        <>
          {/* ---- Sort tabs ---- */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] font-bold uppercase tracking-wider text-outline">Plans</span>
            {ordered.map((c) => {
              const on = c.plan_id === selectedId;
              return (
                <button key={c.plan_id} onClick={() => setSelectedId(c.plan_id)} aria-pressed={on}
                  className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
                    on ? "bg-primary text-on-primary" : "bg-container-lowest text-on-surface shadow-card hover:bg-container-low"}`}>
                  <Icon name={LABEL_STYLE[c.label].icon} className="text-[18px]" fill={on} />
                  {PLAN_LABEL[c.label]}{c.recommended ? " (recommended)" : ""}
                  <span className={on ? "text-on-primary/80" : "text-on-surface-variant"}>{c.duration_min} min · ₹{c.cost_inr}</span>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            {/* ---- Cards ---- */}
            <div className="flex flex-col gap-4">
              {ordered.map((card) => (
                <ResultCard key={card.plan_id} card={card} traveller={traveller} destinationLabel={destination?.label}
                  selected={card.plan_id === selectedId} onSelect={() => setSelectedId(card.plan_id)} onTrack={() => startTracking(card)} />
              ))}
              {(plan.notes?.length ?? 0) > 0 && (
                <ul className="flex flex-col gap-1.5">
                  {plan.notes!.map((n) => (
                    <li key={n} className="flex items-start gap-2 rounded-xl bg-container-low px-3 py-2 text-[13px] text-on-surface-variant">
                      <Icon name="info" className="text-[18px] text-secondary" /> {n}
                    </li>
                  ))}
                </ul>
              )}
              {plan.rejected.length > 0 && (
                <section className="card p-4">
                  <h2 className="mb-2 flex items-center gap-2 font-semibold"><Icon name="block" className="text-error" /> Rejected options</h2>
                  <ul className="flex flex-col divide-y divide-hairline-soft text-sm">
                    {plan.rejected.map((r) => (
                      <li key={r.summary} className="py-2">
                        <span className="font-semibold">{readableRoute(r.summary)}</span>
                        <span className="block text-on-surface-variant">{r.reason}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>

            {/* ---- Map + trade-off matrix ---- */}
            <div className="flex flex-col gap-6 lg:sticky lg:top-20 lg:self-start">
              <div className="card relative h-[460px] overflow-hidden">
                {destination && <MapView card={selected} origin={traveller.origin} destination={destination} events={active} />}
                {selected && (
                  <div className="absolute inset-x-3 bottom-3 z-[500] flex flex-wrap items-center gap-3 rounded-2xl bg-container-lowest p-4 shadow-float">
                    <div className="min-w-0 flex-1">
                      <span className="rounded-md bg-primary px-2 py-0.5 text-[11px] font-bold uppercase text-on-primary">Selected</span>
                      <p className="mt-1 truncate font-semibold">{PLAN_LABEL[selected.label]} · {legSummary(selected)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold tabular-nums text-primary">{selected.duration_min} min</p>
                      <p className="text-sm font-semibold tabular-nums">₹{selected.cost_inr}</p>
                    </div>
                    <button onClick={() => startTracking(selected)} className="btn-primary">
                      <Icon name="navigation" /> Start trip
                    </button>
                  </div>
                )}
              </div>
              <TradeOffMatrix cards={ordered} selectedId={selectedId} onSelect={setSelectedId} />
              <p className="flex items-center gap-2 text-[12px] text-outline">
                <Icon name="sensors" className="text-[16px]" />
                Map dots: {live?.source === "backend" ? `live Pakka Check at ${live.asOf}` : "sample disruptions"}
              </p>
            </div>
          </div>
        </>
      )}
    </main>
  );
}

function legSummary(card: RouteCard): string {
  return card.legs.filter((l) => l.mode !== "walk").map((l) => (l.line_id ? lineShortName(l.line_id) : MODE_LABEL[l.mode])).join(" → ") || "Walk";
}

function ResultCard({ card, traveller, destinationLabel, selected, onSelect, onTrack }: {
  card: RouteCard; traveller: Traveller; destinationLabel?: string; selected: boolean; onSelect: () => void; onTrack: () => void;
}) {
  const [showSteps, setShowSteps] = useState(false);
  const first = card.legs[0];
  const last = card.legs[card.legs.length - 1];
  const risky = card.legs.some((l) => l.event_ids.length > 0 && l.risk >= 0.3);
  return (
    <article className={`card flex flex-col gap-4 p-5 transition ${selected ? "ring-2 ring-primary" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-bold ${LABEL_STYLE[card.label].chip}`}>
          <Icon name={LABEL_STYLE[card.label].icon} className="text-[16px]" /> {card.recommended ? "Recommended · " : ""}{PLAN_LABEL[card.label]}
        </span>
        <span className={`rounded-full px-2.5 py-1 text-[12px] font-bold ${REL_STYLE[card.reliability_colour]}`}>
          {pct(card.reliability)} reliable
        </span>
        {risky && (
          <span className="flex items-center gap-1 rounded-full bg-error-container px-2.5 py-1 text-[12px] font-bold text-on-error-container">
            <Icon name="warning" className="text-[16px]" /> Disruption on route
          </span>
        )}
        <span className="ml-auto text-[12px] font-semibold text-on-surface-variant">Score {card.score.toFixed(1)}/10</span>
      </div>

      <div className="flex items-end justify-between gap-3">
        <p className="flex items-baseline gap-2">
          <span className="text-3xl font-bold tabular-nums">{card.duration_min} min</span>
          <span className="text-sm text-on-surface-variant tabular-nums">{first.depart} → {last.arrive}</span>
        </p>
        <p className="text-right">
          <span className="block text-3xl font-bold tabular-nums text-primary">₹{card.cost_inr}</span>
          <span className="text-[12px] text-on-surface-variant">{card.transfers} change{card.transfers === 1 ? "" : "s"} · {card.walk_min} min walk</span>
        </p>
      </div>

      <ol className="flex flex-wrap items-center gap-2 rounded-xl bg-container-low p-3 text-sm">
        {card.legs.map((leg, i) => {
          const disrupted = leg.event_ids.length > 0 && leg.risk >= 0.3;
          return (
            <li key={i} className="flex items-center gap-2">
              {i > 0 && <Icon name="chevron_right" className="text-[18px] text-outline" />}
              {leg.mode === "walk" ? (
                <span className={`flex items-center gap-0.5 ${disrupted ? "font-semibold text-error" : "text-on-surface-variant"}`}>
                  {disrupted && <Icon name="warning" className="text-[16px]" />}
                  <Icon name="directions_walk" className="text-[18px]" />{leg.duration_min}′
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <span className="rounded-md px-1.5 py-0.5 text-[11px] font-bold text-white" style={{ backgroundColor: legColor(leg) }}>
                    {disrupted ? "⚠ " : ""}{leg.line_id ? lineShortName(leg.line_id) : MODE_LABEL[leg.mode]}
                  </span>
                  <span className="font-semibold tabular-nums">{leg.duration_min}m</span>
                </span>
              )}
            </li>
          );
        })}
      </ol>

      <p className="flex items-start gap-2 text-sm">
        <Icon name="tips_and_updates" className="text-[18px] text-primary" /> {card.reason}
      </p>

      {showSteps && (
        <ol className="flex flex-col gap-0 border-l-2 border-primary/40 pl-4">
          {card.legs.map((leg, i) => (
            <li key={i} className="relative pb-3 text-sm last:pb-0">
              <span className={`absolute -left-[22px] top-1 h-3 w-3 rounded-full border-2 border-container-lowest ${leg.mode === "walk" ? "bg-outline" : "bg-primary"}`} />
              <span className="tabular-nums text-on-surface-variant">{leg.depart}–{leg.arrive}</span>{" "}
              <span className="font-semibold">{placeName(leg.from_id, traveller, destinationLabel)} → {placeName(leg.to_id, traveller, destinationLabel)}</span>
              <span className="text-on-surface-variant"> · {leg.line_id ? lineShortName(leg.line_id) : MODE_LABEL[leg.mode]}{leg.cost_inr ? ` · ₹${leg.cost_inr}` : ""}</span>
            </li>
          ))}
        </ol>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setShowSteps((v) => !v)} className="mr-auto flex items-center gap-1 text-sm font-semibold text-primary">
          {showSteps ? "Hide steps" : `View ${card.legs.length} steps`} <Icon name={showSteps ? "expand_less" : "expand_more"} className="text-[18px]" />
        </button>
        {!selected && <button onClick={onSelect} className="btn-secondary">Show on map</button>}
        <button onClick={onTrack} className={selected ? "btn-primary" : "btn-secondary"}>
          <Icon name="navigation" className="text-[18px]" /> Start trip
        </button>
      </div>
    </article>
  );
}

function TradeOffMatrix({ cards, selectedId, onSelect }: { cards: RouteCard[]; selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between p-4">
        <h2 className="flex items-center gap-2 font-semibold"><Icon name="table_chart" className="text-primary" /> Trade-off matrix</h2>
        <span className="text-[12px] text-on-surface-variant">time · cost · changes · walking · risk</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-container-low text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
            <tr>
              <th className="px-4 py-2.5">Plan</th>
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
                  <td className="px-4 py-2.5 font-semibold">{PLAN_LABEL[c.label]}</td>
                  <td className={`px-3 py-2.5 text-right ${best((x) => x.duration_min)}`}>{c.duration_min}m</td>
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

function NotConnected({ traveller, destination }: { traveller: Traveller; destination: Traveller["destination"] }) {
  const live = useLiveEvents();
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="card flex flex-col gap-3 p-5">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-secondary-container text-on-secondary-container"><Icon name="engineering" /></span>
        <h2 className="text-xl font-bold">Your trip is ready to plan</h2>
        <p className="text-sm leading-relaxed text-on-surface-variant">
          The routing engine isn’t connected yet, so custom trips don’t have route cards. Once <code className="rounded bg-container-low px-1">POST /plan</code> is
          live on the backend, Optimal, Fastest and Cheapest plans appear here automatically.
        </p>
        <p className="text-sm">Meanwhile, try an <Link href="/routes/TR3" className="font-semibold text-primary">example trip</Link>.</p>
        <details className="text-sm">
          <summary className="cursor-pointer font-semibold">Request that will be sent</summary>
          <pre className="mt-2 max-h-72 overflow-auto rounded-xl bg-container-low p-3 text-xs">{JSON.stringify(planRequest(traveller), null, 2)}</pre>
        </details>
      </section>
      <div className="card h-[420px] overflow-hidden">
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
