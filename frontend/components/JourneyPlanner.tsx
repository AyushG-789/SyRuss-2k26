"use client";

// Journey Planner — built from the team's design (stitch: mobilink_web_journey_planner).
// The form is live: it builds a real trip and opens Route Results. Side panels (recommended
// options, advisories, spotlights, congestion) are sample data from lib/mockPlanner.ts.

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useId, useState } from "react";
import {
  activePath, advisories, congestion, defaults, engine, legend, mapLayers, quickChips, recommended, savedPlaces, spotlights,
} from "@/lib/mockPlanner";
import { findPlace, PLACE_OPTIONS } from "@/lib/places";
import { EMPTY_FORM, type FormState, travellerFromForm, validateForm } from "@/lib/tripForm";
import { tripHref } from "@/lib/tripUrl";
import type { Mode } from "@/lib/types";
import Icon from "./Icon";
import MapView from "./MapView";

type Departure = "now" | "at" | "by";

const MODALITIES: { id: string; label: string; icon: string; modes: Mode[] }[] = [
  { id: "overall", label: "Overall", icon: "all_inclusive", modes: ["local", "metro", "bus", "auto", "taxi", "cab"] },
  { id: "metro", label: "Metro", icon: "subway", modes: ["metro"] },
  { id: "local", label: "Local", icon: "train", modes: ["local"] },
  { id: "bus", label: "Bus", icon: "directions_bus", modes: ["bus"] },
  { id: "vehicles", label: "Vehicles", icon: "directions_car", modes: ["auto", "taxi", "cab"] },
  { id: "walk", label: "Walking", icon: "directions_walk", modes: [] },
];

const STRATEGIES = [
  { value: "fastest", label: "Fastest Duration", hint: "Optimized rapid line switches" },
  { value: "fewest_transfers", label: "Fewest Transfers", hint: "Direct single-boarding focus" },
  { value: "cheapest", label: "Cheapest", hint: "Budget rail & regular buses" },
] as const;

export default function JourneyPlanner() {
  const router = useRouter();
  const params = useSearchParams();
  const listId = useId();
  const [form, setForm] = useState<FormState>(() => ({
    ...EMPTY_FORM,
    from: params.get("from") ?? defaults.from,
    to: params.get("to") ?? defaults.to,
    priority: "fastest",
    modes: ["local", "metro", "bus", "auto", "taxi", "cab"],
  }));
  const [via, setVia] = useState<string | null>(null);
  const [departure, setDeparture] = useState<Departure>("now");
  const [editTime, setEditTime] = useState(false);
  const [layers, setLayers] = useState<string[]>(["metro"]);
  const [errors, setErrors] = useState<string[]>([]);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const origin = findPlace(form.from) ?? null;
  const destination = findPlace(form.to) ?? null;

  function modalityOn(m: (typeof MODALITIES)[number]): boolean {
    if (m.id === "walk") return true;
    if (m.id === "overall") return MODALITIES[0].modes.every((x) => form.modes.includes(x));
    return m.modes.every((x) => form.modes.includes(x));
  }
  function toggleModality(m: (typeof MODALITIES)[number]) {
    if (m.id === "walk") return; // walking is always part of a trip
    if (m.id === "overall") { set("modes", modalityOn(m) ? ["local", "metro"] : [...MODALITIES[0].modes]); return; }
    set("modes", modalityOn(m) ? form.modes.filter((x) => !m.modes.includes(x)) : [...new Set([...form.modes, ...m.modes])]);
  }

  function chooseDeparture(d: Departure) {
    setDeparture(d);
    set("timeMode", d === "by" ? "arrive" : "leave");
    setEditTime(d !== "now");
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validateForm(form);
    setErrors(errs);
    if (errs.length === 0) router.push(tripHref(travellerFromForm(form)));
  }

  return (
    <main className="flex w-full flex-col gap-4 px-4 pb-16 pt-4 md:px-6">
      {/* ---- Engine strip ---- */}
      <section className="flex flex-col gap-2 rounded-2xl bg-container-low/70 px-5 py-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="flex items-center gap-1 text-base font-medium uppercase tracking-wide text-primary">
            <Icon name="alt_route" /> {engine.title}
          </span>
          <span className="hidden text-outline md:inline">•</span>
          <span className="text-sm text-on-surface-variant">{engine.feeds}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg bg-secondary-container px-2 py-0.5 text-sm text-on-secondary-container">{engine.reliability}</span>
          <button type="button" onClick={() => { setForm((f) => ({ ...f, from: defaults.from, to: defaults.to })); setErrors([]); }}
            className="flex items-center gap-1 rounded-lg bg-container-lowest px-2 py-0.5 text-sm hover:bg-container">
            <Icon name="history" className="text-[18px]" /> Restore Last Search
          </button>
        </div>
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,27rem)_minmax(0,1fr)]">
        {/* ================================================================ left column */}
        <div className="flex flex-col gap-5">
          <form onSubmit={submit} noValidate className="flex flex-col gap-5 rounded-2xl bg-container-lowest p-5 shadow-sm">
            <datalist id={listId}>{PLACE_OPTIONS.map((p) => <option key={p.label} value={p.label} />)}</datalist>

            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-primary">Transit Matrix</p>
                <h1 className="text-2xl font-semibold">Plan Your Commute</h1>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setForm((f) => ({ ...f, from: f.to, to: f.from }))} aria-label="Swap departure and destination"
                  className="grid h-11 w-11 place-items-center rounded-xl bg-container-low hover:bg-container"><Icon name="swap_vert" /></button>
                <button type="button" onClick={() => { setForm({ ...EMPTY_FORM, priority: "fastest" }); setVia(null); setErrors([]); }} aria-label="Reset"
                  className="grid h-11 w-11 place-items-center rounded-xl bg-container-low hover:bg-container"><Icon name="refresh" /></button>
              </div>
            </div>

            {/* Departure / via / destination */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-[13px]">
                <span className="font-semibold text-slate">Point of Departure</span>
                <button type="button" onClick={() => set("from", "Andheri station")} className="flex items-center gap-1 font-semibold text-primary">
                  <Icon name="my_location" className="text-[16px]" /> Current GPS
                </button>
              </div>
              <PlaceInput listId={listId} value={form.from} onChange={(v) => set("from", v)} dot="bg-primary"
                placeholder="Enter starting station, address, or landmark" label="Point of departure" />

              <div className="flex items-center justify-between py-1 text-[13px]">
                {via === null ? (
                  <button type="button" onClick={() => setVia("")} className="flex items-center gap-1.5 text-base text-primary">
                    <Icon name="add_circle" className="text-[20px]" /> Add Layover / Via Stop
                  </button>
                ) : (
                  <div className="flex w-full items-center gap-2">
                    <input list={listId} value={via} onChange={(e) => setVia(e.target.value)} aria-label="Via stop"
                      placeholder="Via intermediate stop (e.g., Dadar Junction)"
                      className="min-w-0 flex-1 rounded-lg border border-dashed border-outline-variant bg-container-lowest px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                    <button type="button" onClick={() => setVia(null)} aria-label="Remove via stop" className="text-outline hover:text-on-surface"><Icon name="close" /></button>
                  </div>
                )}
                {via === null && <span className="text-on-surface-variant">Direct Corridor Routing</span>}
              </div>

              <div className="flex items-center justify-between text-[13px]">
                <span className="font-semibold text-slate">Final Destination</span>
                <span className="text-on-surface-variant">Zone 1 Suburban / Metro</span>
              </div>
              <PlaceInput listId={listId} value={form.to} onChange={(v) => set("to", v)} pin
                placeholder="Enter terminus station or destination address" label="Final destination" />
            </div>

            {/* Shortcuts */}
            <div className="flex flex-col gap-2">
              <span className="text-[13px] text-on-surface-variant">Quick-Access Shortcuts</span>
              <div className="grid grid-cols-2 gap-2">
                {savedPlaces.map((p) => (
                  <button key={p.id} type="button" onClick={() => set("to", p.place)}
                    className="flex items-center gap-3 rounded-xl border border-hairline bg-container-low/50 px-4 py-3 text-left transition hover:border-primary">
                    <span className="grid h-10 w-10 place-items-center rounded-lg bg-container"><Icon name={p.icon} className="text-on-surface-variant" /></span>
                    <span className="flex flex-col">
                      <span className="font-semibold">{p.title}</span>
                      <span className="text-[13px] text-on-surface-variant">{p.sub}</span>
                    </span>
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {quickChips.map((c) => (
                  <button key={c.label} type="button" onClick={() => set("to", c.place)}
                    className="flex items-center gap-1.5 rounded-lg bg-container-low px-3 py-1.5 text-[15px] hover:bg-container">
                    <Icon name={c.icon} className="text-[18px]" /> {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Departure scheduling */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-[13px]">
                <span className="font-semibold text-slate">Departure Scheduling</span>
                <span className="font-semibold text-primary">Peak Commute Hours</span>
              </div>
              <div className="grid grid-cols-3 rounded-xl bg-container-low p-1" role="radiogroup" aria-label="Departure">
                {([["now", "Depart Now"], ["at", "Depart At..."], ["by", "Arrive By..."]] as const).map(([d, l]) => (
                  <button key={d} type="button" role="radio" aria-checked={departure === d} onClick={() => chooseDeparture(d)}
                    className={`flex items-center justify-center gap-1 rounded-lg py-2 text-[15px] ${departure === d ? "bg-container-lowest text-primary shadow-sm" : "text-on-surface-variant"}`}>
                    {departure === d && <span className="h-1.5 w-1.5 rounded-full bg-primary" />} {l}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-container-low px-3 py-2.5">
                  <Icon name="schedule" className="text-outline" />
                  {editTime ? (
                    <input type="time" value={form.time} onChange={(e) => set("time", e.target.value)} aria-label="Time"
                      className="bg-transparent text-[15px] tabular-nums focus:outline-none" />
                  ) : (
                    <span className="truncate text-[15px]">{departure === "now" ? defaults.departureNote : `Today, ${form.time}`}</span>
                  )}
                </label>
                <button type="button" onClick={() => setEditTime((v) => !v)} className="rounded-xl bg-container-low px-4 text-[15px] hover:bg-container">
                  {editTime ? "Done" : "Change"}
                </button>
              </div>
            </div>

            {/* Modalities */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-[13px]">
                <span className="font-semibold text-slate">Supported Modalities</span>
                <span className="text-on-surface-variant">Tap to include/exclude</span>
              </div>
              <div className="grid grid-cols-6 gap-1.5">
                {MODALITIES.map((m) => {
                  const on = modalityOn(m);
                  const primary = m.id === "overall" && on;
                  return (
                    <button key={m.id} type="button" onClick={() => toggleModality(m)} aria-pressed={on} title={m.id === "walk" ? "Walking is always included" : undefined}
                      className={`flex flex-col items-center gap-1 rounded-xl px-1 py-2.5 text-[11px] font-semibold transition ${
                        primary ? "bg-primary text-on-primary" : on ? "bg-primary-soft text-primary-ink" : "bg-container-low text-on-surface-variant hover:bg-container"}`}>
                      <Icon name={m.icon} className="text-[22px]" /> {m.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Priority */}
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-semibold text-slate">Priority Strategy</span>
              <div className="grid grid-cols-3 gap-2">
                {STRATEGIES.map((s) => {
                  const on = form.priority === s.value;
                  return (
                    <button key={s.value} type="button" role="radio" aria-checked={on} onClick={() => set("priority", s.value)}
                      className={`flex flex-col items-start gap-1 rounded-xl p-3 text-left transition ${on ? "bg-primary-soft ring-1 ring-primary" : "bg-container-low hover:bg-container"}`}>
                      <span className="flex items-start gap-1.5">
                        <Icon name={on ? "radio_button_checked" : "radio_button_unchecked"} className={`text-[20px] ${on ? "text-primary" : "text-outline"}`} />
                        <span className="text-[15px] font-semibold leading-tight">{s.label}</span>
                      </span>
                      <span className="pl-6 text-[12px] leading-snug text-on-surface-variant">{s.hint}</span>
                    </button>
                  );
                })}
              </div>
              <label className="flex cursor-pointer items-center justify-between rounded-xl bg-container-low px-3 py-3 text-[15px]">
                <span className="flex items-center gap-2"><Icon name="accessible" className="text-primary" /> Step-free / Accessible routes only</span>
                <input type="checkbox" checked={form.stepFree} onChange={(e) => set("stepFree", e.target.checked)} className="h-5 w-5 accent-[var(--primary)]" />
              </label>
            </div>

            {errors.length > 0 && (
              <ul role="alert" className="rounded-xl bg-error-container p-3 text-sm text-on-error-container">
                {errors.map((e) => <li key={e}>{e}</li>)}
              </ul>
            )}
            <button type="submit" className="flex h-14 items-center justify-center gap-2 rounded-xl bg-primary text-base font-semibold text-on-primary shadow-sm transition hover:bg-primary-container active:scale-[0.98]">
              <Icon name="travel_explore" /> Find Optimal Transit Routes <Icon name="arrow_forward" />
            </button>
          </form>

          {/* Advisories */}
          <section className="flex flex-col gap-3 rounded-2xl bg-container-lowest p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-base font-semibold"><Icon name="campaign" className="text-tertiary" /> Live Transit Advisories</h2>
              <span className="rounded-full bg-tertiary-fixed px-2.5 py-0.5 text-[13px] font-semibold text-tertiary">ACTIVE ({advisories.count})</span>
            </div>
            {advisories.items.map((a) => (
              <div key={a.title} className="flex gap-3 rounded-xl bg-container-low p-3">
                <Icon name={a.icon} className={a.iconClass} />
                <div>
                  <p className="text-[15px] font-medium">{a.title}</p>
                  <p className="text-[14px] text-on-surface-variant">{a.text}</p>
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between text-[14px]">
              <span className="text-on-surface-variant">{advisories.source}</span>
              <Link href="/admin" className="font-semibold text-primary">View All Alerts</Link>
            </div>
          </section>

          {/* Congestion */}
          <section className="flex items-center gap-4 rounded-2xl bg-container-lowest p-5 shadow-sm">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-secondary-container text-on-secondary-container"><Icon name="groups" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px]">{congestion.title}</p>
              <p className="text-[14px] text-on-surface-variant">{congestion.text}</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold text-tertiary">{congestion.value}</p>
              <p className="text-[13px] text-on-surface-variant">{congestion.sub}</p>
            </div>
          </section>
        </div>

        {/* ================================================================ right column */}
        <div className="flex flex-col gap-5">
          <section className="overflow-hidden rounded-2xl bg-container-lowest shadow-sm">
            <div className="flex flex-col gap-3 p-5">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary-fixed text-on-primary-fixed"><Icon name="map" /></span>
                <div>
                  <h2 className="text-[17px] font-semibold">Regional Multimodal Canvas</h2>
                  <p className="text-[13px] text-on-surface-variant">Scale: 1:25,000 MMR Corridors</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {mapLayers.map((l) => {
                  const on = layers.includes(l.id);
                  return (
                    <button key={l.id} type="button" aria-pressed={on}
                      onClick={() => setLayers((ls) => (on ? ls.filter((x) => x !== l.id) : [...ls, l.id]))}
                      className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[15px] transition ${on ? "bg-primary text-on-primary" : "bg-container-low text-on-surface-variant hover:bg-container"}`}>
                      <span className={`h-2 w-2 rounded-full ${on ? "bg-white" : l.dot}`} /> {l.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="relative h-[560px] bg-container-low">
              <MapView showNetwork origin={origin} destination={destination} />
              <div className="absolute left-1/2 top-4 z-[500] flex -translate-x-1/2 items-center gap-3 rounded-2xl bg-container-lowest px-4 py-2 shadow-float">
                <span className="text-[15px] font-medium leading-tight">{activePath.label}</span>
                <span className="rounded-xl bg-primary-fixed px-2 py-1 text-[15px] font-semibold leading-tight text-on-primary-fixed">
                  {activePath.time}<br />• {activePath.fare}
                </span>
              </div>
              <div className="absolute bottom-4 left-4 z-[500] rounded-xl bg-container-lowest p-4 shadow-float">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Cartographic Legend</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                  {legend.map((l) => (
                    <span key={l.label} className="flex items-center gap-2 text-[14px]">
                      <span className="h-1 w-4 rounded-full" style={{ backgroundColor: l.color }} /> {l.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 bg-container-low/50 p-5">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold uppercase tracking-wider text-on-surface-variant">Top Recommended Route Options</span>
                <Link href="/routes/TR3" className="text-[15px] text-primary">Compare 4 Alternate Paths</Link>
              </div>
              {recommended.map((r) => (
                <div key={r.id} className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4 rounded-2xl bg-container-lowest p-5 shadow-sm sm:grid-cols-[auto_minmax(0,1fr)_auto]">
                  <span className={`flex h-14 w-14 flex-col items-center justify-center rounded-xl ${r.minutesClass}`}>
                    <span className="text-xl font-bold leading-none">{r.minutes}</span>
                    <span className="text-[11px] font-semibold">MIN</span>
                  </span>
                  <div className="min-w-0">
                    <span className={`rounded-md px-2 py-0.5 text-[15px] font-semibold ${r.badgeClass}`}>{r.badge}</span>
                    <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2 text-[17px] font-semibold">
                      {r.title} <span className="font-medium text-primary">· {r.fare}</span>
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[15px] text-on-surface-variant">
                      {r.steps.map((s, i) => (
                        <span key={s} className="flex items-center gap-2">
                          {i > 0 && <Icon name="arrow_forward" className="text-[16px]" />} {s}
                        </span>
                      ))}
                    </p>
                  </div>
                  <div className="col-span-2 flex items-center justify-between gap-3 sm:col-span-1 sm:flex-col sm:items-end">
                    <span className={`flex items-center gap-1 text-[13px] font-semibold ${r.tag.cls}`}>
                      <Icon name={r.tag.icon} className="text-[16px]" /> {r.tag.text}
                    </span>
                    <Link href="/routes/TR3"
                      className={`flex items-center gap-1 whitespace-nowrap rounded-xl px-4 py-2.5 text-[15px] font-semibold ${r.primary ? "bg-primary text-on-primary hover:bg-primary-container" : "bg-container-low hover:bg-container"}`}>
                      {r.cta} <Icon name="chevron_right" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Spotlights */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {spotlights.map((s) => (
              <div key={s.title} className="flex items-center gap-4 rounded-2xl bg-container-lowest p-4 shadow-sm">
                <div className={`grid h-20 w-20 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white ${s.artClass}`}>
                  <Icon name={s.art} className="text-[36px]" />
                </div>
                <div className="min-w-0">
                  <p className="text-[12px] font-bold uppercase tracking-wide text-on-surface-variant">{s.kicker}</p>
                  <p className="truncate text-[16px] font-bold">{s.title}</p>
                  <p className="line-clamp-2 text-[14px] text-on-surface-variant">{s.text}</p>
                  <p className="mt-1 flex items-center gap-1 text-[14px] text-primary"><Icon name={s.foot.icon} className="text-[16px]" /> {s.foot.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

function PlaceInput({ listId, value, onChange, placeholder, label, dot, pin = false }: {
  listId: string; value: string; onChange: (v: string) => void; placeholder: string; label: string; dot?: string; pin?: boolean;
}) {
  const known = value === "" || Boolean(findPlace(value));
  return (
    <div className="flex flex-col gap-1">
      <div className={`flex min-h-[56px] items-center gap-3 rounded-xl border bg-container-low px-4 focus-within:ring-2 focus-within:ring-primary ${known ? "border-transparent" : "border-error"}`}>
        {pin ? (
          <span className="grid h-7 w-7 place-items-center rounded-full bg-error-container"><Icon name="location_on" className="text-[18px] text-error" /></span>
        ) : (
          <span className="grid h-7 w-7 place-items-center rounded-full bg-primary-soft"><span className={`h-3 w-3 rounded-full ${dot}`} /></span>
        )}
        <input list={listId} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label} autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-[17px] placeholder:text-outline focus:outline-none" />
        {value && (
          <button type="button" onClick={() => onChange("")} aria-label={`Clear ${label}`} className="text-outline hover:text-on-surface">
            <Icon name="close" />
          </button>
        )}
      </div>
      {!known && <span className="text-[12px] text-error">Not in the covered area — pick a suggestion from the list</span>}
    </div>
  );
}
