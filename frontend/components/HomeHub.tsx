"use client";

// Home & Transit Hub — built from the team's design (stitch: mobilink_web_home_transit_hub).
// Frontend only: every value comes from lib/mockHome.ts until the backend is connected.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { findPlace, PLACE_OPTIONS } from "@/lib/places";
import { EMPTY_FORM, NOW, travellerFromForm } from "@/lib/tripForm";
import { tripHref } from "@/lib/tripUrl";
import { frequentTrips, hero, liveMap, modes, pulse, recentJourneys, TONE } from "@/lib/mockHome";
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
      <section className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-12">
        <RecentJourneys />
      </section>
    </main>
  );
}

/* ---------------------------------------------------------------- Welcome + quick route finder */
function Welcome() {
  const router = useRouter();
  const [from, setFrom] = useState(hero.defaultFrom);
  const [to, setTo] = useState(hero.defaultTo);
  const [depart, setDepart] = useState<string>(hero.departOptions[0].label);
  const listId = useId();

  // Both places recognised → straight to Route Results. Otherwise open the planner, pre-filled,
  // so the traveller only fixes the place that wasn't found.
  function findRoutes(e: React.FormEvent) {
    e.preventDefault();
    const a = findPlace(from);
    const b = findPlace(to);
    if (a && b && a.label !== b.label) {
      const d = hero.departOptions.find((o) => o.label === depart) ?? hero.departOptions[0];
      router.push(tripHref(travellerFromForm({
        ...EMPTY_FORM, from: a.label, to: b.label, timeMode: d.mode, time: d.time,
        priority: "fastest", modes: ["local", "metro", "bus", "auto", "taxi", "cab"],
      })));
      return;
    }
    router.push(`/plan?from=${encodeURIComponent(a?.label ?? from)}&to=${encodeURIComponent(b?.label ?? to)}`);
  }

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
              <span className="h-2 w-2 animate-ping rounded-full bg-primary" /> {hero.live}
            </span>
          </div>
          <h1 className="text-[26px] font-bold leading-snug tracking-tight md:text-[32px]">{hero.title}</h1>
          <p className="mt-1 text-base font-medium text-on-surface-variant">{hero.subtitle}</p>
        </div>
        <div className="flex items-center gap-4 self-start rounded-xl bg-container-low px-5 py-2 xl:self-auto">
          {hero.stats.map((s, i) => (
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

      <div className="relative z-10 rounded-xl bg-container-low p-4 shadow-sm">
        <datalist id={listId}>{PLACE_OPTIONS.map((p) => <option key={p.label} value={p.label} />)}</datalist>
        <form onSubmit={findRoutes} className="grid grid-cols-1 items-center gap-2 md:grid-cols-12">
          <div className="relative flex items-center rounded-lg bg-container-lowest px-4 py-2 shadow-sm transition-all focus-within:ring-2 focus-within:ring-primary md:col-span-5 xl:col-span-4">
            <Icon name="trip_origin" className="mr-1 text-primary" />
            <div className="flex min-w-0 flex-1 flex-col">
              <label htmlFor="origin" className="text-[11px] font-bold leading-none text-on-surface-variant">From (Origin)</label>
              <input id="origin" list={listId} autoComplete="off" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="Station, Landmark, or Area"
                className="w-full truncate bg-transparent pt-0.5 text-sm focus:outline-none" />
            </div>
            <button type="button" title="Use current location" className="ml-1 text-outline transition-colors hover:text-primary">
              <Icon name="my_location" className="text-[18px]" />
            </button>
          </div>

          <div className="flex justify-center md:col-span-2 xl:col-span-1">
            <button type="button" onClick={() => { setFrom(to); setTo(from); }} aria-label="Swap origin and destination"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-container-high text-on-surface-variant transition-transform hover:rotate-180 hover:bg-container-highest">
              <Icon name="swap_horiz" className="text-[20px]" />
            </button>
          </div>

          <div className="relative flex items-center rounded-lg bg-container-lowest px-4 py-2 shadow-sm transition-all focus-within:ring-2 focus-within:ring-primary md:col-span-5 xl:col-span-4">
            <Icon name="pin_drop" className="mr-1 text-tertiary" />
            <div className="flex min-w-0 flex-1 flex-col">
              <label htmlFor="dest" className="text-[11px] font-bold leading-none text-on-surface-variant">To (Destination)</label>
              <input id="dest" list={listId} autoComplete="off" value={to} onChange={(e) => setTo(e.target.value)} placeholder="Station, Tech Park, Metro Gate"
                className="w-full truncate bg-transparent pt-0.5 text-sm focus:outline-none" />
            </div>
          </div>

          <div className="flex items-center gap-1 md:col-span-12 xl:col-span-3">
            <div className="flex min-w-[7.5rem] flex-1 items-center gap-1 rounded-lg bg-container-lowest px-2 py-2 shadow-sm">
              <Icon name="schedule" className="text-[18px] text-outline" />
              <select value={depart} onChange={(e) => setDepart(e.target.value)} aria-label="Departure time"
                className="w-full cursor-pointer bg-transparent text-xs font-semibold focus:outline-none">
                {hero.departOptions.map((o) => <option key={o.label}>{o.label}</option>)}
              </select>
            </div>
            <button type="submit"
              className="flex h-12 items-center justify-center gap-1 whitespace-nowrap rounded-lg bg-primary px-4 text-sm font-semibold text-on-primary shadow-sm transition-transform hover:bg-primary-container active:scale-95">
              Find Routes <Icon name="arrow_forward" className="text-[18px]" />
            </button>
          </div>
        </form>
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
        <span className="text-[13px] text-on-surface-variant">Tap card to calculate fastest multi-leg transit right now</span>
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
              <span className={`rounded-full px-1 py-0.5 text-[11px] font-bold ${TONE[t.badge.tone].chip}`}>{t.badge.text}</span>
            </div>
            <div className="mt-4 flex items-center justify-between pt-1">
              <div className="flex items-center gap-1 text-[13px] text-on-surface-variant">
                <Icon name={t.via.icon} className={`text-[16px] ${t.via.iconClass}`} /> {t.via.text}
              </div>
              <Icon name="arrow_forward" className="text-[20px] text-outline transition-all group-hover:translate-x-1 group-hover:text-primary" />
            </div>
          </Link>
        ))}
        <button type="button"
          className="flex min-h-[108px] flex-col items-center justify-center gap-1 rounded-xl bg-container-low p-4 text-center transition-colors hover:bg-container">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-container-lowest text-primary shadow-sm">
            <Icon name="add" className="text-[20px]" />
          </span>
          <span className="mt-1 text-sm font-semibold">+ Add Saved Place</span>
          <span className="text-[13px] text-on-surface-variant">Airport, Gym, or University Campus</span>
        </button>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- 5 city transport modes */
function TransportModes() {
  return (
    <section className="mt-6">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col">
          <h2 className="text-lg font-semibold">5 City Transport Modes</h2>
          <span className="text-[13px] text-on-surface-variant">Live operational status across all MMR infrastructure lines</span>
        </div>
        <Link href="/plan" className="flex items-center gap-0.5 text-xs font-semibold text-primary hover:underline">
          Network Timetable <Icon name="open_in_new" className="text-[16px]" />
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        {modes.map((m) => (
          <div key={m.id} className="flex flex-col justify-between rounded-xl bg-container-lowest p-4 shadow-sm transition-all hover:shadow-md">
            <div className="flex items-center justify-between">
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${m.iconClass}`}>
                <Icon name={m.icon} className="text-[24px]" />
              </div>
              <span className={`h-2.5 w-2.5 rounded-full ${TONE[m.tone].dot}`} title={`Live status: ${m.status.text}`} />
            </div>
            <div className="mt-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                <span className="text-lg font-semibold">{m.name}</span>
                <span className="text-[11px] font-bold text-on-surface-variant">{m.detail}</span>
              </div>
              <div className={`mt-1 flex items-center gap-1 text-[11px] font-bold ${TONE[m.tone].text}`}>
                <Icon name={m.status.icon} className="text-[14px]" /> {m.status.text}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- Live transit network pulse */
function NetworkPulse() {
  return (
    <div className="flex flex-col gap-4 lg:col-span-7">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Live Transit Network Pulse</h2>
          <p className="text-[13px] text-on-surface-variant">Crowd telemetry, on-time frequency &amp; signal alerts</p>
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-container px-2 py-1">
          <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
          <span className="text-[11px] font-bold">{pulse.refreshed}</span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl bg-container-lowest shadow-sm">
        <div className="min-w-[520px]">
          <div className="grid grid-cols-12 bg-container-low px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
            <div className="col-span-4">Transit Corridor</div>
            <div className="col-span-3 text-center">Crowd Density</div>
            <div className="col-span-3 text-center">On-Time %</div>
            <div className="col-span-2 text-right">Headway</div>
          </div>
          {pulse.rows.map((r, i) => (
            <div key={r.code}>
              {i > 0 && <div className="h-px bg-container" />}
              <div className="grid grid-cols-12 items-center px-4 py-4 transition-colors hover:bg-container-low/50">
                <div className="col-span-4 flex items-center gap-2">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold ${r.codeClass}`}>{r.code}</span>
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-semibold">{r.name}</span>
                    <span className="truncate text-[13px] text-on-surface-variant">{r.route}</span>
                  </div>
                </div>
                <div className="col-span-3 flex flex-col items-center">
                  <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${TONE[r.crowd.tone].chip}`}>{r.crowd.text}</span>
                  <span className="mt-0.5 text-[13px] text-outline">{r.crowd.sub}</span>
                </div>
                <div className="col-span-3 flex flex-col items-center">
                  <span className={`text-sm font-bold ${r.onTime >= 99 ? "text-primary" : ""}`}>{r.onTime}%</span>
                  <div className="mt-1 h-1.5 w-16 overflow-hidden rounded-full bg-container">
                    <div className={`h-full ${TONE[r.onTimeTone].bar}`} style={{ width: `${Math.round(r.onTime)}%` }} />
                  </div>
                </div>
                <div className="col-span-2 text-right text-xs font-semibold">{r.headway}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-primary-fixed/40 p-4">
        <div className="flex items-center gap-2">
          <Icon name="notifications_active" className="text-[24px] text-primary" />
          <span className="text-[13px] text-on-primary-fixed">{pulse.banner}</span>
        </div>
        <button type="button" className="rounded bg-container-lowest px-2 py-1 text-[11px] font-bold text-primary shadow-sm hover:bg-container">
          Configure Alerts
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Live transit map */
function LiveMap() {
  return (
    <div className="flex flex-col gap-4 lg:col-span-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Live Transit Map</h2>
          <p className="text-[13px] text-on-surface-variant">Nearby vehicles &amp; interchange nodes</p>
        </div>
        <span className="rounded-full bg-container px-1.5 py-0.5 text-[11px] font-semibold">{liveMap.badge}</span>
      </div>

      <div className="relative h-[370px] w-full overflow-hidden rounded-xl bg-container-lowest shadow-sm">
        <div className="absolute inset-0">
          <MapView showNetwork />
        </div>
        <div className="pointer-events-none absolute inset-0 z-[400] bg-gradient-to-t from-container-lowest/90 via-transparent to-container-lowest/30" />

        <div className="pointer-events-none absolute left-14 top-3 z-[500] flex items-center gap-1 rounded-lg bg-container-lowest/95 px-2 py-1 shadow-sm backdrop-blur-md">
          <span className="h-2 w-2 animate-ping rounded-full bg-primary" />
          <span className="text-[11px] font-semibold">{liveMap.vehicles}</span>
        </div>

        <div className="pointer-events-none absolute left-16 top-28 z-[500] flex animate-bounce items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-on-primary shadow-md">
          <Icon name="train" className="text-[14px]" /> {liveMap.pins[0].text}
        </div>
        <div className="pointer-events-none absolute right-10 top-16 z-[500] flex items-center gap-1 rounded-full bg-secondary-container px-2 py-0.5 text-[11px] font-bold text-on-secondary-container shadow-md">
          <Icon name="directions_bus" className="text-[14px]" /> {liveMap.pins[1].text}
        </div>

        <div className="absolute inset-x-3 bottom-3 z-[500] flex items-center justify-between rounded-xl bg-container-lowest/95 p-2 shadow-md backdrop-blur-md">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-fixed text-on-primary-fixed">
              <Icon name="transfer_within_a_station" className="text-[20px]" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold">{liveMap.nearest.title}</span>
              <span className="text-[13px] text-on-surface-variant">{liveMap.nearest.sub}</span>
            </div>
          </div>
          <Link href={`/plan?from=${encodeURIComponent(liveMap.nearest.from)}`}
            className="rounded-lg bg-primary px-2 py-1.5 text-[11px] font-bold text-on-primary shadow-sm transition-colors hover:bg-primary-container">
            Navigate
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Recent journeys */
function RecentJourneys() {
  return (
    <div className="flex flex-col justify-between rounded-xl bg-container-lowest p-5 shadow-sm lg:col-span-12">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Recent Journey Activity</h2>
          <p className="text-[13px] text-on-surface-variant">Tap any trip to re-order ticket or view invoice</p>
        </div>
        <Link href="/track" className="text-xs font-semibold text-primary hover:underline">View All ({recentJourneys.total})</Link>
      </div>
      <div className="flex flex-col gap-2">
        {recentJourneys.items.map((j) => (
          <div key={j.title} className="flex cursor-pointer items-center justify-between gap-3 rounded-lg bg-container-low p-2 transition-colors hover:bg-container">
            <div className="flex min-w-0 items-center gap-4">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${j.iconClass}`}>
                <Icon name={j.icon} className="text-[20px]" />
              </div>
              <div className="flex min-w-0 flex-col">
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-sm font-semibold">{j.title}</span>
                  <span className={`rounded px-1 py-0.5 text-[11px] font-bold ${j.tagClass}`}>{j.tag}</span>
                </div>
                <span className="text-[13px] text-on-surface-variant">{j.when}</span>
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end">
              <span className="text-sm font-semibold">{j.amount}</span>
              <span className={`flex items-center gap-0.5 text-[11px] font-medium ${j.noteIcon ? "text-primary" : "text-outline"}`}>
                {j.noteIcon && <Icon name={j.noteIcon} className="text-[12px]" />} {j.note}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 pt-1">
        <span className="text-[13px] text-on-surface-variant">Need to book an EV Cab last mile?</span>
        <button type="button" className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
          Book Connected Cab <Icon name="arrow_forward" className="text-[16px]" />
        </button>
      </div>
    </div>
  );
}
