"use client";

// Journey Planner — built from the team's design (stitch: mobilink_web_journey_planner).
// Everything is live: the form (places, time, modes, priority, trip limits) builds a real trip for
// Route Results; the side panels show Pakka Check's live problems and a live preview of the top
// routes for the places typed. Only the saved-place shortcuts are sample data (lib/mockPlanner.ts).

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";
import { getPlan } from "@/lib/api";
import { eventTitle, evidenceSummary, lineShortName, MODE_LABEL, pct, PLAN_LABEL, STATUS_STYLE } from "@/lib/format";
import { defaults, quickChips } from "@/lib/mockPlanner";
import { getProfile, openProfile, useProfile } from "@/lib/profile";
import { activeEvents } from "@/lib/network";
import { useLiveEvents } from "@/lib/useLiveEvents";
import { findPlace, PLACE_OPTIONS } from "@/lib/places";
import { useT } from "@/lib/i18n";
import { COMMON } from "@/lib/i18n/common";
import { M } from "@/lib/i18n/messages/JourneyPlanner";
import { EMPTY_FORM, type FormState, NOW, travellerFromForm, validateForm } from "@/lib/tripForm";
import { tripHref } from "@/lib/tripUrl";
import type { Mode, PlanResponse, RouteCard } from "@/lib/types";
import Icon from "./Icon";
import MapView from "./MapView";

type Departure = "now" | "at" | "by";

// Labels are translation keys (M = this screen's messages, C = COMMON), looked up in render.
const MODALITIES: { id: string; label: { M: keyof typeof M.en } | { C: keyof typeof COMMON.en }; icon: string; modes: Mode[] }[] = [
  { id: "overall", label: { M: "mod.overall" }, icon: "all_inclusive", modes: ["local", "metro", "bus", "auto", "taxi", "cab"] },
  { id: "metro", label: { C: "mode.metro" }, icon: "subway", modes: ["metro"] },
  { id: "local", label: { C: "mode.local" }, icon: "train", modes: ["local"] },
  { id: "bus", label: { C: "mode.bus" }, icon: "directions_bus", modes: ["bus"] },
  { id: "vehicles", label: { M: "mod.vehicles" }, icon: "directions_car", modes: ["auto", "taxi", "cab"] },
  { id: "walk", label: { M: "mod.walk" }, icon: "directions_walk", modes: [] },
];

const STRATEGIES = [
  { value: "fastest", label: "s.fastest", hint: "s.fastestHint" },
  { value: "fewest_transfers", label: "s.fewest", hint: "s.fewestHint" },
  { value: "cheapest", label: "s.cheapest", hint: "s.cheapestHint" },
] as const;

/** Text from the URL, replaced by the known place it matches (so it shows as recognised). */
function snap(text: string | null): string | null {
  if (text == null) return null;
  return findPlace(text)?.label ?? text;
}

export default function JourneyPlanner() {
  const router = useRouter();
  const params = useSearchParams();
  const listId = useId();
  const [form, setForm] = useState<FormState>(() => ({
    ...EMPTY_FORM,
    from: snap(params.get("from")) ?? defaults.from,
    to: snap(params.get("to")) ?? defaults.to,
    priority: "fastest",
    modes: ["local", "metro", "bus", "auto", "taxi", "cab"],
  }));
  const [via, setVia] = useState<string | null>(null);
  const [departure, setDeparture] = useState<Departure>("now");
  const [editTime, setEditTime] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const profile = useProfile();
  const t = useT(M);
  const tc = useT(COMMON);

  // Start from the commuter's saved preferences (profile panel). Applied after mount, because the
  // profile lives in this browser and the first render must match the server's.
  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      const p = getProfile();
      setForm((f) => ({ ...f, priority: p.priority, stepFree: p.stepFree, language: p.appLanguage, modes: p.modes.length ? [...p.modes] : f.modes }));
    });
    return () => { cancelled = true; };
  }, []);

  const origin = findPlace(form.from) ?? null;
  const destination = findPlace(form.to) ?? null;
  const live = useLiveEvents();
  const problems = useMemo(() => activeEvents(live?.events).sort((a, b) => b.confidence - a.confidence), [live]);
  const preview = usePreview(departure === "now" ? { ...form, timeMode: "leave", time: NOW } : form);

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
    const errs = validateForm(departure === "now" ? { ...form, time: NOW } : form);
    setErrors(errs);
    if (errs.length === 0) router.push(tripHref(travellerFromForm(departure === "now" ? { ...form, timeMode: "leave", time: NOW } : form)));
  }

  return (
    <main className="flex w-full flex-col gap-4 px-4 pb-16 pt-4 md:px-6">
      {/* ---- Engine strip ---- */}
      <section className="flex flex-col gap-2 rounded-2xl bg-container-low/70 px-5 py-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="flex items-center gap-1 text-base font-medium uppercase tracking-wide text-primary">
            <Icon name="alt_route" /> {t("engine")}
          </span>
          <span className="hidden text-outline md:inline">•</span>
          <span className="text-sm text-on-surface-variant">{t("engineSub")}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg bg-secondary-container px-2 py-0.5 text-sm text-on-secondary-container">
            {live?.source === "backend"
              ? t("liveStatus", { time: live.asOf ?? "", confirmed: problems.filter((e) => e.status === "confirmed").length, possible: problems.filter((e) => e.status === "possible").length })
              : t("offline")}
          </span>
          <button type="button" onClick={() => { setForm((f) => ({ ...f, from: defaults.from, to: defaults.to })); setErrors([]); }}
            className="flex items-center gap-1 rounded-lg bg-container-lowest px-2 py-0.5 text-sm hover:bg-container">
            <Icon name="history" className="text-[18px]" /> {t("restore")}
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
                <p className="text-micro font-bold uppercase tracking-[0.12em] text-primary">{t("eyebrow")}</p>
                <h1 className="text-2xl font-semibold">{t("title")}</h1>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setForm((f) => ({ ...f, from: f.to, to: f.from }))} aria-label={t("swap")}
                  className="grid h-11 w-11 place-items-center rounded-xl bg-container-low hover:bg-container"><Icon name="swap_vert" /></button>
                <button type="button" onClick={() => { setForm({ ...EMPTY_FORM, priority: "fastest" }); setVia(null); setErrors([]); }} aria-label={t("reset")}
                  className="grid h-11 w-11 place-items-center rounded-xl bg-container-low hover:bg-container"><Icon name="refresh" /></button>
              </div>
            </div>

            {/* Departure / via / destination */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-small">
                <span className="font-semibold text-slate">{t("departurePoint")}</span>
                <button type="button" onClick={() => set("from", "Andheri station")} title={t("myLocationTitle")}
                  className="flex items-center gap-1 font-semibold text-primary">
                  <Icon name="my_location" className="text-[16px]" /> {t("myLocation")}
                </button>
              </div>
              <PlaceInput listId={listId} value={form.from} onChange={(v) => set("from", v)} dot="bg-primary"
                placeholder={t("fromPlaceholder")} label={t("fromLabel")} />

              <div className="flex items-center justify-between py-1 text-small">
                {via === null ? (
                  <button type="button" onClick={() => setVia("")} className="flex items-center gap-1.5 text-base text-primary">
                    <Icon name="add_circle" className="text-[20px]" /> {t("addVia")}
                  </button>
                ) : (
                  <div className="flex w-full items-center gap-2">
                    <input list={listId} value={via} onChange={(e) => setVia(e.target.value)} aria-label={t("viaLabel")}
                      placeholder={t("viaPlaceholder")}
                      className="min-w-0 flex-1 rounded-lg border border-dashed border-outline-variant bg-container-lowest px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                    <button type="button" onClick={() => setVia(null)} aria-label={t("removeVia")} className="text-outline hover:text-on-surface"><Icon name="close" /></button>
                  </div>
                )}
                {via === null && <span className="text-on-surface-variant">{t("direct")}</span>}
              </div>

              <div className="flex items-center justify-between text-small">
                <span className="font-semibold text-slate">{t("finalDest")}</span>
                <span className="text-on-surface-variant">{t("zone")}</span>
              </div>
              <PlaceInput listId={listId} value={form.to} onChange={(v) => set("to", v)} pin
                placeholder={t("toPlaceholder")} label={t("toLabel")} />
            </div>

            {/* Shortcuts */}
            <div className="flex flex-col gap-2">
              <span className="text-small text-on-surface-variant">{t("shortcuts")}</span>
              <div className="grid grid-cols-2 gap-2">
                {profile.places.map((p) => (
                  <button key={p.id} type="button" onClick={() => (p.place ? set("to", snap(p.place) ?? p.place) : openProfile("places"))}
                    className="flex min-w-0 items-center gap-3 rounded-xl border border-hairline bg-container-low/50 px-4 py-3 text-left transition hover:border-primary">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-container"><Icon name={p.id === "home" ? "home" : "work"} className="text-on-surface-variant" /></span>
                    <span className="flex min-w-0 flex-col">
                      <span className="font-semibold">{p.id === "home" && p.title === "Home" ? t("home") : p.id === "work" && p.title === "Work" ? t("work") : p.title}</span>
                      <span className="truncate text-small text-on-surface-variant">{p.place || t("addInProfile")}</span>
                    </span>
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {quickChips.map((c) => (
                  <button key={c.label} type="button" onClick={() => set("to", c.place)}
                    className="flex items-center gap-1.5 rounded-lg bg-container-low px-3 py-1.5 text-body hover:bg-container">
                    <Icon name={c.icon} className="text-[18px]" /> {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Departure scheduling */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-small">
                <span className="font-semibold text-slate">{t("scheduling")}</span>
                <span className="font-semibold text-primary">{t("peak")}</span>
              </div>
              <div className="grid grid-cols-3 rounded-xl bg-container-low p-1" role="radiogroup" aria-label={t("departureGroup")}>
                {([["now", "departNow"], ["at", "departAt"], ["by", "arriveBy"]] as const).map(([d, l]) => (
                  <button key={d} type="button" role="radio" aria-checked={departure === d} onClick={() => chooseDeparture(d)}
                    className={`flex items-center justify-center gap-1 rounded-lg py-2 text-body ${departure === d ? "bg-container-lowest text-primary shadow-sm" : "text-on-surface-variant"}`}>
                    {departure === d && <span className="h-1.5 w-1.5 rounded-full bg-primary" />} {t(l)}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-container-low px-3 py-2.5">
                  <Icon name="schedule" className="text-outline" />
                  {editTime ? (
                    <input type="time" value={form.time} onChange={(e) => set("time", e.target.value)} aria-label={t("time")}
                      className="bg-transparent text-body tabular-nums focus:outline-none" />
                  ) : (
                    <span className="truncate text-body">{departure === "now" ? t("nowDemo") : t("todayAt", { time: form.time })}</span>
                  )}
                </label>
                <button type="button" onClick={() => setEditTime((v) => !v)} className="rounded-xl bg-container-low px-4 text-body hover:bg-container">
                  {editTime ? t("done") : t("change")}
                </button>
              </div>
            </div>

            {/* Modalities */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-small">
                <span className="font-semibold text-slate">{t("modalities")}</span>
                <span className="text-on-surface-variant">{t("tapToggle")}</span>
              </div>
              <div className="grid grid-cols-6 gap-1.5">
                {MODALITIES.map((m) => {
                  const on = modalityOn(m);
                  const primary = m.id === "overall" && on;
                  return (
                    <button key={m.id} type="button" onClick={() => toggleModality(m)} aria-pressed={on} title={m.id === "walk" ? t("walkAlways") : undefined}
                      className={`flex flex-col items-center gap-1 rounded-xl px-1 py-2.5 text-micro font-semibold transition ${
                        primary ? "bg-primary text-on-primary" : on ? "bg-primary-soft text-primary-ink" : "bg-container-low text-on-surface-variant hover:bg-container"}`}>
                      <Icon name={m.icon} className="text-[22px]" /> {"M" in m.label ? t(m.label.M) : tc(m.label.C)}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Priority */}
            <div className="flex flex-col gap-2">
              <span className="text-small font-semibold text-slate">{t("priority")}</span>
              <div className="grid grid-cols-3 gap-2">
                {STRATEGIES.map((s) => {
                  const on = form.priority === s.value;
                  return (
                    <button key={s.value} type="button" role="radio" aria-checked={on} onClick={() => set("priority", s.value)}
                      className={`flex flex-col items-start gap-1 rounded-xl p-3 text-left transition ${on ? "bg-primary-soft ring-1 ring-primary" : "bg-container-low hover:bg-container"}`}>
                      <span className="flex items-start gap-1.5">
                        <Icon name={on ? "radio_button_checked" : "radio_button_unchecked"} className={`text-[20px] ${on ? "text-primary" : "text-outline"}`} />
                        <span className="text-body font-semibold leading-tight">{t(s.label)}</span>
                      </span>
                      <span className="pl-6 text-caption leading-snug text-on-surface-variant">{t(s.hint)}</span>
                    </button>
                  );
                })}
              </div>
              <label className="flex cursor-pointer items-center justify-between rounded-xl bg-container-low px-3 py-3 text-body">
                <span className="flex items-center gap-2"><Icon name="accessible" className="text-primary" /> {t("stepFree")}</span>
                <input type="checkbox" checked={form.stepFree} onChange={(e) => set("stepFree", e.target.checked)} className="h-5 w-5 accent-[var(--primary)]" />
              </label>
            </div>

            {/* Trip limits (PS: budget, walking, changes, deadline, luggage, crowds, language) */}
            <div className="flex flex-col gap-2">
              <span className="text-small font-semibold text-slate">{t("limits")}</span>
              <div className="grid grid-cols-3 gap-2">
                <NumberBox label={t("budget")} value={form.budget} onChange={(v) => set("budget", v)} placeholder={t("any")} />
                <NumberBox label={t("maxWalk")} value={form.maxWalk} onChange={(v) => set("maxWalk", v)} placeholder="15" />
                <NumberBox label={t("maxChanges")} value={form.maxTransfers} onChange={(v) => set("maxTransfers", v)} placeholder="2" />
              </div>
              {departure === "by" && (
                <Toggle icon="flag" label={t("hardDeadline")} checked={form.hardDeadline} onChange={(v) => set("hardDeadline", v)} />
              )}
              <Toggle icon="luggage" label={t("luggage")} checked={form.heavyLuggage} onChange={(v) => set("heavyLuggage", v)} />
              <Toggle icon="groups" label={t("crowds")} checked={form.avoidCrowds} onChange={(v) => set("avoidCrowds", v)} />
              <label className="flex items-center justify-between rounded-xl bg-container-low px-3 py-2.5 text-body">
                <span className="flex items-center gap-2"><Icon name="translate" className="text-primary" /> {t("language")}</span>
                <select value={form.language} onChange={(e) => set("language", e.target.value as FormState["language"])}
                  className="rounded-lg bg-container-lowest px-2 py-1 text-small focus:outline-none">
                  <option value="en">English</option><option value="hi">हिंदी</option><option value="mr">मराठी</option>
                </select>
              </label>
            </div>

            {errors.length > 0 && (
              <ul role="alert" className="rounded-xl bg-error-container p-3 text-sm text-on-error-container">
                {errors.map((e) => <li key={e}>{e}</li>)}
              </ul>
            )}
            <button type="submit" className="flex h-14 items-center justify-center gap-2 rounded-xl bg-primary text-base font-semibold text-on-primary shadow-sm transition hover:bg-primary-container active:scale-[0.98]">
              <Icon name="travel_explore" /> {t("find")} <Icon name="arrow_forward" />
            </button>
          </form>

          {/* Live advisories (Pakka Check) */}
          <section className="flex flex-col gap-3 rounded-2xl bg-container-lowest p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-base font-semibold"><Icon name="campaign" className="text-tertiary" /> {t("advisories")}</h2>
              <span className="rounded-full bg-tertiary-fixed px-2.5 py-0.5 text-small font-semibold text-tertiary">{t("active", { n: problems.length })}</span>
            </div>
            {problems.length === 0 && <p className="text-small text-on-surface-variant">{t("noProblems")}</p>}
            {problems.slice(0, 4).map((e) => (
              <Link key={e.event_id} href={`/events/${e.event_id}`} className="flex gap-3 rounded-xl bg-container-low p-3 hover:bg-container">
                <Icon name={e.status === "confirmed" ? "error" : "info"} className={e.status === "confirmed" ? "text-error" : "text-tertiary"} />
                <div className="min-w-0">
                  <p className="text-body font-medium">{eventTitle(e)}</p>
                  <p className="text-small text-on-surface-variant">{STATUS_STYLE[e.status].label} {pct(e.confidence)} · {evidenceSummary(e)}</p>
                </div>
              </Link>
            ))}
            <div className="flex items-center justify-between text-small">
              <span className="text-on-surface-variant">{t("source")}</span>
              <Link href="/report" className="font-semibold text-primary">{t("viewAll")}</Link>
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
                  <h2 className="text-subtitle font-semibold">{t("canvas")}</h2>
                  <p className="text-small text-on-surface-variant">{t("scale")}</p>
                </div>
              </div>
              <p className="text-small text-on-surface-variant">{t("mapNote")}</p>
            </div>

            <div className="relative h-[560px] bg-container-low">
              <MapView showNetwork origin={origin} destination={destination} events={problems} card={preview.cards[0] ?? null} />
            </div>

            <div className="flex flex-col gap-3 bg-container-low/50 p-5">
              <div className="flex items-center justify-between">
                <span className="text-small font-semibold uppercase tracking-wider text-on-surface-variant">{t("topRoutes")}</span>
                {preview.cards.length > 0 && <span className="text-small text-on-surface-variant">{t("livePreview")}</span>}
              </div>
              {preview.state === "idle" && <p className="text-small text-on-surface-variant">{t("previewIdle")}</p>}
              {preview.state === "loading" && <p className="text-small text-on-surface-variant">{t("previewLoading")}</p>}
              {preview.state === "error" && <p className="text-small text-on-surface-variant">{t("previewError")}</p>}
              {preview.cards.slice(0, 2).map((c) => <PreviewCard key={c.plan_id} card={c} />)}
            </div>
          </section>

          {/* More ways to plan */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Link href="/itinerary" className="flex items-center gap-4 rounded-2xl bg-container-lowest p-4 shadow-sm hover:shadow-md">
              <div className="grid h-20 w-20 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-tertiary-container to-tertiary text-on-primary"><Icon name="event_note" className="text-[36px]" /></div>
              <div className="min-w-0">
                <p className="text-caption font-bold uppercase tracking-wide text-on-surface-variant">{t("severalStops")}</p>
                <p className="text-subtitle font-bold">{t("dayItinerary")}</p>
                <p className="line-clamp-2 text-small text-on-surface-variant">{t("dayDesc")}</p>
              </div>
            </Link>
            <Link href="/compare" className="flex items-center gap-4 rounded-2xl bg-container-lowest p-4 shadow-sm hover:shadow-md">
              <div className="grid h-20 w-20 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary-container text-on-primary"><Icon name="compare_arrows" className="text-[36px]" /></div>
              <div className="min-w-0">
                <p className="text-caption font-bold uppercase tracking-wide text-on-surface-variant">{t("why")}</p>
                <p className="text-subtitle font-bold">{t("compare")}</p>
                <p className="line-clamp-2 text-small text-on-surface-variant">{t("compareDesc")}</p>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

/** Live preview: the real disruption-aware plan for the places typed (debounced). */
function usePreview(form: FormState): { state: "idle" | "loading" | "error" | "ready"; cards: RouteCard[] } {
  const key = validateForm(form).length === 0 ? JSON.stringify(travellerFromForm(form)) : null;
  const [result, setResult] = useState<{ key: string; plan: PlanResponse | null; failed: boolean } | null>(null);
  useEffect(() => {
    if (!key) return;
    let alive = true;
    const t = setTimeout(() => {
      getPlan(JSON.parse(key)).then((plan) => alive && setResult({ key, plan, failed: false }))
        .catch(() => alive && setResult({ key, plan: null, failed: true }));
    }, 500);
    return () => { alive = false; clearTimeout(t); };
  }, [key]);
  if (!key) return { state: "idle", cards: [] };
  if (!result || result.key !== key) return { state: "loading", cards: [] };
  if (result.failed || !result.plan) return { state: "error", cards: [] };
  const order = (c: RouteCard) => (c.recommended ? 0 : 1);
  return { state: "ready", cards: [...result.plan.cards].sort((a, b) => order(a) - order(b)) };
}

function PreviewCard({ card }: { card: RouteCard }) {
  const t = useT(M);
  const tc = useT(COMMON);
  const parts: string[] = [];
  for (const l of card.legs) {
    const n = l.line_id ? lineShortName(l.line_id) : MODE_LABEL[l.mode];
    if (l.mode !== "walk" && parts[parts.length - 1] !== n) parts.push(n);
  }
  const risky = card.legs.some((l) => l.event_ids.length > 0 && l.risk >= 0.3);
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4 rounded-2xl bg-container-lowest p-4 shadow-sm">
      <span className={`flex h-14 w-14 flex-col items-center justify-center rounded-xl ${card.recommended ? "bg-primary text-on-primary" : "bg-container-high text-on-surface"}`}>
        <span className="text-xl font-bold leading-none">{card.duration_min}</span>
        <span className="text-micro font-semibold">{t("minUpper")}</span>
      </span>
      <div className="min-w-0">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className={`rounded-md px-2 py-0.5 text-small font-semibold ${card.recommended ? "bg-primary-fixed text-on-primary-fixed" : "bg-secondary-container text-on-secondary-container"}`}>
            {PLAN_LABEL[card.label]}{card.recommended ? ` · ${t("recommended")}` : ""}
          </span>
          <span className={`rounded-md px-2 py-0.5 text-caption font-bold ${card.reliability_colour === "green" ? "bg-primary-soft text-primary-ink" : card.reliability_colour === "yellow" ? "bg-amber-soft text-amber-ink" : "bg-error-container text-on-error-container"}`}>
            {t("reliable", { pct: pct(card.reliability) })}
          </span>
          {risky && <span className="text-caption font-bold text-error">⚠ {t("liveProblem")}</span>}
        </span>
        <p className="mt-1 truncate text-subtitle font-semibold">{parts.join(" → ") || tc("mode.walk")} <span className="font-medium text-primary">· ₹{card.cost_inr}</span></p>
        <p className="text-small text-on-surface-variant">{card.legs[0].depart} → {card.legs[card.legs.length - 1].arrive} · {t(card.transfers === 1 ? "change1" : "changes", { n: card.transfers })} · {t("walkMin", { n: card.walk_min })}</p>
      </div>
    </div>
  );
}

function NumberBox({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="flex flex-col gap-1 rounded-xl bg-container-low px-3 py-2">
      <span className="text-micro font-bold uppercase text-on-surface-variant">{label}</span>
      <input inputMode="numeric" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
        className="w-full bg-transparent text-body tabular-nums focus:outline-none" />
    </label>
  );
}

function Toggle({ icon, label, checked, onChange }: { icon: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-2 rounded-xl bg-container-low px-3 py-2.5 text-body">
      <span className="flex items-center gap-2"><Icon name={icon} className="text-primary" /> {label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-5 w-5 accent-[var(--primary)]" />
    </label>
  );
}

function PlaceInput({ listId, value, onChange, placeholder, label, dot, pin = false }: {
  listId: string; value: string; onChange: (v: string) => void; placeholder: string; label: string; dot?: string; pin?: boolean;
}) {
  const t = useT(M);
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
          className="min-w-0 flex-1 bg-transparent text-subtitle placeholder:text-outline focus:outline-none" />
        {value && (
          <button type="button" onClick={() => onChange("")} aria-label={t("clear", { label })} className="text-outline hover:text-on-surface">
            <Icon name="close" />
          </button>
        )}
      </div>
      {!known && <span className="text-caption text-error">{t("notCovered")}</span>}
    </div>
  );
}
