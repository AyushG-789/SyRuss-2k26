"use client";

// Compare (PS requirement) + evaluation numbers (A10): the demo day travelled twice — with a
// schedule-only app and with TravelBuddy — scored against what really happened. GET /eval.

import Link from "next/link";
import { useEffect, useState } from "react";
import { type EvalResult, type EvalTrip, getEval } from "@/lib/api";
import { PLAN_LABEL } from "@/lib/format";
import type { PlanLabel } from "@/lib/types";
import { activeLang, useT } from "@/lib/i18n";
import { storyText } from "@/lib/i18n/messages/StoryPanel";
import { COMMON } from "@/lib/i18n/common";
import { M } from "@/lib/i18n/messages/CompareView";
import Icon from "./Icon";

export default function CompareView() {
  const [r, setR] = useState<EvalResult | null>(null);
  const [error, setError] = useState(false);
  const [onlyDiff, setOnlyDiff] = useState(true);
  const tr = useT(M);
  const tc = useT(COMMON);

  useEffect(() => {
    getEval().then(setR).catch(() => setError(true));
  }, []);

  if (error) return <main className="px-6 py-10 text-sm text-on-surface-variant">{tr("offline")}</main>;
  if (!r) return <main className="px-6 py-10 text-sm text-on-surface-variant">{tr("running")}</main>;

  const b = r.schedule_only;
  const t = r.travelbuddy;
  const trips = onlyDiff ? r.trips.filter(differs) : r.trips;

  return (
    <main className="flex w-full flex-col gap-4 px-4 pb-16 pt-4 md:px-6">
      <header className="flex flex-col gap-1">
        <span className="flex items-center gap-1 text-caption font-bold uppercase tracking-wider text-primary"><Icon name="compare_arrows" className="text-[16px]" /> {tr("eyebrow")}</span>
        <h1 className="text-2xl font-semibold">{tr("title")}</h1>
        <p className="max-w-3xl text-sm text-on-surface-variant">{r.method}</p>
      </header>

      {/* ---- Headline numbers ---- */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon="schedule" label={tr("lateTrips")} base={`${b.late_or_failed} / ${r.trips_compared}`} tb={`${t.late_or_failed} / ${r.trips_compared}`} better={t.late_or_failed <= b.late_or_failed} />
        <Stat icon="hourglass_bottom" label={tr("avgLost")} base={`${b.avg_extra_min} ${tc("min")}`} tb={`${t.avg_extra_min} ${tc("min")}`} better={t.avg_extra_min <= b.avg_extra_min} />
        <Stat icon="gpp_good" label={tr("fakeReroutes")} base="—" tb={`${t.false_reroutes_from_fake_reports}`} better={t.false_reroutes_from_fake_reports === 0}
          note={tr("replansNote", { n: t.replans })} />
        <Stat icon="fact_check" label={tr("judged")} base="—" tb={`${r.classification.correct} / ${r.classification.total}`}
          better={r.classification.correct === r.classification.total} note={tr("verdictsAt", { time: r.classification.checked_at })} />
      </section>
      <p className="text-small text-on-surface-variant">
        {tr("price1")} <b>{r.extra_cost_inr >= 0 ? "+" : "−"}₹{Math.abs(r.extra_cost_inr)}</b> {tr("price2")}{" "}
        <b>{r.extra_walk_min >= 0 ? "+" : "−"}{Math.abs(r.extra_walk_min)} {tc("min")}</b> {tr("price3", { n: r.trips_compared, travellers: r.travellers })}
      </p>

      {/* ---- Trips ---- */}
      <section className="flex flex-col gap-3 rounded-2xl bg-container-lowest p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-semibold"><Icon name="route" className="text-primary" /> {tr("tripByTrip")}</h2>
          <label className="flex items-center gap-2 text-small">
            <input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} className="accent-[var(--primary)]" />
            {tr("onlyDiff")}
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-small">
            <thead className="bg-container-low eyebrow">
              <tr><th className="px-3 py-2">{tr("colTraveller")}</th><th className="px-3 py-2">{tr("normalApp")}</th><th className="px-3 py-2">TravelBuddy</th><th className="px-3 py-2">{tr("colWhat")}</th></tr>
            </thead>
            <tbody className="divide-y divide-hairline-soft">
              {trips.map((x) => (
                <tr key={`${x.traveller_id}-${x.label}`} className="align-top">
                  <td className="px-3 py-2.5">
                    <span className="font-semibold">{x.traveller_id} · {PLAN_LABEL[x.label as PlanLabel] ?? x.label}</span>
                    <span className="block text-on-surface-variant">{storyText(activeLang(), x.traveller_id, { name: x.name }).name}</span>
                    <span className="block text-caption text-outline">{x.from} → {x.to} · {tr("leave", { time: x.leave_at })}{x.arrive_by ? ` · ${tr("by", { time: x.arrive_by })}` : ""}</span>
                  </td>
                  <Side s={x.schedule_only} deadline={x.arrive_by} />
                  <Side s={x.travelbuddy} deadline={x.arrive_by} />
                  <td className="px-3 py-2.5 text-on-surface-variant">
                    {x.replans.length > 0 ? x.replans.map((rp) => (
                      <p key={rp.at} className="flex items-start gap-1"><Icon name="alt_route" className="text-[16px] text-primary" /> {rp.at}: {rp.message}</p>
                    )) : x.schedule_only.hit_by.length > 0 ? tr("hitBefore") : tr("noProblem")}
                  </td>
                </tr>
              ))}
              {trips.length === 0 && <tr><td colSpan={4} className="px-3 py-4 text-on-surface-variant">{tr("noDiff")}</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="text-caption text-outline">
          {tr("truth1")} <code>data/scenarios/demo.json</code> {tr("truth2")} <Link href="/transparency" className="font-semibold text-primary">{tr("howDecided")}</Link>
        </p>
      </section>
    </main>
  );
}

function differs(x: EvalTrip): boolean {
  return x.replans.length > 0 || x.schedule_only.extra_min > 0 || x.travelbuddy.extra_min > 0;
}

function Side({ s, deadline }: { s: EvalTrip["schedule_only"]; deadline: string | null }) {
  const tr = useT(M);
  return (
    <td className="px-3 py-2.5">
      <span className="font-semibold">{s.route}</span>
      <span className="block">
        {tr("planned", { time: s.planned_arrive })} → <b className={s.late ? "text-error" : s.extra_min ? "text-tertiary" : "text-primary"}>{tr("really", { time: s.real_arrive })}</b>
        {s.late && deadline ? <span className="ml-1 rounded bg-error-container px-1 text-micro font-bold text-on-error-container">{tr("late")}</span> : null}
      </span>
      <span className="block text-caption text-on-surface-variant">
        ₹{s.cost_inr} · {tr("walk", { min: s.walk_min })}{s.hit_by.length ? ` · ${tr("hitBy", { list: s.hit_by.map((h) => `${h.event} (+${h.extra_min})`).join(", ") })}` : ""}
      </span>
    </td>
  );
}

function Stat({ icon, label, base, tb, better, note }: { icon: string; label: string; base: string; tb: string; better: boolean; note?: string }) {
  const tr = useT(M);
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-container-lowest p-4 shadow-sm">
      <span className="flex items-center gap-1 text-caption font-bold uppercase tracking-wider text-on-surface-variant"><Icon name={icon} className="text-[16px] text-primary" /> {label}</span>
      <div className="flex items-end justify-between gap-2">
        <div>
          <span className="block text-micro font-bold uppercase text-outline">{tr("normalApp")}</span>
          <span className="text-xl font-bold text-on-surface-variant">{base}</span>
        </div>
        <Icon name="arrow_forward" className="text-outline" />
        <div className="text-right">
          <span className="block text-micro font-bold uppercase text-primary">TravelBuddy</span>
          <span className={`text-2xl font-bold ${better ? "text-primary" : "text-error"}`}>{tb}</span>
        </div>
      </div>
      {note && <span className="text-caption text-on-surface-variant">{note}</span>}
    </div>
  );
}
