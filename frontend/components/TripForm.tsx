"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { travellers } from "@/lib/api";
import { findPlace, PLACE_OPTIONS } from "@/lib/places";
import { tripHref } from "@/lib/tripUrl";
import type { Mode, Traveller } from "@/lib/types";

type TimeMode = "leave" | "arrive";

interface FormState {
  from: string;
  to: string;
  timeMode: TimeMode;
  time: string;
  hardDeadline: boolean;
  budget: string;
  maxWalk: string;
  maxTransfers: string;
  priority: Traveller["priority"];
  modes: Mode[];
  stepFree: boolean;
  heavyLuggage: boolean;
  avoidCrowds: boolean;
  language: Traveller["language"];
}

const VEHICLE_MODES: { mode: Mode; label: string }[] = [
  { mode: "local", label: "Local train" },
  { mode: "metro", label: "Metro" },
  { mode: "bus", label: "BEST bus" },
  { mode: "auto", label: "Auto" },
  { mode: "taxi", label: "Taxi" },
  { mode: "cab", label: "App cab" },
];

const PRIORITIES: { value: Traveller["priority"]; label: string }[] = [
  { value: "balanced", label: "Balanced" },
  { value: "fastest", label: "Fastest" },
  { value: "cheapest", label: "Cheapest" },
  { value: "fewest_transfers", label: "Fewest changes" },
  { value: "most_reliable", label: "Most reliable" },
];

const EMPTY: FormState = {
  from: "",
  to: "",
  timeMode: "leave",
  time: "17:00",
  hardDeadline: false,
  budget: "",
  maxWalk: "15",
  maxTransfers: "2",
  priority: "balanced",
  modes: ["local", "metro", "bus", "taxi"],
  stepFree: false,
  heavyLuggage: false,
  avoidCrowds: false,
  language: "en",
};

/** Label the place pickers understand for a traveller's origin/destination. */
function pickerLabel(p: { label: string; lat: number; lon: number } | null): string {
  if (!p) return "";
  const exact = findPlace(p.label);
  if (exact) return exact.label;
  // Demo travellers use free labels ("Thane station"); snap to the nearest known place.
  const nearest = PLACE_OPTIONS.reduce((best, o) =>
    Math.hypot(o.lat - p.lat, o.lon - p.lon) < Math.hypot(best.lat - p.lat, best.lon - p.lon) ? o : best,
  );
  return nearest.label;
}

function fromTraveller(t: Traveller): FormState {
  return {
    from: pickerLabel(t.origin),
    to: pickerLabel(t.destination),
    timeMode: t.arrive_by && t.hard_deadline ? "arrive" : "leave",
    time: (t.arrive_by && t.hard_deadline ? t.arrive_by : t.leave_at) ?? "17:00",
    hardDeadline: t.hard_deadline,
    budget: t.max_budget_inr ? String(t.max_budget_inr) : "",
    maxWalk: t.max_walk_min ? String(t.max_walk_min) : "",
    maxTransfers: t.max_transfers != null ? String(t.max_transfers) : "",
    priority: t.priority,
    modes: t.modes_allowed.filter((m) => m !== "walk"),
    stepFree: t.step_free,
    heavyLuggage: t.heavy_luggage,
    avoidCrowds: t.avoid_crowds,
    language: t.language,
  };
}

function validate(f: FormState): string[] {
  const errors: string[] = [];
  const from = findPlace(f.from);
  const to = findPlace(f.to);
  if (!from) errors.push("Pick a starting point from the list.");
  if (!to) errors.push("Pick a destination from the list.");
  if (from && to && from.label === to.label) errors.push("Start and destination must be different.");
  if (!/^\d{2}:\d{2}$/.test(f.time)) errors.push("Enter a time.");
  if (f.modes.length === 0) errors.push("Choose at least one way to travel besides walking.");
  for (const [value, name] of [[f.budget, "Budget"], [f.maxWalk, "Walking limit"], [f.maxTransfers, "Changes"]] as const) {
    if (value !== "" && !(Number(value) >= 0)) errors.push(`${name} must be a positive number.`);
  }
  return errors;
}

function toTraveller(f: FormState): Traveller {
  const from = findPlace(f.from)!;
  const to = findPlace(f.to)!;
  const num = (v: string) => (v === "" ? null : Number(v));
  return {
    traveller_id: "CUSTOM",
    name: "Your trip",
    origin: { label: from.label, lat: from.lat, lon: from.lon, poi_id: from.poi_id },
    destination: { label: to.label, lat: to.lat, lon: to.lon, poi_id: to.poi_id },
    leave_at: f.timeMode === "leave" ? f.time : null,
    arrive_by: f.timeMode === "arrive" ? f.time : null,
    hard_deadline: f.timeMode === "arrive" && f.hardDeadline,
    max_budget_inr: num(f.budget),
    max_walk_min: num(f.maxWalk),
    max_transfers: num(f.maxTransfers),
    priority: f.priority,
    modes_allowed: ["walk", ...f.modes],
    step_free: f.stepFree,
    heavy_luggage: f.heavyLuggage,
    avoid_crowds: f.avoidCrowds,
    language: f.language,
    itinerary: null,
  };
}

const input =
  "w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30";
const labelCls = "mb-1 block text-xs font-medium text-muted";

function Toggle({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
        checked ? "border-brand bg-brand-soft" : "border-line"
      }`}
    >
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-[var(--brand)]" />
      {children}
    </label>
  );
}

export default function TripForm() {
  const router = useRouter();
  const listId = useId();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<string[]>([]);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  function toggleMode(mode: Mode, on: boolean) {
    set("modes", on ? [...form.modes, mode] : form.modes.filter((m) => m !== mode));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate(form);
    setErrors(errs);
    if (errs.length === 0) router.push(tripHref(toTraveller(form)));
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <datalist id={listId}>
        {PLACE_OPTIONS.map((p) => (
          <option key={p.label} value={p.label} />
        ))}
      </datalist>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Plan a trip</h2>
        <label className="flex items-center gap-2 text-xs text-muted">
          Fill from example
          <select
            className="rounded-lg border border-line bg-surface px-2 py-1 text-xs text-text"
            defaultValue=""
            onChange={(e) => {
              const t = travellers.find((x) => x.traveller_id === e.target.value);
              if (t) {
                setForm(fromTraveller(t));
                setErrors([]);
              }
            }}
          >
            <option value="" disabled>
              Choose…
            </option>
            {travellers
              .filter((t) => t.destination)
              .map((t) => (
                <option key={t.traveller_id} value={t.traveller_id}>
                  {t.name}
                </option>
              ))}
          </select>
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelCls} htmlFor="from">From</label>
          <input id="from" list={listId} className={input} placeholder="e.g. Thane station" value={form.from}
            onChange={(e) => set("from", e.target.value)} autoComplete="off" />
        </div>
        <div>
          <label className={labelCls} htmlFor="to">To</label>
          <input id="to" list={listId} className={input} placeholder="e.g. Wankhede Stadium" value={form.to}
            onChange={(e) => set("to", e.target.value)} autoComplete="off" />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[auto_auto_1fr] sm:items-end">
        <div>
          <span className={labelCls}>When</span>
          <div className="flex rounded-xl border border-line p-0.5" role="radiogroup" aria-label="Leave at or arrive by">
            {(["leave", "arrive"] as const).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={form.timeMode === m}
                onClick={() => set("timeMode", m)}
                className={`rounded-lg px-3 py-2 text-sm ${form.timeMode === m ? "bg-brand text-brand-ink" : "text-muted"}`}>
                {m === "leave" ? "Leave at" : "Arrive by"}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className={labelCls} htmlFor="time">Time (demo day, IST)</label>
          <input id="time" type="time" className={input} value={form.time} onChange={(e) => set("time", e.target.value)} />
        </div>
        {form.timeMode === "arrive" && (
          <Toggle checked={form.hardDeadline} onChange={(v) => set("hardDeadline", v)}>
            ⏰ Hard deadline (must not be late)
          </Toggle>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <label className={labelCls} htmlFor="budget">Max budget (₹)</label>
          <input id="budget" inputMode="numeric" className={input} placeholder="No limit" value={form.budget}
            onChange={(e) => set("budget", e.target.value.replace(/\D/g, ""))} />
        </div>
        <div>
          <label className={labelCls} htmlFor="walk">Max walking (min)</label>
          <input id="walk" inputMode="numeric" className={input} placeholder="No limit" value={form.maxWalk}
            onChange={(e) => set("maxWalk", e.target.value.replace(/\D/g, ""))} />
        </div>
        <div>
          <label className={labelCls} htmlFor="transfers">Max changes</label>
          <input id="transfers" inputMode="numeric" className={input} placeholder="No limit" value={form.maxTransfers}
            onChange={(e) => set("maxTransfers", e.target.value.replace(/\D/g, ""))} />
        </div>
        <div>
          <label className={labelCls} htmlFor="priority">Priority</label>
          <select id="priority" className={input} value={form.priority}
            onChange={(e) => set("priority", e.target.value as Traveller["priority"])}>
            {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
      </div>

      <fieldset>
        <legend className={labelCls}>Ways to travel (walking is always included)</legend>
        <div className="flex flex-wrap gap-2">
          {VEHICLE_MODES.map(({ mode, label }) => (
            <Toggle key={mode} checked={form.modes.includes(mode)} onChange={(v) => toggleMode(mode, v)}>
              {label}
            </Toggle>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className={labelCls}>Accessibility & comfort</legend>
        <div className="flex flex-wrap gap-2">
          <Toggle checked={form.stepFree} onChange={(v) => set("stepFree", v)}>♿ Step-free only</Toggle>
          <Toggle checked={form.heavyLuggage} onChange={(v) => set("heavyLuggage", v)}>🧳 Heavy luggage</Toggle>
          <Toggle checked={form.avoidCrowds} onChange={(v) => set("avoidCrowds", v)}>Avoid crowds</Toggle>
          <label className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm">
            Language
            <select className="bg-transparent" value={form.language}
              onChange={(e) => set("language", e.target.value as Traveller["language"])}>
              <option value="en">English</option>
              <option value="hi">हिंदी</option>
              <option value="mr">मराठी</option>
            </select>
          </label>
        </div>
      </fieldset>

      {errors.length > 0 && (
        <ul role="alert" className="rounded-xl border border-bad/40 bg-bad-soft p-3 text-sm text-bad">
          {errors.map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="rounded-xl bg-brand px-5 py-2.5 text-sm font-medium text-brand-ink transition hover:opacity-90">
          Plan my trip
        </button>
        <span className="text-xs text-muted">
          Covers {PLACE_OPTIONS.length} Mumbai places and stations in this prototype.
        </span>
      </div>
    </form>
  );
}
