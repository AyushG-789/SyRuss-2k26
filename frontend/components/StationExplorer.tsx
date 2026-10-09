"use client";

// Station Explorer & Nearby — built from the team's design (stitch: mobilink_web_station_explorer_nearby).
// Frontend only: station cards, gates and facilities are sample data from lib/mockStations.ts.
// The filter chips filter the cards; searching a covered station recentres the map on it.

import Link from "next/link";
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { M } from "@/lib/i18n/messages/StationExplorer";
import { facilities, filters, gates, hub, type Kind, mapLayers, skywalk, stationCards, type Station, type Txt } from "@/lib/mockStations";
import { findPlace } from "@/lib/places";
import type { Place } from "@/lib/types";
import Icon from "./Icon";
import MapView from "./MapView";

const CROWD = {
  ok: "bg-primary-fixed text-on-primary-fixed",
  warn: "bg-tertiary-fixed text-on-tertiary-fixed",
  neutral: "bg-container-high text-on-surface-variant",
} as const;
const DOT = { ok: "bg-primary", warn: "bg-tertiary", neutral: "bg-outline" } as const;

type T = ReturnType<typeof useT<keyof typeof M.en>>;
/** Show a sample-data text: a key, or a key with its numbers. */
function tx(t: T, x: Txt): string {
  return typeof x === "string" ? t(x) : t(x[0], x[1]);
}
const txtId = (x: Txt) => (typeof x === "string" ? x : `${x[0]}:${JSON.stringify(x[1])}`);

/** "1.5km" / "500m" → "1.5 km" / "500 m" in the active language. */
function radiusLabel(t: T, r: string): string {
  return r.endsWith("km") ? t("km", { n: r.slice(0, -2) }) : t("m", { n: r.replace(/m$/, "") });
}

export default function StationExplorer() {
  const t = useT(M);
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
                <span className={i === hub.breadcrumb.length - 1 ? "font-bold text-primary" : ""}>{t(b)}</span>
              </span>
            ))}
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 rounded-full bg-primary-fixed px-2 py-1 text-micro font-bold text-on-primary-fixed">
              <span className="h-1.5 w-1.5 animate-ping rounded-full bg-primary" /> {t(hub.feeds)}
            </div>
            <div className="text-small text-on-surface-variant">
              {t("updated")} <span className="font-semibold text-on-surface tabular-nums">{clock ?? "--:--:--"} IST</span>
            </div>
          </div>
        </div>

        {/* Search + radius */}
        <div className="flex w-full flex-col justify-between gap-4 rounded-xl bg-container-lowest p-4 shadow-sm xl:flex-row xl:items-center">
          <form onSubmit={search} className="relative min-w-0 max-w-xl flex-1">
            <Icon name="travel_explore" className="absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-primary" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t("searchAria")}
              placeholder={t("searchPlaceholder")}
              className="h-12 w-full rounded-lg bg-container-low pl-10 pr-24 text-sm placeholder:text-outline transition-all focus:bg-container-lowest focus:outline-none focus:ring-2 focus:ring-primary" />
            <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 rounded bg-primary px-2 py-1 text-micro font-bold text-on-primary transition-colors hover:bg-primary-container">
              {t("search")}
            </button>
            {notFound && <p className="mt-1 text-caption text-error">{t("notFound")}</p>}
          </form>
          <div className="flex flex-wrap items-center gap-4 rounded-xl bg-container-low px-4 py-2">
            <div className="flex items-center gap-1">
              <Icon name="radar" className="text-[18px] text-primary" />
              <span className="text-xs font-semibold">{t("radius")}</span>
              <span className="text-xs font-bold text-primary">{radiusLabel(t, radius)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {hub.radii.map((r) => (
                <button key={r} type="button" onClick={() => setRadius(r)} aria-pressed={radius === r}
                  className={`rounded px-2.5 py-1 text-micro font-bold transition-all ${radius === r ? "bg-primary text-on-primary shadow-sm" : "text-on-surface-variant hover:bg-container-high"}`}>
                  {radiusLabel(t, r)}
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
                <span>{t(f.label)}</span>
                <span className={`rounded-full px-1.5 text-micro font-bold ${on ? "bg-on-primary/20" : "bg-container-high text-on-surface-variant"}`}>{f.count}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ---- Two columns ---- */}
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-4">
          {shown.map((s) => <StationCard key={s.id} station={s} />)}
          {shown.length === 0 && <p className="rounded-xl bg-container-lowest p-5 text-sm text-on-surface-variant shadow-sm">{t("noStations")}</p>}
        </div>

        <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-20">
          {/* Map + gates */}
          <div className="flex flex-col overflow-hidden rounded-xl bg-container-lowest shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-1 bg-container-low p-4">
              <div className="flex items-center gap-1">
                <Icon name="map" className="text-[20px] text-primary" />
                <span className="text-sm font-bold">{t("schematicTitle")}</span>
              </div>
              <div className="flex items-center gap-1 rounded-lg bg-container-lowest p-1">
                {mapLayers.map((l) => (
                  <button key={l} type="button" onClick={() => setLayer(l)} aria-pressed={layer === l}
                    className={`rounded px-2 py-1 text-micro font-bold transition-all ${layer === l ? "bg-primary text-on-primary shadow-sm" : "text-on-surface-variant hover:bg-container"}`}>
                    {t(l)}
                  </button>
                ))}
              </div>
            </div>
            <div className="relative h-80 w-full bg-container">
              <MapView showNetwork origin={center} here={[hub.you.lat, hub.you.lon]} />
              <div className="pointer-events-none absolute inset-x-4 top-4 z-[500] flex justify-center">
                <div className="flex items-center gap-2 rounded-lg bg-container-lowest/95 px-3 py-1.5 shadow-md backdrop-blur-md">
                  <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-primary" />
                  <span className="text-micro font-bold">{t(skywalk)}</span>
                </div>
              </div>
              <div className="absolute inset-x-4 bottom-4 z-[500] flex items-center justify-between gap-2 rounded-xl bg-inverse-surface/90 px-4 py-2 text-small text-inverse-on-surface shadow-xl backdrop-blur-md">
                <div className="flex items-center gap-2">
                  <Icon name="navigation" className="text-[18px] text-primary-fixed-dim" />
                  <span>{t("yourLocation")} <strong>{hub.you.text}</strong> {t(hub.you.dist)}</span>
                </div>
                <span className="shrink-0 eyebrow text-primary-fixed-dim">{tx(t, hub.you.walk)}</span>
              </div>
            </div>
            <div className="flex flex-col gap-4 p-5">
              <div className="flex items-center justify-between">
                <span className="text-lg font-bold">{t("gatesTitle")}</span>
                <span className="text-micro font-semibold text-primary">{t("exitsActive", { n: gates.length })}</span>
              </div>
              <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                {gates.map((g) => (
                  <div key={g.gate} className="flex cursor-pointer flex-col gap-1 rounded-lg bg-container-low p-2 transition-colors hover:bg-container-high">
                    <div className="flex items-center justify-between">
                      <span className="rounded bg-primary px-1.5 py-0.5 text-micro font-bold text-on-primary">{t("gate", { n: g.gate })}</span>
                      <Icon name={g.icon} className={`text-[16px] ${g.iconCls}`} />
                    </div>
                    <div className="text-xs font-bold">{t(g.title)}</div>
                    <div className="truncate text-small text-on-surface-variant">{t(g.text)}</div>
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
                <span className="text-lg font-bold">{t("facilitiesTitle")}</span>
              </div>
              <span className="rounded-full bg-primary-fixed px-2 py-0.5 text-micro font-bold text-on-primary-fixed">{t("allOperational")}</span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {facilities.map((f) => (
                <div key={f.title} className="flex items-start gap-2 rounded-lg bg-container-low p-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-primary/10 text-primary">
                    <Icon name={f.icon} className="text-[18px]" />
                  </div>
                  <div>
                    <div className="text-xs font-bold">{t(f.title)}</div>
                    <div className="text-small text-on-surface-variant">{t(f.text)}</div>
                    <div className="mt-1 text-micro font-bold text-primary">{tx(t, f.foot)}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between gap-2 pt-2">
              <Link href={`/plan?from=${encodeURIComponent(center.label)}`}
                className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-on-primary shadow-sm transition-all hover:bg-primary-container">
                <Icon name="directions" className="text-[18px]" /> {t("indoorRoute")}
              </Link>
              <button type="button" aria-label={t("shareAria")} className="flex items-center justify-center rounded-xl bg-container-high p-3 transition-colors hover:bg-container-highest">
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
  const t = useT(M);
  return (
    <article className="flex flex-col gap-4 rounded-xl bg-container-lowest p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${s.iconBox}`}>
            <Icon name={s.icon} className="text-[22px]" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-lg font-bold">{t(s.name)}</span>
              <span className={`rounded px-1.5 py-0.5 text-micro font-bold ${s.tagCls}`}>{t(s.tag)}</span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-small text-on-surface-variant">
              {s.sub.map((x, i) => (
                <span key={x.text} className="flex items-center gap-2">
                  {i > 0 && <span>•</span>}
                  <span className={`flex items-center gap-1 ${x.cls ?? ""}`}>{x.dot && <span className="h-2 w-2 rounded-full bg-primary" />}{t(x.text)}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <span className="text-micro font-bold uppercase text-on-surface-variant">{t("walking")}</span>
          <div className="text-sm font-bold">{tx(t, s.walk)}</div>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        {s.departures.map((d) => (
          <div key={d.code + d.title} className="flex items-center justify-between gap-2 rounded-lg bg-container-low p-2 transition-colors hover:bg-container">
            <div className="flex min-w-0 items-center gap-2">
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded text-xs font-bold ${s.codeCls}`}>{d.code}</div>
              <div className="flex min-w-0 flex-col">
                <div className="truncate text-sm font-semibold">{t(d.title)}</div>
                <div className="flex flex-wrap items-center gap-1 text-small text-on-surface-variant">
                  {d.meta.map((m, i) => (
                    <span key={txtId(m.text)} className="flex items-center gap-1">{i > 0 && <span>•</span>}<span className={m.cls}>{tx(t, m.text)}</span></span>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-4">
              <span className={`hidden items-center gap-1 rounded-full px-2 py-0.5 text-micro font-bold sm:flex ${CROWD[d.crowd.tone]}`}>
                {d.crowd.dot && <span className={`h-1.5 w-1.5 rounded-full ${DOT[d.crowd.tone]}`} />}{t(d.crowd.text)}
              </span>
              <div className="min-w-[70px] text-right">
                <div className={`text-lg font-extrabold leading-none ${d.etaPrimary ? "text-primary" : ""}`}>{tx(t, d.eta)}</div>
                <div className="text-micro font-bold text-on-surface-variant">{tx(t, d.then)}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {s.amenities.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 pt-1">
          {s.amenities.map((a) => (
            <span key={a.text} className="flex items-center gap-1 rounded bg-container px-2 py-1 text-micro font-bold text-on-surface-variant">
              <Icon name={a.icon} className={`text-[14px] ${a.iconCls}`} /> {t(a.text)}
            </span>
          ))}
        </div>
      )}

      {s.auto && (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-container p-2">
          <div className="flex items-center gap-1">
            <Icon name="electric_rickshaw" className="text-[20px] text-primary" />
            <div>
              <div className="text-xs font-semibold">{t(s.auto.title)}</div>
              <div className="text-small text-on-surface-variant">{t(s.auto.text)}</div>
            </div>
          </div>
          <span className="shrink-0 rounded bg-container-lowest px-2 py-1 text-micro font-bold text-primary shadow-sm">{t(s.auto.badge)}</span>
        </div>
      )}
    </article>
  );
}
