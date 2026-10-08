"use client";

// Home & Transit Hub — built from the team's design (stitch: mobilink_web_home_transit_hub).
// Frontend only: every value comes from lib/mockHome.ts until the backend is connected.

import Link from "next/link";
import { findPlace } from "@/lib/places";
import { EMPTY_FORM, NOW, travellerFromForm } from "@/lib/tripForm";
import { tripHref } from "@/lib/tripUrl";
import { travellers } from "@/lib/api";
import { frequentTrips, hero, TONE } from "@/lib/mockHome";
import { activeEvents, lineStatuses, modeStatuses } from "@/lib/network";
import { useLiveEvents } from "@/lib/useLiveEvents";
import Icon from "./Icon";
import MapView from "./MapView";

export default function HomeHub() {
  return (
    <main className="flex w-full flex-col px-4 pb-16 md:px-6">
      <Welcome />
      <FrequentTrips />
      <TransportModes />
      <section className="mt-6 grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-12">
        <NetworkPulse />
        <LiveMap />
      </section>
      <DemoTravellers />
    </main>
  );
}

/* ---------------------------------------------------------------- Welcome + quick route finder */
function Welcome() {
  const live = useLiveEvents();
  const evs = live?.events ?? [];
  const stats = [
    { label: "Confirmed problems", value: String(evs.filter((e) => e.status === "confirmed").length), accent: true },
    { label: "Reports checked", value: String(evs.reduce((n, e) => n + e.evidence.reduce((k, x) => k + Math.max(1, x.covers?.length ?? 0), 0), 0)), accent: false },
    { label: "Fakes rejected", value: String(evs.filter((e) => e.status === "coordinated" || e.status === "ignored").length), accent: false },
  ];
  return (
    <section className="relative mt-4 w-full overflow-hidden rounded-2xl bg-container-lowest p-6 shadow-sm">
      <div className="pointer-events-none absolute -right-20 -top-24 h-96 w-96 rounded-full bg-primary-fixed/30 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-48 h-64 w-64 rounded-full bg-secondary-container/40 blur-2xl" />

      <div className="relative z-10 mb-5 flex flex-col justify-between gap-5 xl:flex-row xl:items-center">
        <div className="flex max-w-2xl flex-col">
          <div className="mb-1 flex flex-wrap items-center gap-1">
            <span className="rounded-full bg-primary-fixed px-1 py-0.5 text-[11px] font-bold uppercase leading-[14px] tracking-wider text-on-primary-fixed">
              {hero.badge}
            </span>
            <span className="flex items-center gap-1 text-[13px] text-on-surface-variant">
              <span className={`h-2 w-2 rounded-full ${live?.source === "backend" ? "animate-ping bg-primary" : "bg-outline"}`} />
              {live?.source === "backend" ? `Pakka Check live · demo time ${live.asOf}` : "Server offline · sample data"}
            </span>
          </div>
          <h1 className="text-[26px] font-bold leading-snug tracking-tight md:text-[32px]">{hero.title}</h1>
          <p className="mt-1 text-base font-medium text-on-surface-variant">{hero.subtitle}</p>
        </div>
        <div className="flex items-center gap-4 self-start rounded-xl bg-container-low px-5 py-2 xl:self-auto">
          {stats.map((s, i) => (
            <div key={s.label} className="flex items-center gap-4">
              {i > 0 && <div className="h-8 w-px bg-container-highest" />}
              <div className="flex flex-col">
                <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">{s.label}</span>
                <span className={`text-xl font-bold ${s.accent ? "text-primary" : "text-on-surface"}`}>{s.value}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="relative z-10 flex flex-col items-start gap-3 rounded-xl bg-container-low p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-on-surface-variant">
          Where to? Set your start, destination, time, budget, walking and accessibility needs — routes are checked against live reports.
        </p>
        <Link href="/plan"
          className="flex h-12 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-lg bg-primary px-5 text-sm font-semibold text-on-primary shadow-sm transition-transform hover:bg-primary-container active:scale-95">
          <Icon name="alt_route" className="text-[20px]" /> Plan a trip <Icon name="arrow_forward" className="text-[18px]" />
        </Link>
      </div>
    </section>
  );
}

/** Route Results for two known places leaving "now"; falls back to the planner, pre-filled. */
function quickTripHref(from: string, to: string): string {
  const a = findPlace(from);
  const b = findPlace(to);
  if (!a || !b || a.label === b.label) return `/plan?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  return tripHref(travellerFromForm({
    ...EMPTY_FORM, from: a.label, to: b.label, time: NOW, priority: "fastest",
    modes: ["local", "metro", "bus", "auto", "taxi", "cab"],
  }));
}

/* ---------------------------------------------------------------- Daily frequent trips */
function FrequentTrips() {
  return (
    <section className="mt-5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Icon name="bookmark" className="text-[20px] text-primary" />
          <h2 className="text-lg font-semibold">Daily Frequent Trips</h2>
        </div>
        <span className="text-[13px] text-on-surface-variant">Tap a card to plan it right now, around live problems</span>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {frequentTrips.map((t) => (
          <Link key={t.id} href={quickTripHref(t.from, t.to)}
            className="group flex flex-col justify-between rounded-xl bg-container-lowest p-4 shadow-sm transition-all hover:shadow-md">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${t.iconClass}`}>
                  <Icon name={t.icon} className="text-[22px]" />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-semibold transition-colors group-hover:text-primary">{t.title}</span>
                  <span className="max-w-[180px] truncate text-[13px] text-on-surface-variant">{t.place}</span>
                </div>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between pt-1">
              <div className="flex min-w-0 items-center gap-1 text-[13px] text-on-surface-variant">
                <Icon name="route" className="text-[16px] text-primary" /> <span className="truncate">{t.from} → {t.to}</span>
              </div>
              <Icon name="arrow_forward" className="text-[20px] text-outline transition-all group-hover:translate-x-1 group-hover:text-primary" />
            </div>
          </Link>
        ))}
        <Link href="/plan"
          className="flex min-h-[108px] flex-col items-center justify-center gap-1 rounded-xl bg-container-low p-4 text-center transition-colors hover:bg-container">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-container-lowest text-primary shadow-sm">
            <Icon name="add" className="text-[20px]" />
          </span>
          <span className="mt-1 text-sm font-semibold">Plan any trip</span>
          <span className="text-[13px] text-on-surface-variant">Budget, walking, deadline, step-free…</span>
        </Link>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- 5 city transport modes */
const MODE_ICON_CLASS: Record<string, string> = {
  metro: "bg-primary/10 text-primary", local: "bg-tertiary-fixed text-tertiary", bus: "bg-secondary-container text-on-secondary-container",
  road: "bg-container text-on-surface", walk: "bg-primary-fixed text-on-primary-fixed",
};
const STATUS_ICON = { ok: "check_circle", warn: "warning", bad: "error" } as const;

function TransportModes() {
  const live = useLiveEvents();
  const modes = modeStatuses(activeEvents(live?.events));
  return (
    <section className="mt-6">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col">
          <h2 className="text-lg font-semibold">5 City Transport Modes</h2>
          <span className="text-[13px] text-on-surface-variant">Live status from Pakka Check: only confirmed or possible problems are shown</span>
        </div>
        <Link href="/report" className="flex items-center gap-0.5 text-xs font-semibold text-primary hover:underline">
          Live reports <Icon name="open_in_new" className="text-[16px]" />
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        {modes.map((m) => {
          const inner = (
            <>
              <div className="flex items-center justify-between">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${MODE_ICON_CLASS[m.id] ?? "bg-container"}`}>
                  <Icon name={m.icon} className="text-[24px]" />
                </div>
                <span className={`h-2.5 w-2.5 rounded-full ${TONE[m.tone].dot}`} title={`Live status: ${m.label}`} />
              </div>
              <div className="mt-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                  <span className="text-lg font-semibold">{m.name}</span>
                  <span className="text-[11px] font-bold text-on-surface-variant">{m.detail}</span>
                </div>
                <div className={`mt-1 flex items-center gap-1 text-[11px] font-bold ${TONE[m.tone].text}`}>
                  <Icon name={STATUS_ICON[m.tone]} className="text-[14px]" /> {m.label}
                </div>
              </div>
            </>
          );
          const cls = "flex flex-col justify-between rounded-xl bg-container-lowest p-4 shadow-sm transition-all hover:shadow-md";
          return m.event ? <Link key={m.id} href={`/events/${m.event.event_id}`} className={cls}>{inner}</Link> : <div key={m.id} className={cls}>{inner}</div>;
        })}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- Live transit network pulse */
function NetworkPulse() {
  const live = useLiveEvents();
  const rows = lineStatuses(activeEvents(live?.events));
  return (
    <div className="flex flex-col gap-4 lg:col-span-7">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Live Transit Network Pulse</h2>
          <p className="text-[13px] text-on-surface-variant">Every line, with its worst problem checked by Pakka Check</p>
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-container px-2 py-1">
          <span className={`h-2 w-2 rounded-full ${live?.source === "backend" ? "animate-pulse bg-primary" : "bg-outline"}`} />
          <span className="text-[11px] font-bold">{live?.source === "backend" ? `Refreshes every 5 s · ${live.asOf}` : "Sample data"}</span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl bg-container-lowest shadow-sm">
        <div className="min-w-[520px]">
          <div className="grid grid-cols-12 bg-container-low px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
            <div className="col-span-5">Transit Corridor</div>
            <div className="col-span-5 text-center">Status (Pakka Check)</div>
            <div className="col-span-2 text-right">Problems</div>
          </div>
          {rows.map((r, i) => (
            <div key={r.line_id}>
              {i > 0 && <div className="h-px bg-container" />}
              <div className="grid grid-cols-12 items-center px-4 py-3 transition-colors hover:bg-container-low/50">
                <div className="col-span-5 flex items-center gap-2">
                  <span className="flex h-8 min-w-8 shrink-0 items-center justify-center rounded-lg px-1 text-[11px] font-bold text-white" style={{ background: r.color }}>{r.code}</span>
                  <span className="truncate text-sm font-semibold">{r.name}</span>
                </div>
                <div className="col-span-5 flex justify-center">
                  {r.event ? (
                    <Link href={`/events/${r.event.event_id}`} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold hover:underline ${TONE[r.tone].chip}`}>{r.label}</Link>
                  ) : (
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONE[r.tone].chip}`}>{r.label}</span>
                  )}
                </div>
                <div className="col-span-2 text-right text-xs font-semibold">{r.reports}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-primary-fixed/40 p-4">
        <div className="flex items-center gap-2">
          <Icon name="verified_user" className="text-[24px] text-primary" />
          <span className="text-[13px] text-on-primary-fixed">A problem changes your route only after Pakka Check confirms it from several sources (≥ 70%).</span>
        </div>
        <Link href="/transparency" className="rounded bg-container-lowest px-2 py-1 text-[11px] font-bold text-primary shadow-sm hover:bg-container">
          How it works
        </Link>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Live transit map */
function LiveMap() {
  const live = useLiveEvents();
  const active = activeEvents(live?.events);
  const confirmed = active.filter((e) => e.status === "confirmed").length;
  return (
    <div className="flex flex-col gap-4 lg:col-span-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Live Transit Map</h2>
          <p className="text-[13px] text-on-surface-variant">Rail &amp; metro network with live problems</p>
        </div>
        <span className="rounded-full bg-container px-1.5 py-0.5 text-[11px] font-semibold">{active.length} on map</span>
      </div>

      <div className="relative h-[370px] w-full overflow-hidden rounded-xl bg-container-lowest shadow-sm">
        <div className="absolute inset-0">
          <MapView showNetwork events={active} />
        </div>
        <div className="pointer-events-none absolute left-14 top-3 z-[500] flex items-center gap-1 rounded-lg bg-container-lowest/95 px-2 py-1 shadow-sm backdrop-blur-md">
          <span className={`h-2 w-2 rounded-full ${confirmed ? "animate-ping bg-error" : "bg-primary"}`} />
          <span className="text-[11px] font-semibold">{confirmed ? `${confirmed} confirmed problem${confirmed === 1 ? "" : "s"}` : "No confirmed problems"}</span>
        </div>
        <div className="absolute inset-x-3 bottom-3 z-[500] flex items-center justify-between rounded-xl bg-container-lowest/95 p-2 shadow-md backdrop-blur-md">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-tertiary-fixed text-tertiary">
              <Icon name="campaign" className="text-[20px]" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold">Seeing a problem?</span>
              <span className="text-[13px] text-on-surface-variant">Your report is checked before it reroutes anyone</span>
            </div>
          </div>
          <Link href="/report" className="rounded-lg bg-primary px-2 py-1.5 text-[11px] font-bold text-on-primary shadow-sm transition-colors hover:bg-primary-container">
            Report
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- 5 demo travellers */
const PERSONA_ICON: Record<string, string> = { TR1: "accessible", TR2: "school", TR3: "sports_cricket", TR4: "family_restroom", TR5: "no_crash" };

function DemoTravellers() {
  return (
    <section className="mt-6 flex flex-col gap-3 rounded-xl bg-container-lowest p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Try a demo traveller</h2>
          <p className="text-[13px] text-on-surface-variant">Five real Mumbai situations, one click each. Routes use the live demo clock.</p>
        </div>
        <Link href="/compare" className="text-xs font-semibold text-primary hover:underline">How they do vs a normal app →</Link>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {travellers.map((t) => (
          <Link key={t.traveller_id} href={t.itinerary ? `/itinerary?demo=${t.traveller_id}` : `/routes/${t.traveller_id}`}
            className="group flex flex-col gap-2 rounded-xl bg-container-low p-3 transition-colors hover:bg-container">
            <div className="flex items-center gap-2">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary text-on-primary">
                <Icon name={PERSONA_ICON[t.traveller_id] ?? "person"} className="text-[20px]" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold group-hover:text-primary">{t.name}</span>
                <span className="block text-[11px] font-bold text-on-surface-variant">{t.traveller_id}{t.itinerary ? " · day plan" : ""}</span>
              </span>
            </div>
            <p className="line-clamp-3 text-[12px] text-on-surface-variant">{t.story}</p>
            <span className="mt-auto flex items-center gap-1 text-[12px] font-semibold text-primary">
              <Icon name="play_circle" className="text-[16px]" /> Open story{t.demo ? ` · moment at ${t.demo.moment}` : ""}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
