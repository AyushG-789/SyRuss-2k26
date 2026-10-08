"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getLiveEvents, getPlan, type LiveEvents, planRequest, RoutingNotConnected } from "@/lib/api";
import { placeName } from "@/lib/format";
import type { PlanResponse, Traveller } from "@/lib/types";
import RouteCard from "./RouteCard";

const RouteMap = dynamic(() => import("./RouteMap"), {
  ssr: false,
  loading: () => <div className="grid h-full min-h-80 place-items-center text-sm text-muted">Loading map…</div>,
});

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "not_connected"; live: LiveEvents }
  | { status: "ready"; plan: PlanResponse; live: LiveEvents };

export default function PlanView({ traveller }: { traveller: Traveller | null }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!traveller) return;
    let cancelled = false;
    Promise.all([getPlan(traveller), getLiveEvents()])
      .then(([plan, live]) => {
        if (cancelled) return;
        setState({ status: "ready", plan, live });
        setSelectedId((plan.cards.find((c) => c.recommended) ?? plan.cards[0])?.plan_id ?? null);
      })
      .catch(async (err: unknown) => {
        if (cancelled) return;
        if (err instanceof RoutingNotConnected) {
          setState({ status: "not_connected", live: await getLiveEvents() });
        } else {
          setState({ status: "error", message: err instanceof Error ? err.message : String(err) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [traveller]);

  if (!traveller) {
    return <p className="mx-auto w-full max-w-6xl px-4 py-6">This trip link is broken — go back and plan it again.</p>;
  }

  const destination = (state.status === "ready" && state.plan.destination) || traveller.destination;
  const constraints = [
    traveller.leave_at && `Leave ${traveller.leave_at}`,
    traveller.arrive_by && `${traveller.hard_deadline ? "Must arrive" : "Arrive"} by ${traveller.arrive_by}`,
    traveller.max_budget_inr && `≤ ₹${traveller.max_budget_inr}`,
    traveller.max_walk_min && `≤ ${traveller.max_walk_min} min walk`,
    traveller.step_free && "♿ Step-free",
  ].filter(Boolean) as string[];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-4">
      <div className="flex flex-col gap-1">
        <Link href="/" className="text-sm text-muted hover:text-text">
          ← All travellers
        </Link>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          {traveller.origin.label} → {destination?.label ?? "Day itinerary"}
        </h1>
        <p className="text-sm text-muted">
          {traveller.name}
          {state.status === "ready" && state.plan.as_of ? ` · live reports as of ${state.plan.as_of}` : ""}
        </p>
        <ul className="mt-1 flex flex-wrap gap-1.5">
          {constraints.map((c) => (
            <li key={c} className="rounded-full bg-surface-2 px-2.5 py-1 text-xs text-muted">
              {c}
            </li>
          ))}
        </ul>
      </div>

      {state.status === "loading" && <p className="text-muted">Finding routes…</p>}
      {state.status === "error" && (
        <p className="rounded-xl border border-bad/40 bg-bad-soft p-3 text-sm text-bad">
          Couldn’t load the plan: {state.message}
        </p>
      )}

      {state.status === "not_connected" && destination && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
            <h2 className="font-semibold">Your trip is ready to plan</h2>
            <p className="text-sm leading-relaxed text-muted">
              The routing engine isn’t connected yet, so there are no route cards for custom trips. Once
              <code className="mx-1 rounded bg-surface-2 px-1">POST /plan</code> is live on the backend, this page will show
              Fastest, Optimal and Cheapest plans here automatically.
            </p>
            <details className="text-sm">
              <summary className="cursor-pointer font-medium">Request that will be sent</summary>
              <pre className="mt-2 max-h-72 overflow-auto rounded-xl bg-surface-2 p-3 text-xs">
                {JSON.stringify(planRequest(traveller), null, 2)}
              </pre>
            </details>
          </div>
          <div className="h-[55vh] min-h-80 overflow-hidden rounded-2xl border border-line">
            <RouteMap card={null} origin={traveller.origin} destination={destination} events={state.live.events} />
          </div>
          <EventsSource live={state.live} />
        </div>
      )}

      {state.status === "ready" && destination && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="flex flex-col gap-3">
            {state.plan.cards.map((card) => (
              <RouteCard
                key={card.plan_id}
                card={card}
                selected={card.plan_id === selectedId}
                onSelect={() => setSelectedId(card.plan_id)}
              />
            ))}

            {state.plan.notes && state.plan.notes.length > 0 && (
              <ul className="flex flex-col gap-1 text-sm text-muted">
                {state.plan.notes.map((n) => (
                  <li key={n}>ℹ️ {n}</li>
                ))}
              </ul>
            )}

            {state.plan.rejected.length > 0 && (
              <details className="rounded-2xl border border-line bg-surface p-4" open>
                <summary className="cursor-pointer text-sm font-semibold">
                  Rejected options ({state.plan.rejected.length})
                </summary>
                <ul className="mt-2 flex flex-col gap-2 text-sm">
                  {state.plan.rejected.map((r) => (
                    <li key={r.summary}>
                      <span className="font-medium">{r.summary}</span>
                      <span className="text-muted"> — {r.reason}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>

          <div className="flex flex-col gap-2 lg:sticky lg:top-20 lg:self-start">
            <div className="h-[55vh] min-h-80 overflow-hidden rounded-2xl border border-line">
              <RouteMap
                card={state.plan.cards.find((c) => c.plan_id === selectedId) ?? null}
                origin={traveller.origin}
                destination={destination}
                events={state.live.events}
              />
            </div>
            <SelectedLegs plan={state.plan} selectedId={selectedId} traveller={traveller} />
            <MapLegend />
            <EventsSource live={state.live} />
          </div>
        </div>
      )}
    </div>
  );
}

function SelectedLegs({ plan, selectedId, traveller }: { plan: PlanResponse; selectedId: string | null; traveller: Traveller }) {
  const card = plan.cards.find((c) => c.plan_id === selectedId);
  if (!card) return null;
  return (
    <ol className="flex flex-col gap-1 rounded-2xl border border-line bg-surface p-3 text-sm">
      {card.legs.map((leg, i) => (
        <li key={i} className="flex gap-3">
          <span className="w-24 shrink-0 tabular-nums text-muted">
            {leg.depart}–{leg.arrive}
          </span>
          <span>
            {leg.event_ids.length > 0 && leg.risk >= 0.3 ? "⚠️ " : ""}
            {placeName(leg.from_id, traveller, plan.destination?.label)} → {placeName(leg.to_id, traveller, plan.destination?.label)}
            <span className="text-muted">
              {" "}
              · {leg.mode}
              {leg.cost_inr ? ` · ₹${leg.cost_inr}` : ""}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function EventsSource({ live }: { live: LiveEvents }) {
  if (live.source === "backend") {
    return (
      <p className="text-xs text-good">
        ● Disruptions live from Pakka Check at {live.asOf} (demo clock) · {live.events.length} reported
      </p>
    );
  }
  return <p className="text-xs text-muted">○ Disruptions from sample data — start the backend to see live Pakka Check results.</p>;
}

function MapLegend() {
  const items = [
    { color: "var(--bad)", label: "Confirmed" },
    { color: "var(--warn)", label: "Possible" },
    { color: "var(--grey)", label: "Ignored / suspicious" },
  ];
  return (
    <div className="flex flex-wrap gap-3 text-xs text-muted">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: it.color }} aria-hidden />
          {it.label}
        </span>
      ))}
      <span>· dashed = walk / taxi</span>
    </div>
  );
}
