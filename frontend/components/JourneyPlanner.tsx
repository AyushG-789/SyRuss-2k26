"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useId, useMemo, useState } from "react";
import { lines, travellers } from "@/lib/api";
import { eventTitle, evidenceSummary, pct, STATUS_ORDER, STATUS_STYLE } from "@/lib/format";
import { findPlace, PLACE_OPTIONS } from "@/lib/places";
import {
  EMPTY_FORM, type FormState, formFromTraveller, PRIORITIES, travellerFromForm, validateForm, VEHICLE_MODES,
} from "@/lib/tripForm";
import { tripHref } from "@/lib/tripUrl";
import type { Mode, Traveller } from "@/lib/types";
import { useLiveEvents } from "@/lib/useLiveEvents";
import Icon from "./Icon";
import MapView from "./MapView";

const SHORTCUTS = [
  { label: "CSMT", place: "CSMT Heritage Building", icon: "account_balance" },
  { label: "Airport T2", place: "Mumbai Airport Terminal 2", icon: "flight" },
  { label: "BKC", place: "Jio World Centre, BKC", icon: "business" },
  { label: "Gateway", place: "Gateway of India", icon: "fort" },
  { label: "Wankhede", place: "Wankhede Stadium", icon: "sports_cricket" },
  { label: "Juhu Beach", place: "Juhu Beach", icon: "beach_access" },
];

const LEGEND = [
  { id: "METRO", label: "Metro 1 / 3", color: lines.METRO3?.color ?? "#00ACC1" },
  { id: "WR", label: "Western", color: lines.WR_SLOW?.color ?? "#D32F2F" },
  { id: "CR", label: "Central", color: lines.CR_SLOW?.color ?? "#F9A825" },
  { id: "HB", label: "Harbour", color: lines.HARBOUR?.color ?? "#6A1B9A" },
];

export default function JourneyPlanner() {
  const router = useRouter();
  const params = useSearchParams();
  const listId = useId();
  const [form, setForm] = useState<FormState>(() => ({
    ...EMPTY_FORM,
    from: params.get("from") ?? "",
    to: params.get("to") ?? "",
  }));
  const [errors, setErrors] = useState<string[]>([]);
  const live = useLiveEvents();
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const origin = findPlace(form.from) ?? null;
  const destination = findPlace(form.to) ?? null;
  const advisories = useMemo(
    () => (live?.events ?? [])
      .filter((e) => e.status === "confirmed" || e.status === "possible")
      .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.confidence - a.confidence),
    [live],
  );

  function toggleMode(mode: Mode) {
    set("modes", form.modes.includes(mode) ? form.modes.filter((m) => m !== mode) : [...form.modes, mode]);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validateForm(form);
    setErrors(errs);
    if (errs.length === 0) router.push(tripHref(travellerFromForm(form)));
  }

  const label = "text-[13px] font-semibold text-slate";
  const numInput = "w-full rounded-xl border border-hairline bg-container-lowest px-3 py-3 text-sm placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary";

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-6 md:px-6">
      <div className="card flex flex-wrap items-center gap-x-4 gap-y-2 bg-container-low/60 px-5 py-3">
        <span className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-primary">
          <Icon name="alt_route" /> Multimodal journey planner
        </span>
        <span className="text-[13px] text-on-surface-variant">Local trains · Metro 1 & 3 · BEST buses · auto, taxi & cab · walking</span>
        <label className="ml-auto flex items-center gap-2 text-[13px] text-on-surface-variant">
          <Icon name="history" className="text-[18px]" /> Fill from example
          <select defaultValue="" className="rounded-lg border border-hairline bg-container-lowest px-2 py-1 text-[13px] text-on-surface"
            onChange={(e) => {
              const t = travellers.find((x) => x.traveller_id === e.target.value) as Traveller | undefined;
              if (t) { setForm(formFromTraveller(t)); setErrors([]); }
            }}>
            <option value="" disabled>Choose…</option>
            {travellers.filter((t) => t.destination).map((t) => <option key={t.traveller_id} value={t.traveller_id}>{t.name}</option>)}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        {/* ---- Form ---- */}
        <form onSubmit={submit} noValidate className="card flex flex-col gap-5 p-5">
          <datalist id={listId}>{PLACE_OPTIONS.map((p) => <option key={p.label} value={p.label} />)}</datalist>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-primary">Trip details</p>
              <h1 className="text-2xl font-bold">Plan your commute</h1>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setForm((f) => ({ ...f, from: f.to, to: f.from }))} aria-label="Swap from and to"
                className="grid h-10 w-10 place-items-center rounded-xl bg-container-low hover:bg-container"><Icon name="swap_vert" /></button>
              <button type="button" onClick={() => { setForm(EMPTY_FORM); setErrors([]); }} aria-label="Clear form"
                className="grid h-10 w-10 place-items-center rounded-xl bg-container-low hover:bg-container"><Icon name="refresh" /></button>
            </div>
          </div>

          <PlaceField label="Starting point" icon="radio_button_checked" iconClass="text-primary" listId={listId}
            value={form.from} onChange={(v) => set("from", v)} placeholder="e.g. Thane station" />
          <PlaceField label="Destination" icon="location_on" iconClass="text-error" listId={listId}
            value={form.to} onChange={(v) => set("to", v)} placeholder="e.g. Wankhede Stadium" />

          <div>
            <p className={`${label} mb-2`}>Quick destinations</p>
            <div className="flex flex-wrap gap-2">
              {SHORTCUTS.map((s) => (
                <button key={s.label} type="button" onClick={() => set("to", s.place)}
                  className="flex items-center gap-1.5 rounded-lg border border-hairline bg-container-lowest px-2.5 py-1.5 text-[13px] hover:border-primary">
                  <Icon name={s.icon} className="text-[16px] text-on-surface-variant" /> {s.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className={`${label} mb-2`}>When</p>
            <div className="flex rounded-xl bg-container-low p-1" role="radiogroup" aria-label="Leave at or arrive by">
              {(["leave", "arrive"] as const).map((m) => (
                <button key={m} type="button" role="radio" aria-checked={form.timeMode === m} onClick={() => set("timeMode", m)}
                  className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${form.timeMode === m ? "bg-container-lowest text-primary shadow-card" : "text-on-surface-variant"}`}>
                  {m === "leave" ? "Leave at" : "Arrive by"}
                </button>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <label className="flex flex-1 items-center gap-2 rounded-xl bg-container-low px-3 py-2.5">
                <Icon name="schedule" className="text-outline" />
                <input type="time" value={form.time} onChange={(e) => set("time", e.target.value)} aria-label="Time"
                  className="bg-transparent text-sm tabular-nums focus:outline-none" />
                <span className="text-[12px] text-outline">demo day, IST</span>
              </label>
              {form.timeMode === "arrive" && (
                <label className="flex items-center gap-2 rounded-xl border border-hairline px-3 py-2.5 text-sm">
                  <input type="checkbox" checked={form.hardDeadline} onChange={(e) => set("hardDeadline", e.target.checked)} className="accent-[var(--primary)]" />
                  Must not be late
                </label>
              )}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className={label}>Ways to travel</p>
              <span className="text-[12px] text-outline">Walking always included</span>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-3">
              {VEHICLE_MODES.map((m) => {
                const on = form.modes.includes(m.mode);
                return (
                  <button key={m.mode} type="button" onClick={() => toggleMode(m.mode)} aria-pressed={on}
                    className={`flex flex-col items-center gap-1 rounded-xl px-2 py-2.5 text-[12px] font-semibold transition ${
                      on ? "bg-primary text-on-primary" : "bg-container-low text-on-surface-variant hover:bg-container"}`}>
                    <Icon name={m.icon} /> {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className={`${label} mb-2`}>Priority</p>
            <div className="grid grid-cols-2 gap-2">
              {PRIORITIES.map((p) => {
                const on = form.priority === p.value;
                return (
                  <button key={p.value} type="button" role="radio" aria-checked={on} onClick={() => set("priority", p.value)}
                    className={`flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2.5 text-left transition ${
                      on ? "border-primary bg-primary-soft" : "border-hairline hover:border-outline-variant"} ${p.value === "balanced" ? "col-span-2" : ""}`}>
                    <span className={`flex items-center gap-1.5 text-sm font-semibold ${on ? "text-primary" : ""}`}>
                      <Icon name={p.icon} className="text-[18px]" fill={on} /> {p.label}
                    </span>
                    <span className="text-[12px] text-on-surface-variant">{p.hint}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {([["budget", "Max ₹", "No limit"], ["maxWalk", "Max walk (min)", "No limit"], ["maxTransfers", "Max changes", "No limit"]] as const).map(([key, l, ph]) => (
              <label key={key} className="flex flex-col gap-1">
                <span className="text-[12px] font-semibold text-on-surface-variant">{l}</span>
                <input inputMode="numeric" value={form[key]} placeholder={ph} className={numInput}
                  onChange={(e) => set(key, e.target.value.replace(/\D/g, ""))} />
              </label>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            <Check checked={form.stepFree} onChange={(v) => set("stepFree", v)} icon="accessible">Step-free / accessible routes only</Check>
            <Check checked={form.heavyLuggage} onChange={(v) => set("heavyLuggage", v)} icon="luggage">Carrying heavy luggage</Check>
            <Check checked={form.avoidCrowds} onChange={(v) => set("avoidCrowds", v)} icon="groups">Avoid crowded options</Check>
            <label className="flex items-center justify-between rounded-xl bg-container-low px-3 py-2.5 text-sm">
              <span className="flex items-center gap-2"><Icon name="translate" className="text-on-surface-variant" /> Language</span>
              <select value={form.language} onChange={(e) => set("language", e.target.value as Traveller["language"])} className="bg-transparent font-semibold">
                <option value="en">English</option><option value="hi">हिंदी</option><option value="mr">मराठी</option>
              </select>
            </label>
          </div>

          {errors.length > 0 && (
            <ul role="alert" className="rounded-xl bg-error-container p-3 text-sm text-on-error-container">
              {errors.map((e) => <li key={e}>{e}</li>)}
            </ul>
          )}
          <button type="submit" className="btn-primary w-full text-base">
            <Icon name="travel_explore" /> Find routes <Icon name="arrow_forward" />
          </button>
        </form>

        {/* ---- Map + advisories ---- */}
        <div className="flex flex-col gap-6">
          <section className="card overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 border-b border-hairline p-4">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-primary"><Icon name="map" /></span>
              <div>
                <h2 className="font-semibold">Mumbai network</h2>
                <p className="text-[12px] text-on-surface-variant">
                  {origin && destination ? `${origin.label} → ${destination.label}` : "Pick a start and destination"}
                </p>
              </div>
              <div className="ml-auto flex flex-wrap gap-1.5">
                {LEGEND.map((l) => (
                  <span key={l.id} className="flex items-center gap-1.5 rounded-full bg-container-low px-2.5 py-1 text-[12px] font-semibold">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: l.color }} /> {l.label}
                  </span>
                ))}
              </div>
            </div>
            <div className="h-[460px]">
              <MapView showNetwork origin={origin} destination={destination} events={advisories} />
            </div>
          </section>

          <section className="card p-5" aria-labelledby="adv">
            <div className="mb-3 flex items-center justify-between">
              <h2 id="adv" className="flex items-center gap-2 font-semibold"><Icon name="campaign" className="text-tertiary" /> Live advisories</h2>
              <span className="rounded-full bg-tertiary-fixed px-2.5 py-0.5 text-[12px] font-bold text-tertiary">ACTIVE ({advisories.length})</span>
            </div>
            {advisories.length === 0 && <p className="text-sm text-on-surface-variant">No verified problems right now.</p>}
            <ul className="flex flex-col gap-2">
              {advisories.slice(0, 5).map((ev) => (
                <li key={ev.event_id} className="flex gap-3 rounded-xl bg-container-low p-3">
                  <Icon name={ev.status === "confirmed" ? "error" : "info"} className={ev.status === "confirmed" ? "text-error" : "text-amber-ink"} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{eventTitle(ev)}</p>
                    <p className="text-[13px] text-on-surface-variant">
                      {STATUS_STYLE[ev.status].label} · {pct(ev.confidence)} · {evidenceSummary(ev)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[12px] text-outline">
              Source: Pakka Check {live?.source === "backend" ? `(live, demo clock ${live.asOf})` : "(sample data — start the backend for live results)"}
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}

function PlaceField({ label, icon, iconClass, listId, value, onChange, placeholder }: {
  label: string; icon: string; iconClass: string; listId: string; value: string; onChange: (v: string) => void; placeholder: string;
}) {
  const known = value === "" || Boolean(findPlace(value));
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold text-slate">{label}</span>
      <span className={`flex min-h-[52px] items-center gap-3 rounded-xl border bg-container-low px-3 focus-within:ring-2 focus-within:ring-primary ${known ? "border-transparent" : "border-error"}`}>
        <Icon name={icon} className={iconClass} fill />
        <input list={listId} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-[15px] placeholder:text-outline focus:outline-none" />
        {value && (
          <button type="button" onClick={() => onChange("")} aria-label={`Clear ${label}`} className="text-outline hover:text-on-surface">
            <Icon name="close" className="text-[20px]" />
          </button>
        )}
      </span>
      {!known && <span className="text-[12px] text-error">Not in the covered area — pick from the list</span>}
    </label>
  );
}

function Check({ checked, onChange, icon, children }: { checked: boolean; onChange: (v: boolean) => void; icon: string; children: React.ReactNode }) {
  return (
    <label className={`flex cursor-pointer items-center justify-between rounded-xl px-3 py-2.5 text-sm transition ${checked ? "bg-primary-soft" : "bg-container-low"}`}>
      <span className="flex items-center gap-2"><Icon name={icon} className={checked ? "text-primary" : "text-on-surface-variant"} /> {children}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
    </label>
  );
}
