"use client";

// Transparency (B10, PS requirement): every source, weight, threshold, lifetime and assumption
// TravelBuddy uses, plus the live event log with each verdict explained and the replan decisions.
// Data: GET /transparency — the same numbers the code runs on (verify/policy.py).

import Link from "next/link";
import { useEffect, useState } from "react";
import { getTransparency, type Transparency } from "@/lib/api";
import { pct, STATUS_STYLE, TYPE_LABEL } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { COMMON } from "@/lib/i18n/common";
import { M } from "@/lib/i18n/messages/TransparencyView";
import Icon from "./Icon";

const ROUTE_KEYS = ["baseline", "aware", "replan"] as const;
type RouteKey = (typeof ROUTE_KEYS)[number];
const KIND_KEYS = ["proposed", "accepted", "rejected", "notice"] as const;
type KindKey = (typeof KIND_KEYS)[number];

const SOURCE_ICON: Record<string, string> = { crowd: "groups", news: "newspaper", official: "verified", weather: "rainy" };

export default function TransparencyView() {
  const [t, setT] = useState<Transparency | null>(null);
  const [error, setError] = useState(false);
  const tr = useT(M);
  const tc = useT(COMMON);

  useEffect(() => {
    let alive = true;
    const load = () => getTransparency().then((x) => { if (alive) { setT(x); setError(false); } }).catch(() => alive && setError(true));
    load();
    const id = setInterval(load, 10000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  if (error && !t) return <main className="px-6 py-10 text-sm text-on-surface-variant">{tr("offline")}</main>;
  if (!t) return <main className="px-6 py-10 text-sm text-on-surface-variant">{tc("loading")}</main>;

  const p = t.policy as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const thresholds = p.thresholds ?? { confirmed: p.confirmed_at, possible: p.possible_at };
  const lifetimes: Record<string, number | null> = p.lifetime_min ?? p.lifetimes ?? {};
  const anti = p.anti_gaming ?? {};

  return (
    <main className="flex w-full flex-col gap-4 px-4 pb-16 pt-4 md:px-6">
      <header className="flex flex-col gap-1">
        <span className="flex items-center gap-1 text-caption font-bold uppercase tracking-wider text-primary"><Icon name="visibility" className="text-[16px]" /> {tr("eyebrow")}</span>
        <h1 className="text-2xl font-semibold">{tr("title")}</h1>
        <p className="max-w-3xl text-sm text-on-surface-variant">
          {tr("intro")} <b>{t.as_of}</b>.
        </p>
      </header>

      {/* ---- Sources ---- */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {t.sources.map((s) => (
          <div key={s.id} className="flex flex-col gap-2 rounded-2xl bg-container-lowest p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 font-semibold"><Icon name={SOURCE_ICON[s.id] ?? "info"} className="text-primary" /> {s.name}</span>
              <span className="rounded-md bg-primary-fixed px-2 py-0.5 font-mono text-caption font-bold text-on-primary-fixed">{tr("sourceWeight", { w: s.weight })}</span>
            </div>
            <p className="text-small text-on-surface-variant">{s.how}</p>
            <p className="mt-auto flex flex-wrap items-center gap-1 text-caption">
              <span className="rounded bg-container px-1.5 py-0.5 font-semibold">{s.data}</span>
              <span className={`rounded px-1.5 py-0.5 font-bold uppercase ${s.mode === "live" || s.mode.startsWith("live") ? "bg-primary-soft text-primary-ink" : "bg-amber-soft text-amber-ink"}`}>{s.mode}</span>
            </p>
          </div>
        ))}
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
        {/* ---- Rules ---- */}
        <section className="flex flex-col gap-3 rounded-2xl bg-container-lowest p-5 shadow-sm">
          <h2 className="flex items-center gap-2 font-semibold"><Icon name="rule" className="text-primary" /> {tr("rules")}</h2>
          <p className="rounded-xl bg-container-low p-3 font-mono text-caption">{t.formula}</p>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Threshold label={tc("status.ignored")} value={tr("under", { n: Math.round((thresholds.possible ?? 0.4) * 100) })} cls="bg-container-high" />
            <Threshold label={tc("status.possible")} value={`${Math.round((thresholds.possible ?? 0.4) * 100)}–${Math.round((thresholds.confirmed ?? 0.7) * 100) - 1}%`} cls="bg-tertiary-fixed text-tertiary" />
            <Threshold label={tc("status.confirmed")} value={tr("orMore", { n: Math.round((thresholds.confirmed ?? 0.7) * 100) })} cls="bg-error-container text-on-error-container" />
          </div>
          <h3 className="mt-1 text-small font-bold uppercase tracking-wider text-on-surface-variant">{tr("antiGaming")}</h3>
          <ul className="flex flex-col gap-1 text-small">
            <li className="flex gap-2"><Icon name="person_off" className="text-[18px] text-error" /> {tr("anti1", { days: anti.new_account_max_age_days ?? 1, rep: anti.low_reputation ?? 0.2, w: anti.untrusted_weight ?? 0.05 })}</li>
            <li className="flex gap-2"><Icon name="content_copy" className="text-[18px] text-error" /> {tr("anti2", { n: anti.burst?.min_reports ?? 3, min: anti.burst?.window_min ?? 10, w: anti.burst?.weight ?? 0.05 })}</li>
            <li className="flex gap-2"><Icon name="repeat_one" className="text-[18px] text-error" /> {tr("anti3")}</li>
            <li className="flex gap-2"><Icon name="gavel" className="text-[18px] text-primary" /> {tr("anti4")}</li>
          </ul>
          <h3 className="mt-1 text-small font-bold uppercase tracking-wider text-on-surface-variant">{tr("lifetimes")}</h3>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(lifetimes).map(([type, min]) => (
              <span key={type} className="rounded-lg bg-container-low px-2 py-1 text-caption">
                <b>{TYPE_LABEL[type] ?? type}</b> {min == null ? tr("untilEnd") : min >= 60 ? tr("hours", { n: min / 60 }) : `${min} ${tc("min")}`}
              </span>
            ))}
          </div>
        </section>

        {/* ---- Routing, AI, assumptions ---- */}
        <section className="flex flex-col gap-3 rounded-2xl bg-container-lowest p-5 shadow-sm">
          <h2 className="flex items-center gap-2 font-semibold"><Icon name="alt_route" className="text-primary" /> {tr("routingAi")}</h2>
          <ul className="flex flex-col gap-2 text-small">
            {Object.entries(t.routing).map(([k, v]) => (
              <li key={k} className="rounded-xl bg-container-low p-2.5"><b className="capitalize">{(ROUTE_KEYS as readonly string[]).includes(k) ? tr(`route.${k as RouteKey}`) : k}:</b> {v}</li>
            ))}
            <li className="rounded-xl bg-container-low p-2.5"><b>{tr("chatAssistant")}</b> {t.ai.chatbot} ({t.ai.model}). {t.ai.number_check ? tr("numberCheck") : ""} {t.ai.fallback}</li>
          </ul>
          <h3 className="mt-1 text-small font-bold uppercase tracking-wider text-on-surface-variant">{tr("assumptions")}</h3>
          <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-small text-on-surface-variant">
            {t.assumptions.map((a) => <li key={a}>{a}</li>)}
          </ol>
          <p className="text-caption text-outline">
            {tr("network", { stations: t.data.stations, lines: t.data.lines, transfers: t.data.transfers, pois: t.data.pois, reporters: t.data.reporters })}
          </p>
        </section>
      </div>

      {/* ---- Event log ---- */}
      <section className="flex flex-col gap-3 rounded-2xl bg-container-lowest p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-semibold"><Icon name="list_alt" className="text-primary" /> {tr("eventLog", { n: t.event_log.length })}</h2>
          <span className="text-caption text-on-surface-variant">{tr("nothingHidden")}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-small">
            <thead className="bg-container-low eyebrow">
              <tr><th className="px-3 py-2">{tr("colProblem")}</th><th className="px-3 py-2">{tr("colVerdict")}</th><th className="px-3 py-2">{tr("colWhy")}</th><th className="px-3 py-2">{tr("colSeen")}</th><th className="px-3 py-2">{tr("colExpires")}</th></tr>
            </thead>
            <tbody className="divide-y divide-hairline-soft">
              {t.event_log.map((e) => (
                <tr key={e.event_id} className="hover:bg-container-low">
                  <td className="px-3 py-2">
                    <Link href={`/events/${e.event_id}`} className="font-semibold text-primary hover:underline">{e.event_id}</Link>
                    <span className="block text-on-surface-variant">{TYPE_LABEL[e.type] ?? e.type}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="rounded-md px-2 py-0.5 text-micro font-bold text-white" style={{ background: STATUS_STYLE[e.status].color }}>
                      {STATUS_STYLE[e.status].label} {pct(e.confidence)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-on-surface-variant">{e.summary}</td>
                  <td className="px-3 py-2 font-mono tabular-nums">{e.first_seen}–{e.last_seen}</td>
                  <td className="px-3 py-2 font-mono tabular-nums">{e.expires_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---- Decisions ---- */}
      <section className="flex flex-col gap-2 rounded-2xl bg-container-lowest p-5 shadow-sm">
        <h2 className="flex items-center gap-2 font-semibold"><Icon name="history" className="text-primary" /> {tr("decisions")}</h2>
        {t.decisions.length === 0 ? (
          <p className="text-small text-on-surface-variant">{tr("noDecisions")}</p>
        ) : (
          <ul className="flex flex-col gap-1.5 text-small">
            {t.decisions.map((d, i) => (
              <li key={i} className="flex flex-wrap items-start gap-2 rounded-lg bg-container-low p-2">
                <span className="font-mono font-bold">{d.at}</span>
                <span className={`rounded px-1.5 py-0.5 text-micro font-bold uppercase ${d.kind === "accepted" ? "bg-primary-fixed text-on-primary-fixed" : d.kind === "rejected" ? "bg-container-high" : "bg-tertiary-fixed text-tertiary"}`}>{(KIND_KEYS as readonly string[]).includes(d.kind) ? tr(`kind.${d.kind as KindKey}`) : d.kind}</span>
                <span className="min-w-0 flex-1">{d.traveller}: {d.detail}</span>
              </li>
            ))}
          </ul>
        )}
        <Link href="/compare" className="self-start text-small font-semibold text-primary hover:underline">{tr("seeEval")}</Link>
      </section>
    </main>
  );
}

function Threshold({ label, value, cls }: { label: string; value: string; cls: string }) {
  return (
    <div className={`flex flex-col rounded-xl p-2 ${cls}`}>
      <span className="text-micro font-bold uppercase">{label}</span>
      <span className="text-lg font-bold">{value}</span>
    </div>
  );
}
