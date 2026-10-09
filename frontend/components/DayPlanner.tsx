"use client";

// Day Itinerary (A9, PS requirement): pick up to 5 places for one day; TravelBuddy finds the best
// order that fits opening hours, closed days and fixed times (e.g. Marine Drive at sunset), with
// the live, disruption-aware route for each hop. POST /itinerary.

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import poisMock from "@/mocks/pois.json";
import { type ItineraryPlan, planItinerary, travellers } from "@/lib/api";
import { findPlace, PLACE_OPTIONS } from "@/lib/places";
import { translate, useT } from "@/lib/i18n";
import { M } from "@/lib/i18n/messages/DayPlanner";
import type { Traveller } from "@/lib/types";
import Icon from "./Icon";
import MapView from "./MapView";
import StoryPanel from "./StoryPanel";

const POIS = poisMock.pois as unknown as Record<string, { name: string; lat: number; lon: number }>;
type Stop = { poi_id: string; must_visit: boolean; fixed_time: string };
const MAX_STOPS = 5;

const tr4 = travellers.find((t) => t.traveller_id === "TR4")!;
const exampleStops = (): Stop[] =>
  (tr4.itinerary?.stops ?? []).map((s) => ({ poi_id: s.poi_id, must_visit: s.must_visit, fixed_time: s.fixed_time ?? "" }));

export default function DayPlanner() {
  // Empty for the traveller to fill in; /itinerary?demo=TR4 (Home's demo traveller card) opens the
  // Kulkarni family's example day already planned.
  const t = useT(M);
  const demo = useSearchParams().get("demo") === "TR4";
  const [start, setStart] = useState(demo ? tr4.origin.label : "");
  const [dayStart, setDayStart] = useState(demo ? tr4.itinerary?.day_start ?? "13:30" : "10:00");
  const [dayEnd, setDayEnd] = useState(demo ? tr4.itinerary?.day_end ?? "19:30" : "19:00");
  const [budget, setBudget] = useState(demo ? String(tr4.max_budget_inr ?? "") : "");
  const [stops, setStops] = useState<Stop[]>(demo ? exampleStops() : []);
  const [plan, setPlan] = useState<ItineraryPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useState(0);

  const traveller = useMemo<Traveller | null>(() => {
    const origin = start === tr4.origin.label ? tr4.origin : findPlace(start);
    if (!origin || stops.length === 0) return null;
    return {
      ...tr4, traveller_id: "CUSTOM", name: "Your day",
      origin: { label: origin.label, lat: origin.lat, lon: origin.lon, poi_id: origin.poi_id ?? null },
      leave_at: dayStart, max_budget_inr: budget ? Number(budget) : null,
      itinerary: { day_start: dayStart, day_end: dayEnd, stops: stops.map((s) => ({ poi_id: s.poi_id, must_visit: s.must_visit, fixed_time: s.fixed_time || null })) },
    };
  }, [start, dayStart, dayEnd, budget, stops]);

  const run = useCallback(async () => {
    if (!traveller) return;
    setBusy(true);
    setError(null);
    try {
      setPlan(await planItinerary(traveller));
      setFocus(0);
    } catch {
      setError(translate(M, "serverDown"));
    } finally {
      setBusy(false);
    }
  }, [traveller]);

  // Opened from the demo traveller card: plan the example day straight away.
  useEffect(() => {
    if (demo) Promise.resolve().then(run);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Quick fixes change the form, then re-plan once the new values are in (run is rebuilt from them).
  const replanAfterChange = useRef(false);
  useEffect(() => {
    if (replanAfterChange.current) {
      replanAfterChange.current = false;
      Promise.resolve().then(run);
    }
  }, [run]);

  function loadExample() {
    setStart(tr4.origin.label);
    setDayStart(tr4.itinerary?.day_start ?? "13:30");
    setDayEnd(tr4.itinerary?.day_end ?? "19:30");
    setBudget(String(tr4.max_budget_inr ?? ""));
    setStops(exampleStops());
    setPlan(null);
  }

  function clearAll() {
    setStart("");
    setBudget("");
    setStops([]);
    setPlan(null);
  }

  const toggle = (id: string) =>
    setStops((s) => (s.some((x) => x.poi_id === id) ? s.filter((x) => x.poi_id !== id)
      : s.length >= MAX_STOPS ? s : [...s, { poi_id: id, must_visit: true, fixed_time: "" }]));
  const update = (id: string, patch: Partial<Stop>) => setStops((s) => s.map((x) => (x.poi_id === id ? { ...x, ...patch } : x)));

  const focused = plan?.stops?.[focus];

  return (
    <main className="flex w-full flex-col gap-4 px-4 pb-16 pt-4 md:px-6">
      <header className="flex flex-col gap-1">
        <span className="flex items-center gap-1 text-caption font-bold uppercase tracking-wider text-primary"><Icon name="event_note" className="text-[16px]" /> {t("eyebrow")}</span>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="max-w-3xl text-sm text-on-surface-variant">
          {t("intro", { max: MAX_STOPS })}
        </p>
      </header>

      {demo && <StoryPanel traveller={tr4} onReplan={run} />}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-12">
        {/* ---- Form ---- */}
        <section className="flex flex-col gap-4 rounded-2xl bg-container-lowest p-5 shadow-sm lg:col-span-4">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={loadExample}
              className="flex items-center gap-1 rounded-lg bg-container-low px-3 py-1.5 text-caption font-semibold text-primary hover:bg-container">
              <Icon name="family_restroom" className="text-[16px]" /> {t("loadExample")}
            </button>
            {(stops.length > 0 || start) && (
              <button type="button" onClick={clearAll} className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-caption font-semibold text-on-surface-variant hover:bg-container-low">
                <Icon name="restart_alt" className="text-[16px]" /> {t("clear")}
              </button>
            )}
          </div>
          <datalist id="day-places">{PLACE_OPTIONS.map((p) => <option key={p.label} value={p.label} />)}</datalist>
          <label className="flex flex-col gap-1 text-small font-semibold">
            {t("startFrom")}
            <input list="day-places" value={start} onChange={(e) => setStart(e.target.value)} placeholder={t("startPlaceholder")}
              className="rounded-xl bg-container-low px-3 py-2.5 font-normal focus:outline-none focus:ring-2 focus:ring-primary" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex min-w-0 flex-col gap-1 text-small font-semibold">{t("from")}
              <input type="time" value={dayStart} onChange={(e) => setDayStart(e.target.value)} className="w-full min-w-0 rounded-xl bg-container-low px-2 py-2 font-normal tabular-nums" />
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-small font-semibold">{t("until")}
              <input type="time" value={dayEnd} onChange={(e) => setDayEnd(e.target.value)} className="w-full min-w-0 rounded-xl bg-container-low px-2 py-2 font-normal tabular-nums" />
            </label>
            <label className="col-span-2 flex flex-col gap-1 text-small font-semibold">{t("budget")}
              <input inputMode="numeric" value={budget} onChange={(e) => setBudget(e.target.value.replace(/\D/g, ""))} placeholder={t("any")}
                className="rounded-xl bg-container-low px-2 py-2 font-normal" />
            </label>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-small font-semibold">{t("yourStops", { n: stops.length, max: MAX_STOPS })}</span>
            {stops.length === 0 && <p className="rounded-xl bg-container-low p-3 text-small text-on-surface-variant">{t("noStops")}</p>}
            {stops.map((s) => (
              <div key={s.poi_id} className="flex flex-col gap-2 rounded-xl bg-container-low p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-small font-semibold">{POIS[s.poi_id]?.name ?? s.poi_id}</span>
                  <button type="button" onClick={() => toggle(s.poi_id)} aria-label={t("remove")} className="rounded p-0.5 text-outline hover:text-error"><Icon name="close" className="text-[18px]" /></button>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-caption">
                  <button type="button" onClick={() => update(s.poi_id, { must_visit: !s.must_visit })}
                    className={`rounded-full px-2 py-0.5 font-bold ${s.must_visit ? "bg-primary text-on-primary" : "bg-container-high text-on-surface-variant"}`}>
                    {s.must_visit ? t("mustVisit") : t("optional")}
                  </button>
                  <label className="flex items-center gap-1">{t("at")} <input type="time" value={s.fixed_time} onChange={(e) => update(s.poi_id, { fixed_time: e.target.value })}
                    className="rounded bg-container-lowest px-1 py-0.5" /> <span className="text-outline">{t("optionalParen")}</span></label>
                </div>
              </div>
            ))}
          </div>

          <details className="text-small" open={stops.length === 0}>
            <summary className="cursor-pointer font-semibold text-primary">{t("addPlaces")}</summary>
            <div className="mt-2 flex max-h-56 flex-wrap gap-1.5 overflow-y-auto">
              {Object.entries(POIS).filter(([id]) => !stops.some((s) => s.poi_id === id)).map(([id, p]) => (
                <button key={id} type="button" onClick={() => toggle(id)} disabled={stops.length >= MAX_STOPS}
                  className="rounded-full bg-container-low px-2.5 py-1 text-caption hover:bg-primary-fixed disabled:opacity-40">+ {p.name}</button>
              ))}
            </div>
          </details>

          <button type="button" onClick={run} disabled={busy || !traveller}
            className="flex items-center justify-center gap-1 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-on-primary hover:bg-primary-container disabled:opacity-50">
            <Icon name="auto_awesome" className="text-[18px]" /> {busy ? t("planning") : t("planMyDay")}
          </button>
          {!traveller && <p className="text-caption text-error">{t("needInput")}</p>}
          {error && <p className="rounded-xl bg-amber-soft p-2 text-small text-amber-ink">{error}</p>}
        </section>

        {/* ---- Result ---- */}
        <section className="flex flex-col gap-4 lg:col-span-8">
          {plan && (!plan.feasible || plan.partial) && (plan.dropped?.length ?? 0) > 0 && (
            <LeftOut plan={plan} onFix={(fix) => { replanAfterChange.current = true; fix(); }}
              fixes={{
                longer: () => setDayEnd((e) => addHour(e)),
                earlier: () => setDayStart((d) => addHour(d, -1)),
                optional: () => setStops((ss) => ss.map((x) => ({ ...x, must_visit: false }))),
                noFixed: () => setStops((ss) => ss.map((x) => ({ ...x, fixed_time: "" }))),
              }}
              hasFixed={stops.some((x) => x.fixed_time)} />
          )}
          {plan?.feasible && plan.stops && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Mini label={t("stops")} value={`${plan.stops.length}`} />
                <Mini label={t("travelTime")} value={t("minutes", { n: plan.total_travel_min ?? "" })} />
                <Mini label={t("fares")} value={`₹${plan.total_cost_inr}`} />
                <Mini label={t("dayEnds")} value={plan.ends_at ?? ""} />
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-2">
                <ol className="flex flex-col rounded-2xl bg-container-lowest p-5 shadow-sm">
                  {plan.stops.map((s, i) => (
                    <li key={s.poi_id} className="relative flex gap-3 pb-5 last:pb-0">
                      {i < plan.stops!.length - 1 && <span className="absolute bottom-0 left-4 top-9 w-0.5 bg-primary/30" />}
                      <span className="z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-on-primary">{i + 1}</span>
                      <button type="button" onClick={() => setFocus(i)}
                        className={`flex min-w-0 flex-1 flex-col gap-1 rounded-xl p-2 text-left transition ${focus === i ? "bg-primary-fixed/30" : "hover:bg-container-low"}`}>
                        <span className="flex items-center gap-1 text-caption text-on-surface-variant">
                          <Icon name="alt_route" className="text-[14px]" /> {s.leg.depart} {s.leg.route} · {t("minutes", { n: s.leg.duration_min })} · ₹{s.leg.cost_inr}
                          {s.leg.event_ids.length > 0 && <span className="rounded bg-tertiary-fixed px-1 font-bold text-tertiary">⚠ {Math.round(s.leg.reliability * 100)}%</span>}
                        </span>
                        <span className="font-semibold">{s.name}</span>
                        <span className="text-small">
                          {t("arrive", { time: s.arrive })}{s.wait_min > 0 ? t("wait", { n: s.wait_min }) : ""} · {t("visit")} <b>{s.visit_start}–{s.leave}</b>
                          {s.fixed_time ? <span className="ml-1 rounded bg-secondary-container px-1 text-micro font-bold">{t("fixed", { time: s.fixed_time })}</span> : null}
                        </span>
                        <span className={`text-caption ${s.tight ? "font-semibold text-error" : "text-on-surface-variant"}`}>
                          {s.opens ? t("openHours", { opens: s.opens, closes: s.closes ?? "" }) : t("open24")} · {s.tight ? t("onlySpare", { n: s.slack_min }) : s.slack_min >= 999 ? t("plentySlack") : t("minSlack", { n: s.slack_min })}
                          {!s.must_visit ? t("optionalTag") : ""}
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
                <div className="flex flex-col gap-3">
                  <p className="flex items-center gap-1 text-caption text-on-surface-variant">
                    <Icon name="pin_drop" className="text-[16px] text-primary" /> {t("mapLegendNumbers")} · <b>S</b> {t("mapLegendStart")} · {t("mapLegendClick")}
                  </p>
                  <div className="h-[420px] overflow-hidden rounded-2xl bg-container-lowest shadow-sm">
                    {focused && (
                      <MapView
                        card={focused.leg.card}
                        origin={focus === 0 ? traveller?.origin ?? null : {
                          label: plan.stops[focus - 1].name, lat: POIS[plan.stops[focus - 1].poi_id]?.lat ?? 0, lon: POIS[plan.stops[focus - 1].poi_id]?.lon ?? 0 }}
                        destination={{ label: focused.name, lat: POIS[focused.poi_id]?.lat ?? 0, lon: POIS[focused.poi_id]?.lon ?? 0 }}
                        stops={[
                          ...(traveller ? [{ lat: traveller.origin.lat, lon: traveller.origin.lon, label: traveller.origin.label, badge: "S", sub: t("leave", { time: plan.day_start ?? "" }) }] : []),
                          ...plan.stops.map((s, i) => ({
                            lat: POIS[s.poi_id]?.lat ?? 0, lon: POIS[s.poi_id]?.lon ?? 0, label: s.name, badge: String(i + 1),
                            sub: t("visitRange", { from: s.visit_start, to: s.leave }), active: i === focus,
                          })),
                        ]}
                        onStopClick={(i) => { if (i > 0) setFocus(i - 1); }}
                      />
                    )}
                  </div>
                  {!plan.partial && (plan.dropped?.length ?? 0) > 0 && (
                    <div className="rounded-2xl bg-container-lowest p-4 text-small shadow-sm">
                      <b>{t("optionalLeftOut")}</b>
                      <ul className="mt-1 flex flex-col gap-1">{plan.dropped!.map((d) => <li key={d.poi_id}>• {d.reason}</li>)}</ul>
                    </div>
                  )}
                  {(plan.warnings?.length ?? 0) > 0 && (
                    <div className="rounded-2xl bg-tertiary-fixed p-4 text-small text-tertiary">
                      {plan.warnings!.map((w) => <p key={w} className="flex items-start gap-1"><Icon name="warning" className="text-[16px]" /> {w}</p>)}
                    </div>
                  )}
                  <p className="text-caption text-outline">
                    {t("plannedOn", { day: plan.weekday ?? "" })} <Link href="/transparency" className="font-semibold text-primary">{t("howItWorks")}</Link>
                  </p>
                </div>
              </div>
            </>
          )}
          {!plan && busy && <p className="text-sm text-on-surface-variant">{t("planning")}</p>}
          {!plan && !busy && (
            <div className="flex flex-col items-center gap-2 rounded-2xl bg-container-lowest p-10 text-center shadow-sm">
              <Icon name="event_note" className="text-[40px] text-outline" />
              <p className="text-sm font-semibold">{t("emptyTitle")}</p>
              <p className="max-w-sm text-small text-on-surface-variant">{t("emptyBefore", { max: MAX_STOPS })} <b>{t("planMyDay")}</b>{t("emptyAfter")}</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function addHour(hhmm: string, by = 1): string {
  const [h, m] = hhmm.split(":").map(Number);
  const t = Math.min(23 * 60 + 59, Math.max(0, h * 60 + m + by * 60));
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

/** Not everything fits: what was planned, each place left out with the reason, and quick fixes. */
function LeftOut({ plan, fixes, onFix, hasFixed }: {
  plan: ItineraryPlan;
  fixes: Record<"longer" | "earlier" | "optional" | "noFixed", () => void>;
  onFix: (fix: () => void) => void;
  hasFixed: boolean;
}) {
  const t = useT(M);
  const kept = plan.stops?.length ?? 0;
  const dropped = plan.dropped ?? [];
  const mustDropped = dropped.filter((d) => d.must_visit).length;
  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-container-lowest p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-soft text-amber-ink"><Icon name="event_busy" /></span>
        <div>
          <h2 className="text-lg font-semibold">
            {kept ? t("notAllFit", { kept, total: kept + dropped.length }) : t("noneFit")}
          </h2>
          <p className="text-sm text-on-surface-variant">
            {kept ? t("keptMost") : t("whyEach")}
            {mustDropped ? t(mustDropped === 1 ? "mustDropped1" : "mustDroppedN", { n: mustDropped }) : ""}
          </p>
        </div>
      </div>
      <ul className="flex flex-col gap-1.5">
        {dropped.map((d) => (
          <li key={d.poi_id} className="flex items-start gap-2 rounded-xl bg-amber-soft/60 px-3 py-2 text-sm">
            <Icon name="close" className="text-[18px] text-amber-ink" />
            <span>
              {d.must_visit && <span className="mr-1 rounded bg-error-container px-1.5 py-0.5 text-micro font-bold text-on-error-container">{t("mustVisitTag")}</span>}
              {d.reason}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-2">
        <span className="text-caption font-bold uppercase tracking-wider text-on-surface-variant">{t("try")}</span>
        <div className="flex flex-wrap gap-2">
          {[
            { k: "earlier" as const, icon: "wb_sunny", label: t("fixEarlier") },
            { k: "longer" as const, icon: "more_time", label: t("fixLonger") },
            ...(hasFixed ? [{ k: "noFixed" as const, icon: "schedule", label: t("fixNoFixed") }] : []),
            ...(mustDropped ? [{ k: "optional" as const, icon: "checklist", label: t("fixOptional") }] : []),
          ].map((f) => (
            <button key={f.k} type="button" onClick={() => onFix(fixes[f.k])}
              className="flex items-center gap-1 rounded-xl bg-container-low px-3 py-2 text-small font-semibold hover:bg-container">
              <Icon name={f.icon} className="text-[18px] text-primary" /> {f.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-container-lowest p-4 shadow-sm">
      <span className="block eyebrow">{label}</span>
      <span className="text-xl font-bold">{value}</span>
    </div>
  );
}
