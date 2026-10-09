"use client";

// Disruption detail: WHY Pakka Check trusts (or doesn't trust) one problem. Every piece of
// evidence with its source, time, weight and note; the confidence maths; thresholds; expiry.
// Data: GET /events/{id} (re-scored at the demo clock, refreshes every 5 s).

import Link from "next/link";
import { useEffect, useState } from "react";
import { type EventDetail as Detail, getEventDetail } from "@/lib/api";
import { eventPosition, eventTitle, pct, STATUS_STYLE, TYPE_LABEL } from "@/lib/format";
import Icon from "./Icon";
import MapView from "./MapView";

const SOURCE: Record<string, { icon: string; label: string; cls: string }> = {
  official: { icon: "verified", label: "Official notice", cls: "bg-primary-fixed text-on-primary-fixed" },
  news: { icon: "newspaper", label: "News", cls: "bg-secondary-container text-on-secondary-container" },
  crowd: { icon: "person", label: "Commuter", cls: "bg-tertiary-fixed text-tertiary" },
  weather: { icon: "rainy", label: "Weather", cls: "bg-container-high text-on-surface-variant" },
};

export default function EventDetail({ id }: { id: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      getEventDetail(id)
        .then((d) => { if (alive) { setDetail(d); setError(null); } })
        .catch((e: Error) => alive && setError(e.message.includes("404") ? "not_found" : "offline"));
    load();
    const t = setInterval(load, 5000);
    return () => { alive = false; clearInterval(t); };
  }, [id]);

  if (error === "not_found") return <Empty text="This problem isn't known at the current demo time (not reported yet, or the demo was reset)." />;
  if (error === "offline") return <Empty text="Can't reach the TravelBuddy server — start the backend on port 8000." />;
  if (!detail) return <main className="px-6 py-10 text-sm text-on-surface-variant">Loading…</main>;

  const { event: ev, breakdown: b } = detail;
  const style = STATUS_STYLE[ev.status];
  const pos = eventPosition(ev);
  const supporting = b.evidence.filter((e) => !e.contradicts);
  const against = b.evidence.filter((e) => e.contradicts);
  const confPct = Math.round(ev.confidence * 100);

  return (
    <main className="flex w-full flex-col gap-4 px-4 pb-16 pt-4 md:px-6">
      <nav className="flex items-center gap-1 text-small text-on-surface-variant">
        <Link href="/report" className="hover:text-primary">Live reports</Link>
        <Icon name="chevron_right" className="text-[16px]" />
        <span className="font-semibold text-on-surface">{ev.event_id}</span>
      </nav>

      {/* ---- Verdict ---- */}
      <section className="flex flex-col gap-4 rounded-2xl bg-container-lowest p-5 shadow-sm lg:flex-row lg:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full px-2.5 py-1 text-caption font-bold text-white" style={{ background: style.color }}>{style.label}</span>
            <span className="rounded-full bg-container px-2.5 py-1 text-caption font-bold">{TYPE_LABEL[ev.type] ?? ev.type} · {ev.severity}</span>
            {ev.flags.map((f) => (
              <span key={f} className="rounded-full bg-error-container px-2.5 py-1 text-caption font-bold text-on-error-container">{f.replace(/_/g, " ")}</span>
            ))}
          </div>
          <h1 className="mt-2 text-2xl font-semibold">{eventTitle(ev)}</h1>
          <p className="mt-1 text-sm text-on-surface-variant">{b.summary}</p>
          <p className="mt-1 text-small text-on-surface-variant">
            First seen {ev.first_seen} · last report {ev.last_seen} · {ev.status === "expired" ? "expired" : `expires ${ev.expires_at}`}
            {ev.expected_delay_min ? ` · about +${ev.expected_delay_min} min for routes` : ""}
          </p>
        </div>
        <TrustGauge pct={confPct} color={style.color} />
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-12">
        {/* ---- Evidence ---- */}
        <section className="flex flex-col gap-3 rounded-2xl bg-container-lowest p-5 shadow-sm lg:col-span-7">
          <h2 className="flex items-center gap-2 font-semibold"><Icon name="fact_check" className="text-primary" /> Evidence ({b.evidence.length})</h2>
          <ul className="flex flex-col gap-2">
            {[...supporting, ...against].map((e) => {
              const s = SOURCE[e.source_type] ?? SOURCE.crowd;
              return (
                <li key={`${e.ref_id}-${e.at}`} className={`flex flex-col gap-1 rounded-xl p-3 ${e.contradicts ? "bg-primary-soft/50" : "bg-container-low"}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-micro font-bold ${s.cls}`}>
                      <Icon name={s.icon} className="text-[14px]" /> {s.label}
                    </span>
                    <span className="font-mono text-caption text-on-surface-variant">{e.ref_id}{e.reporter_id ? ` · ${e.reporter_id}` : ""} · {e.at}</span>
                    {e.contradicts && <span className="rounded-md bg-primary px-2 py-0.5 text-micro font-bold text-on-primary">says it&apos;s running normally</span>}
                    <span className="ml-auto rounded-md bg-container-lowest px-2 py-0.5 font-mono text-caption font-bold">weight {e.weight.toFixed(2)}</span>
                  </div>
                  <p className="text-small">“{e.text}”</p>
                  {(e.note || e.covers.length > 1) && (
                    <p className="flex items-center gap-1 text-caption text-on-surface-variant">
                      <Icon name="info" className="text-[14px]" />
                      {e.note}{e.covers.length > 1 ? ` · stands for ${e.covers.length} reports (${e.covers.join(", ")})` : ""}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {/* ---- Maths + map ---- */}
        <div className="flex flex-col gap-4 lg:col-span-5">
          <section className="flex flex-col gap-2 rounded-2xl bg-container-lowest p-5 shadow-sm">
            <h2 className="flex items-center gap-2 font-semibold"><Icon name="calculate" className="text-primary" /> How the {confPct}% is worked out</h2>
            <Row label="Support from sources" value={pct(b.support)} hint="1 − Π(1 − weight × freshness)" />
            <Row label="Freshness" value={pct(b.decay)} hint="100% for 15 min after the last report, then fades" />
            <Row label="Contradiction" value={pct(b.contradiction)} hint="only from a more trusted source" />
            <Row label="Confidence" value={`${confPct}%`} hint="support × (1 − contradiction)" strong />
            <div className="mt-2 flex h-3 w-full overflow-hidden rounded-full bg-container-high" aria-label="Thresholds">
              <span className="h-full bg-container-highest" style={{ width: "40%" }} title="Ignored below 40%" />
              <span className="h-full bg-tertiary-fixed" style={{ width: "30%" }} title="Possible 40–69%" />
              <span className="h-full bg-error-container" style={{ width: "30%" }} title="Confirmed from 70%" />
            </div>
            <div className="relative h-4 text-micro font-bold text-on-surface-variant">
              <span className="absolute left-0">0</span><span className="absolute left-[40%] -translate-x-1/2">40 possible</span>
              <span className="absolute left-[70%] -translate-x-1/2">70 confirmed</span><span className="absolute right-0">100</span>
              <span className="absolute -top-6 h-5 w-0.5 bg-on-surface" style={{ left: `${Math.min(99, confPct)}%` }} />
            </div>
            <p className="text-caption text-on-surface-variant">
              Only <b>confirmed</b> problems change routes. <b>Possible</b> ones lower a route&apos;s reliability. Below 40% they&apos;re ignored.{" "}
              <Link href="/transparency" className="font-semibold text-primary">All rules →</Link>
            </p>
          </section>
          {pos && (
            <div className="h-72 overflow-hidden rounded-2xl bg-container-lowest shadow-sm">
              <MapView events={[ev]} origin={{ label: eventTitle(ev), lat: pos[0], lon: pos[1] }} />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function Row({ label, value, hint, strong = false }: { label: string; value: string; hint: string; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 ${strong ? "bg-primary-soft" : "bg-container-low"}`}>
      <span className="min-w-0">
        <span className={`block text-small ${strong ? "font-bold" : "font-semibold"}`}>{label}</span>
        <span className="block text-micro text-on-surface-variant">{hint}</span>
      </span>
      <span className={`font-mono tabular-nums ${strong ? "text-lg font-bold text-primary" : "font-semibold"}`}>{value}</span>
    </div>
  );
}

function TrustGauge({ pct: p, color }: { pct: number; color: string }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid h-28 w-28 shrink-0 place-items-center" aria-label={`Trust ${p}%`}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--surface-container-high)" strokeWidth="10" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${(c * p) / 100} ${c}`} />
      </svg>
      <div className="text-center">
        <span className="block text-2xl font-bold">{p}%</span>
        <span className="text-micro font-bold uppercase text-on-surface-variant">trust</span>
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <main className="flex w-full flex-col items-center px-4 py-16">
      <div className="flex max-w-md flex-col items-center gap-3 rounded-2xl bg-container-lowest p-8 text-center shadow-sm">
        <Icon name="search_off" className="text-[36px] text-outline" />
        <p className="text-sm text-on-surface-variant">{text}</p>
        <Link href="/report" className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary">See live reports</Link>
      </div>
    </main>
  );
}
