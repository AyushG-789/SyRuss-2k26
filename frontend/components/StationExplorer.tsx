"use client";

// Station Explorer & Nearby — built from the team's design (stitch: mobilink_web_station_explorer_nearby).
// Frontend only: station cards, gates and facilities are sample data from lib/mockStations.ts.
// The filter chips filter the cards; searching a covered station recentres the map on it.

import Link from "next/link";
import { useEffect, useState } from "react";
import { facilities, filters, gates, hub, type Kind, mapLayers, skywalk, stationCards, type Station } from "@/lib/mockStations";
import { findPlace } from "@/lib/places";
import type { Place } from "@/lib/types";
import Icon from "./Icon";
import MapView from "./MapView";

const CROWD = {
  ok: "bg-primary-fixed text-on-primary-fixed",
  warn: "bg-tertiary-fixed text-[#2f1500]",
  neutral: "bg-container-high text-on-surface-variant",
} as const;
const DOT = { ok: "bg-primary", warn: "bg-tertiary", neutral: "bg-outline" } as const;

export default function StationExplorer() {
  const [filter, setFilter] = useState<Kind | "all">("all");
  const [radius, setRadius] = useState(hub.defaultRadius);
  const [layer, setLayer] = useState(mapLayers[0]);
  const [query, setQuery] = useState(hub.search);
  const [center, setCenter] = useState<Place>(hub.center);
  const [notFound, setNotFound] = useState(false);
  const clock = useClock();

  const shown = stationCards.filter((s) => filter === "all" || s.kinds.includes(filter));

  function search(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    const place = findPlace(q) ?? findPlace(`${q} station`);
    if (place) {
      setCenter(place);
      setNotFound(false);
    } else {
      setNotFound(q !== hub.search);
    }
  }

  return (
    <main className="flex w-full flex-col px-4 pb-6 pt-4 md:px-6">
      {/* ---- Breadcrumb + status ---- */}
      <section className="mb-5 flex w-full flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1 text-xs font-semibold text-on-surface-variant">
            {hub.breadcrumb.map((b, i) => (
              <span key={b} className="flex items-center gap-1">
                {i > 0 && <Icon name="chevron_right" className="text-[14px] text-outline" />}
                <span className={i === hub.breadcrumb.length - 1 ? "font-bold text-primary" : ""}>{b}</span>
              </span>
            ))}
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 rounded-full bg-primary-fixed px-2 py-1 text-[11px] font-bold text-on-primary-fixed">
              <span className="h-1.5 w-1.5 animate-ping rounded-full bg-primary" /> {hub.feeds}
            </div>
            <div className="text-[13px] text-on-surface-variant">
              Updated: <span className="font-semibold text-on-surface tabular-nums">{clock ?? "--:--:--"} IST</span>
            </div>
          </div>
        </div>

        {/* Search + radius */}
        <div className="flex w-full flex-col justify-between gap-4 rounded-xl bg-container-lowest p-4 shadow-sm xl:flex-row xl:items-center">
          <form onSubmit={search} className="relative min-w-0 max-w-xl flex-1">
            <Icon name="travel_explore" className="absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-primary" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search station"
              placeholder="Search station, platform, exit gate or bus route..."
              className="h-12 w-full rounded-lg bg-container-low pl-10 pr-24 text-sm placeholder:text-outline transition-all focus:bg-container-lowest focus:outline-none focus:ring-2 focus:ring-primary" />
            <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 rounded bg-primary px-2 py-1 text-[11px] font-bold text-on-primary transition-colors hover:bg-primary-container">
              Search
            </button>
            {notFound && <p className="mt-1 text-[12px] text-error">Not in the covered network — try a station name like “Dadar”.</p>}
          </form>
          <div className="flex flex-wrap items-center gap-4 rounded-xl bg-container-low px-4 py-2">
            <div className="flex items-center gap-1">
              <Icon name="radar" className="text-[18px] text-primary" />
              <span className="text-xs font-semibold">Radius:</span>
              <span className="text-xs font-bold text-primary">{radius.replace("km", " km")}</span>
            </div>
            <div className="flex items-center gap-1.5">
              {hub.radii.map((r) => (
                <button key={r} type="button" onClick={() => setRadius(r)} aria-pressed={radius === r}
                  className={`rounded px-2.5 py-1 text-[11px] font-bold transition-all ${radius === r ? "bg-primary text-on-primary shadow-sm" : "text-on-surface-variant hover:bg-container-high"}`}>
                  {r}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Mode chips */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {filters.map((f) => {
            const on = filter === f.id;
            return (
              <button key={f.id} type="button" onClick={() => setFilter(f.id)} aria-pressed={on}
                className={`flex shrink-0 items-center gap-1 rounded-full px-4 py-2 text-xs font-semibold shadow-sm ${on ? "bg-primary text-on-primary" : "bg-container-lowest hover:bg-container"}`}>
                <Icon name={f.icon} className={`text-[18px] ${on ? "" : f.iconCls}`} />
                <span>{f.label}</span>
                <span className={`rounded-full px-1.5 text-[11px] font-bold ${on ? "bg-white/20" : "bg-container-high text-on-surface-variant"}`}>{f.count}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ---- Two columns ---- */}
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-4">
          {shown.map((s) => <StationCard key={s.id} station={s} />)}
          {shown.length === 0 && <p className="rounded-xl bg-container-lowest p-5 text-sm text-on-surface-variant shadow-sm">No stations of this type nearby.</p>}
        </div>

        <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-20">
          {/* Map + gates */}
          <div className="flex flex-col overflow-hidden rounded-xl bg-container-lowest shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-1 bg-container-low p-4">
              <div className="flex items-center gap-1">
                <Icon name="map" className="text-[20px] text-primary" />
                <span className="text-sm font-bold">Andheri Hub Schematic &amp; Live Wayfinding</span>
              </div>
              <div className="flex items-center gap-1 rounded-lg bg-container-lowest p-1">
                {mapLayers.map((l) => (
                  <button key={l} type="button" onClick={() => setLayer(l)} aria-pressed={layer === l}
                    className={`rounded px-2 py-1 text-[11px] font-bold transition-all ${layer === l ? "bg-primary text-on-primary shadow-sm" : "text-on-surface-variant hover:bg-container"}`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div className="relative h-80 w-full bg-container">
              <MapView showNetwork origin={center} here={[hub.you.lat, hub.you.lon]} />
              <div className="pointer-events-none absolute inset-x-4 top-4 z-[500] flex justify-center">
                <div className="flex items-center gap-2 rounded-lg bg-container-lowest/95 px-3 py-1.5 shadow-md backdrop-blur-md">
                  <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-primary" />
                  <span className="text-[11px] font-bold">{skywalk}</span>
                </div>
              </div>
              <div className="absolute inset-x-4 bottom-4 z-[500] flex items-center justify-between gap-2 rounded-xl bg-[#2d3133]/85 px-4 py-2 text-[13px] text-[#eff1f3] shadow-xl backdrop-blur-md">
                <div className="flex items-center gap-2">
                  <Icon name="navigation" className="text-[18px] text-primary-fixed-dim" />
                  <span>Your Location: <strong>{hub.you.text}</strong> {hub.you.dist}</span>
                </div>
                <span className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-primary-fixed-dim">{hub.you.walk}</span>
              </div>
            </div>
            <div className="flex flex-col gap-4 p-5">
              <div className="flex items-center justify-between">
                <span className="text-lg font-bold">Station Gate Guide &amp; Key Portals</span>
                <span className="text-[11px] font-semibold text-primary">{gates.length} Exits Active</span>
              </div>
              <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                {gates.map((g) => (
                  <div key={g.gate} className="flex cursor-pointer flex-col gap-1 rounded-lg bg-container-low p-2 transition-colors hover:bg-container-high">
                    <div className="flex items-center justify-between">
                      <span className="rounded bg-primary px-1.5 py-0.5 text-[11px] font-bold text-on-primary">{g.gate}</span>
                      <Icon name={g.icon} className={`text-[16px] ${g.iconCls}`} />
                    </div>
                    <div className="text-xs font-bold">{g.title}</div>
                    <div className="truncate text-[13px] text-on-surface-variant">{g.text}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Facilities */}
          <div className="flex flex-col gap-4 rounded-xl bg-container-lowest p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <Icon name="room_preferences" className="text-[20px] text-primary" />
                <span className="text-lg font-bold">Live Hub Facilities Status</span>
              </div>
              <span className="rounded-full bg-primary-fixed px-2 py-0.5 text-[11px] font-bold text-on-primary-fixed">All Operational</span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {facilities.map((f) => (
                <div key={f.title} className="flex items-start gap-2 rounded-lg bg-container-low p-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-primary/10 text-primary">
                    <Icon name={f.icon} className="text-[18px]" />
                  </div>
                  <div>
                    <div className="text-xs font-bold">{f.title}</div>
                    <div className="text-[13px] text-on-surface-variant">{f.text}</div>
                    <div className="mt-1 text-[11px] font-bold text-primary">{f.foot}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between gap-2 pt-2">
              <Link href={`/plan?from=${encodeURIComponent(center.label)}`}
                className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-on-primary shadow-sm transition-all hover:bg-primary-container">
                <Icon name="directions" className="text-[18px]" /> Get Turn-by-Turn Indoor Walking Route
              </Link>
              <button type="button" aria-label="Share" className="flex items-center justify-center rounded-xl bg-container-high p-3 transition-colors hover:bg-container-highest">
                <Icon name="share" className="text-[20px]" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

/** Wall-clock time, rendered only after mount so server and browser HTML match. */
function useClock(): string | null {
  const [now, setNow] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date().toTimeString().split(" ")[0]);
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, []);
  return now;
}

function StationCard({ station: s }: { station: Station }) {
  return (
    <article className="flex flex-col gap-4 rounded-xl bg-container-lowest p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${s.iconBox}`}>
            <Icon name={s.icon} className="text-[22px]" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-lg font-bold">{s.name}</span>
              <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${s.tagCls}`}>{s.tag}</span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[13px] text-on-surface-variant">
              {s.sub.map((x, i) => (
                <span key={x.text} className="flex items-center gap-2">
                  {i > 0 && <span>•</span>}
                  <span className={`flex items-center gap-1 ${x.cls ?? ""}`}>{x.dot && <span className="h-2 w-2 rounded-full bg-primary" />}{x.text}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <span className="text-[11px] font-bold uppercase text-on-surface-variant">Walking</span>
          <div className="text-sm font-bold">{s.walk}</div>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        {s.departures.map((d) => (
          <div key={d.code + d.title} className="flex items-center justify-between gap-2 rounded-lg bg-container-low p-2 transition-colors hover:bg-container">
            <div className="flex min-w-0 items-center gap-2">
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded text-xs font-bold ${s.codeCls}`}>{d.code}</div>
              <div className="flex min-w-0 flex-col">
                <div className="truncate text-sm font-semibold">{d.title}</div>
                <div className="flex flex-wrap items-center gap-1 text-[13px] text-on-surface-variant">
                  {d.meta.map((m, i) => (
                    <span key={m.text} className="flex items-center gap-1">{i > 0 && <span>•</span>}<span className={m.cls}>{m.text}</span></span>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-4">
              <span className={`hidden items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold sm:flex ${CROWD[d.crowd.tone]}`}>
                {d.crowd.dot && <span className={`h-1.5 w-1.5 rounded-full ${DOT[d.crowd.tone]}`} />}{d.crowd.text}
              </span>
              <div className="min-w-[70px] text-right">
                <div className={`text-lg font-extrabold leading-none ${d.etaPrimary ? "text-primary" : ""}`}>{d.eta}</div>
                <div className="text-[11px] font-bold text-on-surface-variant">{d.then}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {s.amenities.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 pt-1">
          {s.amenities.map((a) => (
            <span key={a.text} className="flex items-center gap-1 rounded bg-container px-2 py-1 text-[11px] font-bold text-on-surface-variant">
              <Icon name={a.icon} className={`text-[14px] ${a.iconCls}`} /> {a.text}
            </span>
          ))}
        </div>
      )}

      {s.auto && (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-container p-2">
          <div className="flex items-center gap-1">
            <Icon name="electric_rickshaw" className="text-[20px] text-primary" />
            <div>
              <div className="text-xs font-semibold">{s.auto.title}</div>
              <div className="text-[13px] text-on-surface-variant">{s.auto.text}</div>
            </div>
          </div>
          <span className="shrink-0 rounded bg-container-lowest px-2 py-1 text-[11px] font-bold text-primary shadow-sm">{s.auto.badge}</span>
        </div>
      )}
    </article>
  );
}
