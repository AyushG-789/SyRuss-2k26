"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { travellers } from "@/lib/api";
import { lineStatuses, modeStatuses, TONE_CLASS } from "@/lib/network";
import { PLACE_OPTIONS } from "@/lib/places";
import { EMPTY_FORM, travellerFromForm, validateForm, type TimeMode } from "@/lib/tripForm";
import { tripHref } from "@/lib/tripUrl";
import { useLiveEvents } from "@/lib/useLiveEvents";
import Icon from "./Icon";
import MapView from "./MapView";

const TRIP_ICON: Record<string, string> = { TR1: "accessible", TR2: "school", TR3: "sports_cricket", TR4: "family_restroom", TR5: "work" };

export default function HomeHub() {
  const live = useLiveEvents();
  const events = live?.events ?? [];
  const confirmed = events.filter((e) => e.status === "confirmed").length;
  const ignored = events.filter((e) => e.status === "ignored" || e.status === "coordinated").length;

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-6 md:px-6">
      {/* ---- Welcome + quick route finder ---- */}
      <section className="card relative overflow-hidden p-5 md:p-6">
        <div className="pointer-events-none absolute -right-20 -top-24 h-96 w-96 rounded-full bg-primary-fixed/30 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 right-48 h-64 w-64 rounded-full bg-secondary-container/40 blur-2xl" />
        <div className="relative flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="max-w-2xl">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-primary-fixed px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-on-primary-fixed">
                Crowd-verified routes
              </span>
              <span className="flex items-center gap-1.5 text-[13px] text-on-surface-variant">
                <span className={`h-2 w-2 rounded-full ${live?.source === "backend" ? "animate-pulse bg-primary" : "bg-outline"}`} />
                {live?.source === "backend" ? `Pakka Check live · demo clock ${live.asOf}` : "Sample disruption data"}
              </span>
            </div>
            <h1 className="text-[26px] font-bold leading-8 tracking-tight md:text-[32px] md:leading-10">Travel Mumbai smarter, live.</h1>
            <p className="mt-1 text-base font-medium text-on-surface-variant">
              Door-to-door trips across locals, metro, BEST buses and taxis — using commuter reports we fact-check
              against news and official notices, not just the timetable.
            </p>
          </div>
          <div className="flex items-center gap-4 rounded-xl bg-container-low px-5 py-3">
            <Stat label="Verified now" value={String(confirmed)} accent />
            <div className="h-8 w-px bg-container-highest" />
            <Stat label="Reports caught / ignored" value={String(ignored)} />
          </div>
        </div>
        <QuickSearch />
      </section>

      {/* ---- Example trips ---- */}
      <section className="flex flex-col gap-3" aria-labelledby="examples">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 id="examples" className="flex items-center gap-2 text-xl font-semibold">
            <Icon name="bookmark" className="text-primary" /> Example trips
          </h2>
          <p className="text-[13px] text-on-surface-variant">Five demo travellers with different needs — tap to see their routes</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {travellers.map((t) => (
            <Link key={t.traveller_id} href={`/routes/${t.traveller_id}`}
              className="card group flex flex-col gap-3 p-4 transition hover:border-primary/40">
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                  <Icon name={TRIP_ICON[t.traveller_id] ?? "person"} />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-semibold">{t.destination?.label ?? "Day itinerary"}</p>
                  <p className="truncate text-[13px] text-on-surface-variant">from {t.origin.label}</p>
                </div>
              </div>
              <p className="line-clamp-2 text-[13px] text-on-surface-variant">{t.name}</p>
              <div className="mt-auto flex items-center justify-between text-[13px]">
                <span className="flex items-center gap-1 font-semibold text-slate">
                  <Icon name="schedule" className="text-[16px]" />
                  {t.arrive_by && t.hard_deadline ? `by ${t.arrive_by}` : `leave ${t.leave_at}`}
                </span>
                <Icon name="arrow_forward" className="text-outline transition group-hover:translate-x-0.5 group-hover:text-primary" />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ---- Transport modes ---- */}
      <section className="flex flex-col gap-3" aria-labelledby="modes">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="modes" className="text-xl font-semibold">Transport modes</h2>
            <p className="text-[13px] text-on-surface-variant">Live status from verified reports</p>
          </div>
          <Link href="/admin" className="flex items-center gap-1 text-[13px] font-semibold text-primary">
            Demo control <Icon name="open_in_new" className="text-[16px]" />
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {modeStatuses(events).map((m) => (
            <div key={m.id} className="card flex flex-col gap-3 p-4">
              <div className="flex items-start justify-between">
                <span className={`grid h-11 w-11 place-items-center rounded-xl ${m.tone === "ok" ? "bg-container-low text-slate" : TONE_CLASS[m.tone]}`}>
                  <Icon name={m.icon} />
                </span>
                <span className={`h-2.5 w-2.5 rounded-full ${m.tone === "ok" ? "bg-primary" : m.tone === "warn" ? "bg-amber-ink" : "bg-error"}`} />
              </div>
              <div>
                <p className="font-semibold">{m.name}</p>
                <p className="text-[12px] text-on-surface-variant">{m.detail}</p>
              </div>
              <p className={`flex items-center gap-1 text-[12px] font-semibold ${m.tone === "ok" ? "text-primary-ink" : m.tone === "warn" ? "text-amber-ink" : "text-error"}`}>
                <Icon name={m.tone === "ok" ? "check_circle" : "warning"} className="text-[16px]" />
                {m.label}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ---- Network pulse + live map ---- */}
      <section className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-xl font-semibold">Live network pulse</h2>
              <p className="text-[13px] text-on-surface-variant">Each line&apos;s worst verified problem right now</p>
            </div>
            <span className="flex items-center gap-1.5 rounded-full bg-container-low px-2.5 py-1 text-[12px] font-semibold text-on-surface-variant">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" /> refreshes every 5 s
            </span>
          </div>
          <div className="card overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-container-low text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
                <tr>
                  <th className="px-4 py-3">Line</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="hidden px-4 py-3 text-right sm:table-cell">Reports</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline-soft">
                {lineStatuses(events).map((l) => (
                  <tr key={l.line_id}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="min-w-14 rounded-md px-2 py-1 text-center text-[11px] font-bold text-white" style={{ backgroundColor: l.color }}>
                          {l.code}
                        </span>
                        <span className="hidden truncate text-on-surface-variant md:inline">{l.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-md px-2 py-1 text-[12px] font-semibold ${TONE_CLASS[l.tone]}`}>{l.label}</span>
                    </td>
                    <td className="hidden px-4 py-3 text-right tabular-nums text-on-surface-variant sm:table-cell">{l.reports}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="flex items-center gap-2 rounded-xl bg-primary-soft px-4 py-3 text-[13px] text-primary-ink">
            <Icon name="verified_user" className="text-[20px]" />
            Only problems backed by several commuters, news or an official notice turn red. Copy-paste bursts from new accounts are ignored.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <div>
            <h2 className="text-xl font-semibold">Live disruption map</h2>
            <p className="text-[13px] text-on-surface-variant">Tap a dot to see who reported it</p>
          </div>
          <div className="card relative h-[420px] overflow-hidden">
            <MapView events={events} showNetwork />
            <div className="pointer-events-none absolute inset-x-3 bottom-3 z-[500] flex flex-wrap gap-2">
              {[
                { c: "var(--error)", t: "Confirmed" },
                { c: "var(--amber-ink)", t: "Possible" },
                { c: "var(--outline)", t: "Ignored / suspicious" },
              ].map((x) => (
                <span key={x.t} className="flex items-center gap-1.5 rounded-full bg-container-lowest/95 px-2.5 py-1 text-[12px] font-semibold shadow-card">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: x.c }} /> {x.t}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">{label}</span>
      <span className={`text-xl font-bold tabular-nums ${accent ? "text-primary" : "text-on-surface"}`}>{value}</span>
    </div>
  );
}

function QuickSearch() {
  const router = useRouter();
  const listId = useId();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [timeMode, setTimeMode] = useState<TimeMode>("leave");
  const [time, setTime] = useState("17:00");
  const [errors, setErrors] = useState<string[]>([]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const form = { ...EMPTY_FORM, from, to, timeMode, time };
    const errs = validateForm(form);
    setErrors(errs);
    if (errs.length === 0) router.push(tripHref(travellerFromForm(form)));
  }

  const field = "flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-container-lowest px-3 py-2 shadow-card focus-within:ring-2 focus-within:ring-primary";
  return (
    <form onSubmit={submit} noValidate className="relative mt-5 rounded-xl bg-container-low p-3 shadow-card">
      <datalist id={listId}>
        {PLACE_OPTIONS.map((p) => <option key={p.label} value={p.label} />)}
      </datalist>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center 2xl:grid-cols-[1fr_auto_1fr_auto]">
        <label className={field}>
          <Icon name="trip_origin" className="text-primary" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[11px] font-bold text-on-surface-variant">From</span>
            <input list={listId} value={from} onChange={(e) => setFrom(e.target.value)} placeholder="Station or place"
              className="w-full bg-transparent text-sm focus:outline-none" autoComplete="off" />
          </span>
        </label>
        <button type="button" onClick={() => { setFrom(to); setTo(from); }} aria-label="Swap from and to"
          className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-container-high text-on-surface-variant transition hover:rotate-180 hover:bg-container-highest">
          <Icon name="swap_horiz" />
        </button>
        <label className={field}>
          <Icon name="pin_drop" className="text-tertiary" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[11px] font-bold text-on-surface-variant">To</span>
            <input list={listId} value={to} onChange={(e) => setTo(e.target.value)} placeholder="Station or place"
              className="w-full bg-transparent text-sm focus:outline-none" autoComplete="off" />
          </span>
        </label>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-3 2xl:col-span-1">
        <div className="flex flex-1 items-center gap-1 rounded-lg bg-container-lowest px-2 py-1.5 shadow-card">
          <Icon name="schedule" className="text-[20px] text-outline" />
          <select value={timeMode} onChange={(e) => setTimeMode(e.target.value as TimeMode)} aria-label="Leave at or arrive by"
            className="bg-transparent text-sm font-semibold focus:outline-none">
            <option value="leave">Leave</option>
            <option value="arrive">Arrive</option>
          </select>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Time"
            className="bg-transparent text-sm tabular-nums focus:outline-none" />
        </div>
        <button type="submit" className="btn-primary flex-1 sm:flex-none">
          Find routes <Icon name="arrow_forward" className="text-[20px]" />
        </button>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[13px]">
        {errors.length > 0 ? (
          <span role="alert" className="text-error">{errors[0]}</span>
        ) : (
          <span className="text-on-surface-variant">Covers {PLACE_OPTIONS.length} Mumbai places and stations in this prototype.</span>
        )}
        <Link href={`/plan?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`} className="flex items-center gap-1 font-semibold text-primary">
          <Icon name="tune" className="text-[18px]" /> More options (budget, step-free, modes)
        </Link>
      </div>
    </form>
  );
}
