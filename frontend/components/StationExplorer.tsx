"use client";

// Station Explorer & Nearby — Hub exploration with live station search,
// real database suggestions, user geolocation, and transport mode filters.

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { M } from "@/lib/i18n/messages/StationExplorer";
import {
  buildHubData,
  filters,
  hub,
  type Kind,
  mapLayers,
  skywalk,
  type Station,
  type Txt,
} from "@/lib/mockStations";
import { getNearbyStations, searchStations } from "@/lib/api";
import type { Place, StationSearchResult } from "@/lib/types";
import BusTracker from "./BusTracker";
import Icon from "./Icon";
import { useKolkataClock } from "./LiveClock";
import LocalTrainsTracker from "./LocalTrainsTracker";
import MapView from "./MapView";
import MetroTracker from "./MetroTracker";

const CROWD = {
  ok: "bg-primary-fixed text-on-primary-fixed",
  warn: "bg-tertiary-fixed text-on-tertiary-fixed",
  neutral: "bg-container-high text-on-surface-variant",
} as const;
const DOT = { ok: "bg-primary", warn: "bg-tertiary", neutral: "bg-outline" } as const;

type T = ReturnType<typeof useT<keyof typeof M.en>>;

function tx(t: T, x: Txt): string {
  if (typeof x !== "string") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (t as any)(x[0], x[1]);
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = (t as any)(x);
    return res || x;
  } catch {
    return x;
  }
}

const txtId = (x: Txt) => (typeof x === "string" ? x : `${x[0]}:${JSON.stringify(x[1])}`);

function radiusLabel(t: T, r: string): string {
  return r.endsWith("km") ? t("km", { n: r.slice(0, -2) }) : t("m", { n: r.replace(/m$/, "") });
}

function parseRadiusKm(r: string): number {
  if (r.endsWith("km")) return parseFloat(r.slice(0, -2));
  if (r.endsWith("m")) return parseFloat(r.slice(0, -1)) / 1000;
  return 1.5;
}

export default function StationExplorer() {
  const t = useT(M);
  const [filter, setFilter] = useState<Kind | "all">("all");
  const [radius, setRadius] = useState(hub.defaultRadius);
  const [layer, setLayer] = useState(mapLayers[0]);
  const [query, setQuery] = useState(hub.search);
  const [center, setCenter] = useState<Place>(hub.center);
  const [selectedStation, setSelectedStation] = useState<StationSearchResult | null>(null);
  const [nearbyStations, setNearbyStations] = useState<StationSearchResult[]>([]);
  const [suggestions, setSuggestions] = useState<StationSearchResult[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(-1);
  const [notFound, setNotFound] = useState(false);

  // User Geolocation state
  const [geoStatus, setGeoStatus] = useState<"idle" | "locating" | "located" | "denied" | "error">("idle");
  const [userCoords, setUserCoords] = useState<{ lat: number; lon: number } | null>(null);

  // Global Asia/Kolkata clock
  const clock = useKolkataClock();

  // Mode navigation: Local Trains, Metro, Bus, or General Station Explorer
  const [mainTab, setMainTab] = useState<"trains" | "metro" | "bus" | "explorer">(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get("tab") || params.get("mode");
      if (tab === "trains" || tab === "train" || tab === "local") return "trains";
      if (tab === "metro") return "metro";
      if (tab === "bus") return "bus";
      if (tab === "explorer" || tab === "all") return "explorer";
    }
    return "trains";
  });

  const searchBoxRef = useRef<HTMLDivElement>(null);

  // Build active hub data (cards, gates, facilities, breadcrumb) dynamically
  const hubData = buildHubData(selectedStation, nearbyStations);

  // Filter cards strictly by kind
  const shown = hubData.cards.filter((s) => filter === "all" || s.kinds.includes(filter));

  // Compute actual counts for category chips
  const dynamicFilters = filters.map((f) => ({
    ...f,
    count: f.id === "all" ? hubData.cards.length : hubData.cards.filter((c) => c.kinds.includes(f.id as Kind)).length,
  }));

  // Fetch suggestions as user types or on focus
  const loadSuggestions = useCallback(async (q: string) => {
    setIsSearching(true);
    try {
      const results = await searchStations(q.trim(), "all", 8);
      setSuggestions(results);
      if (q.trim() && results.length === 0) {
        setNotFound(true);
      } else {
        setNotFound(false);
      }
    } catch {
      setSuggestions([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadSuggestions(query);
    }, 120);
    return () => clearTimeout(timer);
  }, [query, loadSuggestions]);

  // Fetch nearby stations whenever location or radius changes
  useEffect(() => {
    const lat = userCoords?.lat ?? center.lat;
    const lon = userCoords?.lon ?? center.lon;
    const radiusKm = parseRadiusKm(radius);

    let active = true;
    getNearbyStations(lat, lon, radiusKm, "all", 20).then((res) => {
      if (active) setNearbyStations(res);
    }).catch(() => {
      if (active) setNearbyStations([]);
    });

    return () => { active = false; };
  }, [center.lat, center.lon, radius, userCoords]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function selectStation(st: StationSearchResult) {
    setSelectedStation(st);
    setQuery(st.name);
    setCenter({ label: st.name, lat: st.lat, lon: st.lon });
    setIsDropdownOpen(false);
    setNotFound(false);
    setHighlightedIdx(-1);
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (highlightedIdx >= 0 && suggestions[highlightedIdx]) {
      selectStation(suggestions[highlightedIdx]);
      return;
    }
    const q = query.trim();
    if (!q) return;

    if (suggestions.length > 0) {
      selectStation(suggestions[0]);
    } else {
      setNotFound(true);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!isDropdownOpen) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        setIsDropdownOpen(true);
        return;
      }
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIdx((prev) => (prev + 1 < suggestions.length ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIdx((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === "Escape") {
      setIsDropdownOpen(false);
    }
  }

  function requestLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoStatus("error");
      return;
    }

    setGeoStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        setUserCoords(coords);
        setGeoStatus("located");
        setCenter({ label: t("deviceGps"), lat: coords.lat, lon: coords.lon });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setGeoStatus("denied");
        } else {
          setGeoStatus("error");
        }
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  const QUICK_HUBS = [
    { label: "Andheri (ADH)", query: "Andheri" },
    { label: "Dadar (DDR)", query: "Dadar" },
    { label: "CSMT (VT)", query: "CSMT" },
    { label: "Ghatkopar (GC)", query: "Ghatkopar" },
    { label: "Borivali (BVI)", query: "Borivali" },
  ];

  return (
    <main className="flex w-full flex-col px-4 pb-6 pt-4 md:px-6">
      {/* ---- Top Mode Selector Navigation Tabs ---- */}
      <div className="mb-6 flex flex-wrap items-center gap-2 rounded-2xl bg-container-high/60 p-1.5 border border-outline-variant/60 shadow-sm">
        <button
          onClick={() => setMainTab("trains")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all ${
            mainTab === "trains"
              ? "bg-primary text-on-primary shadow-sm"
              : "text-on-surface-variant hover:bg-container-high hover:text-on-surface"
          }`}
        >
          <Icon name="train" className="text-[18px]" />
          <span>Local Trains Live</span>
        </button>
        <button
          onClick={() => setMainTab("metro")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all ${
            mainTab === "metro"
              ? "bg-primary text-on-primary shadow-sm"
              : "text-on-surface-variant hover:bg-container-high hover:text-on-surface"
          }`}
        >
          <Icon name="subway" className="text-[18px]" />
          <span>Metro Network</span>
        </button>
        <button
          onClick={() => setMainTab("bus")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all ${
            mainTab === "bus"
              ? "bg-primary text-on-primary shadow-sm"
              : "text-on-surface-variant hover:bg-container-high hover:text-on-surface"
          }`}
        >
          <Icon name="directions_bus" className="text-[18px]" />
          <span>BEST Buses</span>
        </button>
        <button
          onClick={() => setMainTab("explorer")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all ${
            mainTab === "explorer"
              ? "bg-primary text-on-primary shadow-sm"
              : "text-on-surface-variant hover:bg-container-high hover:text-on-surface"
          }`}
        >
          <Icon name="near_me" className="text-[18px]" />
          <span>Station Explorer & Map</span>
        </button>
      </div>

      {mainTab === "trains" && (
        <LocalTrainsTracker initialStationId={selectedStation?.id} />
      )}

      {mainTab === "metro" && (
        <MetroTracker initialStationId={selectedStation?.id} />
      )}

      {mainTab === "bus" && (
        <BusTracker initialStopId={selectedStation?.id} />
      )}

      {mainTab === "explorer" && (
        <>
          {/* ---- Breadcrumb + status ---- */}
          <section className="mb-5 flex w-full flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1 text-xs font-semibold text-on-surface-variant">
            {hubData.breadcrumb.map((b, i) => (
              <span key={String(b) + i} className="flex items-center gap-1">
                {i > 0 && <Icon name="chevron_right" className="text-[14px] text-outline" />}
                <span className={i === hubData.breadcrumb.length - 1 ? "font-bold text-primary" : ""}>
                  {tx(t, b)}
                </span>
              </span>
            ))}
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 rounded-full bg-primary-fixed px-2 py-1 text-micro font-bold text-on-primary-fixed">
              <span className="h-1.5 w-1.5 animate-ping rounded-full bg-primary" /> {t(hub.feeds)}
            </div>
            <div className="text-small text-on-surface-variant">
              {t("updated")}{" "}
              <span className="font-semibold text-on-surface tabular-nums">
                {clock ?? "--:--:--"} IST
              </span>
            </div>
          </div>
        </div>

        {/* Search + Radius */}
        <div className="flex w-full flex-col justify-between gap-4 rounded-xl bg-container-lowest p-4 shadow-sm xl:flex-row xl:items-center">
          <div ref={searchBoxRef} className="relative min-w-0 max-w-xl flex-1">
            <form onSubmit={handleSearchSubmit} className="relative">
              <Icon
                name="travel_explore"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-primary"
              />
              <input
                role="combobox"
                aria-autocomplete="list"
                aria-controls="station-search-listbox"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setIsDropdownOpen(true);
                }}
                onFocus={() => setIsDropdownOpen(true)}
                onKeyDown={handleKeyDown}
                aria-label={t("searchAria")}
                aria-expanded={isDropdownOpen}
                placeholder={t("searchPlaceholder")}
                className="h-12 w-full rounded-lg bg-container-low pl-10 pr-28 text-sm placeholder:text-outline transition-all focus:bg-container-lowest focus:outline-none focus:ring-2 focus:ring-primary"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setSuggestions([]);
                    setIsDropdownOpen(true);
                  }}
                  aria-label={t("clearSearch")}
                  className="absolute right-20 top-1/2 -translate-y-1/2 p-1 text-outline transition-colors hover:text-on-surface"
                >
                  <Icon name="close" className="text-[18px]" />
                </button>
              )}
              <button
                type="submit"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded bg-primary px-3 py-1.5 text-micro font-bold text-on-primary transition-colors hover:bg-primary-container"
              >
                {t("search")}
              </button>
            </form>

            {/* Dropdown Suggestions */}
            {isDropdownOpen && (
              <div
                id="station-search-listbox"
                role="listbox"
                aria-label={t("suggestionsAria")}
                className="absolute left-0 right-0 top-14 z-[1000] max-h-80 overflow-y-auto rounded-xl border border-outline-variant/30 bg-container-lowest p-2 shadow-xl backdrop-blur-md"
              >
                {isSearching ? (
                  <div className="flex items-center gap-2 px-3 py-3 text-xs text-on-surface-variant">
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    <span>Searching database...</span>
                  </div>
                ) : suggestions.length > 0 ? (
                  <>
                    <div className="px-3 py-1 text-micro font-bold uppercase tracking-wider text-on-surface-variant">
                      {query.trim() ? "Matching Locations" : t("popularHubs")}
                    </div>
                    {suggestions.map((s, idx) => {
                      const isHighlighted = idx === highlightedIdx;
                      const modeIcon =
                        s.mode === "metro"
                          ? "subway"
                          : s.mode === "local"
                          ? "train"
                          : s.mode === "bus"
                          ? "directions_bus"
                          : "electric_rickshaw";
                      const modeLabel =
                        s.mode === "metro"
                          ? "Metro"
                          : s.mode === "local"
                          ? "Suburban Rail"
                          : s.mode === "bus"
                          ? "BEST Bus"
                          : "Auto Stand";

                      return (
                        <div
                          key={s.id}
                          role="option"
                          aria-selected={isHighlighted}
                          onClick={() => selectStation(s)}
                          className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2.5 transition-colors ${
                            isHighlighted ? "bg-primary-fixed text-on-primary-fixed" : "hover:bg-container-low"
                          }`}
                        >
                          <div className="flex min-w-0 items-center gap-2.5">
                            <Icon
                              name={modeIcon}
                              className={`text-[20px] ${
                                s.mode === "metro"
                                  ? "text-primary"
                                  : s.mode === "local"
                                  ? "text-secondary"
                                  : "text-tertiary"
                              }`}
                            />
                            <div className="min-w-0">
                              <div className="truncate text-xs font-bold text-on-surface">{s.name}</div>
                              <div className="truncate text-micro text-on-surface-variant">
                                {s.aliases && s.aliases.length > 0 ? `Code / Alias: ${s.aliases.join(", ")}` : modeLabel}
                              </div>
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <span className="rounded bg-container-high px-1.5 py-0.5 text-micro font-bold text-on-surface-variant">
                              {modeLabel}
                            </span>
                            {s.distance_m && (
                              <div className="text-micro font-semibold text-primary">{s.distance_m}m away</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </>
                ) : (
                  <div className="p-3 text-xs">
                    <p className="font-semibold text-error">{t("noResultsFound", { query })}</p>
                    <p className="mt-1 text-micro text-on-surface-variant">{t("searchHint")}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {QUICK_HUBS.map((qh) => (
                        <button
                          key={qh.query}
                          type="button"
                          onClick={() => {
                            setQuery(qh.query);
                            loadSuggestions(qh.query);
                          }}
                          className="rounded-full bg-container-low px-2 py-1 text-micro font-bold text-primary hover:bg-container-high"
                        >
                          {qh.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {notFound && !isDropdownOpen && (
              <p className="mt-1 text-caption text-error">{t("notFound")}</p>
            )}
          </div>

          {/* Radius selector */}
          <div className="flex flex-wrap items-center gap-4 rounded-xl bg-container-low px-4 py-2">
            <div className="flex items-center gap-1">
              <Icon name="radar" className="text-[18px] text-primary" />
              <span className="text-xs font-semibold">{t("radius")}</span>
              <span className="text-xs font-bold text-primary">{radiusLabel(t, radius)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {hub.radii.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRadius(r)}
                  aria-pressed={radius === r}
                  className={`rounded px-2.5 py-1 text-micro font-bold transition-all ${
                    radius === r
                      ? "bg-primary text-on-primary shadow-sm"
                      : "text-on-surface-variant hover:bg-container-high"
                  }`}
                >
                  {radiusLabel(t, r)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Mode chips with dynamic counts */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {dynamicFilters.map((f) => {
            const on = filter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                aria-pressed={on}
                className={`flex shrink-0 items-center gap-1 rounded-full px-4 py-2 text-xs font-semibold shadow-sm transition-all ${
                  on ? "bg-primary text-on-primary" : "bg-container-lowest hover:bg-container"
                }`}
              >
                <Icon name={f.icon} className={`text-[18px] ${on ? "" : f.iconCls}`} />
                <span>{t(f.label)}</span>
                <span
                  className={`rounded-full px-1.5 text-micro font-bold ${
                    on ? "bg-on-primary/20" : "bg-container-high text-on-surface-variant"
                  }`}
                >
                  {f.count}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ---- Two columns ---- */}
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-2">
        {/* Left column: Filtered station cards */}
        <div className="flex min-w-0 flex-col gap-4">
          {shown.map((s) => (
            <StationCard key={s.id} station={s} />
          ))}
          {shown.length === 0 && (
            <div className="rounded-xl bg-container-lowest p-6 text-center shadow-sm">
              <Icon name="search_off" className="mx-auto text-[32px] text-outline" />
              <p className="mt-2 text-sm font-semibold text-on-surface">{t("noStations")}</p>
              <p className="mt-1 text-caption text-on-surface-variant">
                {filter === "metro" && t("noMetroSchedule")}
                {filter === "bus" && t("noBusSchedule")}
                {filter === "auto" && "No designated auto/cab stands within this radius."}
              </p>
            </div>
          )}
        </div>

        {/* Right column: Map + Gates + Facilities */}
        <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-20">
          <div className="flex flex-col overflow-hidden rounded-xl bg-container-lowest shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-1 bg-container-low p-4">
              <div className="flex items-center gap-1">
                <Icon name="map" className="text-[20px] text-primary" />
                <span className="text-sm font-bold">{hubData.title}</span>
              </div>
              <div className="flex items-center gap-1 rounded-lg bg-container-lowest p-1">
                {mapLayers.map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setLayer(l)}
                    aria-pressed={layer === l}
                    className={`rounded px-2 py-1 text-micro font-bold transition-all ${
                      layer === l
                        ? "bg-primary text-on-primary shadow-sm"
                        : "text-on-surface-variant hover:bg-container"
                    }`}
                  >
                    {t(l)}
                  </button>
                ))}
              </div>
            </div>

            {/* Leaflet map */}
            <div className="relative h-80 w-full bg-container">
              <MapView
                showNetwork
                origin={center}
                here={userCoords ? [userCoords.lat, userCoords.lon] : [center.lat, center.lon]}
              />
              <div className="pointer-events-none absolute inset-x-4 top-4 z-[500] flex justify-center">
                <div className="flex items-center gap-2 rounded-lg bg-container-lowest/95 px-3 py-1.5 shadow-md backdrop-blur-md">
                  <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-primary" />
                  <span className="text-micro font-bold">{t(skywalk)}</span>
                </div>
              </div>

              {/* Location Bar with honest GPS state */}
              <div className="absolute inset-x-4 bottom-4 z-[500] flex items-center justify-between gap-2 rounded-xl bg-inverse-surface/90 px-4 py-2 text-small text-inverse-on-surface shadow-xl backdrop-blur-md">
                <div className="flex items-center gap-2">
                  <Icon
                    name={userCoords ? "my_location" : "location_on"}
                    className={`text-[18px] ${userCoords ? "text-primary-fixed" : "text-primary-fixed-dim"}`}
                  />
                  <span>
                    {userCoords ? t("deviceGps") : t("referenceHub")}:{" "}
                    <strong>
                      {userCoords
                        ? `${userCoords.lat.toFixed(4)}, ${userCoords.lon.toFixed(4)}`
                        : center.label}
                    </strong>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={requestLocation}
                  disabled={geoStatus === "locating"}
                  className="rounded bg-primary px-2.5 py-1 text-micro font-bold text-on-primary transition-all hover:bg-primary-container disabled:opacity-60"
                >
                  {geoStatus === "locating"
                    ? t("locating")
                    : userCoords
                    ? "Refresh GPS"
                    : t("useLocation")}
                </button>
              </div>
            </div>

            {/* Geolocation feedback alerts */}
            {geoStatus === "denied" && (
              <div className="bg-tertiary-fixed/30 px-4 py-2 text-caption font-medium text-tertiary">
                {t("locationDenied")}
              </div>
            )}
            {geoStatus === "error" && (
              <div className="bg-error-container/30 px-4 py-2 text-caption font-medium text-error">
                {t("locationError")}
              </div>
            )}

            {/* Station Gates */}
            <div className="flex flex-col gap-4 p-5">
              <div className="flex items-center justify-between">
                <span className="text-lg font-bold">{t("gatesTitle")}</span>
                <span className="text-micro font-semibold text-primary">
                  {t("exitsActive", { n: hubData.gates.length })}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                {hubData.gates.map((g) => (
                  <div
                    key={g.gate}
                    className="flex cursor-pointer flex-col gap-1 rounded-lg bg-container-low p-2 transition-colors hover:bg-container-high"
                  >
                    <div className="flex items-center justify-between">
                      <span className="rounded bg-primary px-1.5 py-0.5 text-micro font-bold text-on-primary">
                        {t("gate", { n: g.gate })}
                      </span>
                      <Icon name={g.icon} className={`text-[16px] ${g.iconCls}`} />
                    </div>
                    <div className="text-xs font-bold">{tx(t, g.title)}</div>
                    <div className="truncate text-small text-on-surface-variant">{tx(t, g.text)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Hub Facilities */}
          <div className="flex flex-col gap-4 rounded-xl bg-container-lowest p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <Icon name="room_preferences" className="text-[20px] text-primary" />
                <span className="text-lg font-bold">{t("facilitiesTitle")}</span>
              </div>
              <span className="rounded-full bg-primary-fixed px-2 py-0.5 text-micro font-bold text-on-primary-fixed">
                {t("allOperational")}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {hubData.facilities.map((f, i) => (
                <div key={String(f.title) + i} className="flex items-start gap-2 rounded-lg bg-container-low p-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-primary/10 text-primary">
                    <Icon name={f.icon} className="text-[18px]" />
                  </div>
                  <div>
                    <div className="text-xs font-bold">{tx(t, f.title)}</div>
                    <div className="text-small text-on-surface-variant">{tx(t, f.text)}</div>
                    <div className="mt-1 text-micro font-bold text-primary">{tx(t, f.foot)}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between gap-2 pt-2">
              <Link
                href={`/plan?from=${encodeURIComponent(center.label)}`}
                className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-on-primary shadow-sm transition-all hover:bg-primary-container"
              >
                <Icon name="directions" className="text-[18px]" /> {t("indoorRoute")}
              </Link>
              <button
                type="button"
                aria-label={t("shareAria")}
                className="flex items-center justify-center rounded-xl bg-container-high p-3 transition-colors hover:bg-container-highest"
              >
                <Icon name="share" className="text-[20px]" />
              </button>
            </div>
          </div>
        </div>
      </div>
        </>
      )}
    </main>
  );
}

function StationCard({ station: s }: { station: Station }) {
  const t = useT(M);
  const isMetroOrBus = s.kinds.includes("metro") || s.kinds.includes("bus");

  return (
    <article className="flex flex-col gap-4 rounded-xl bg-container-lowest p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${s.iconBox}`}>
            <Icon name={s.icon} className="text-[22px]" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-lg font-bold">{tx(t, s.name)}</span>
              <span className={`rounded px-1.5 py-0.5 text-micro font-bold ${s.tagCls}`}>{tx(t, s.tag)}</span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-small text-on-surface-variant">
              {s.sub.map((x, i) => (
                <span key={String(x.text) + i} className="flex items-center gap-2">
                  {i > 0 && <span>•</span>}
                  <span className={`flex items-center gap-1 ${x.cls ?? ""}`}>
                    {x.dot && <span className="h-2 w-2 rounded-full bg-primary" />}
                    {tx(t, x.text)}
                  </span>
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

      {/* Departures table (shown when present) */}
      {s.departures.length > 0 && (
        <div className="flex flex-col gap-1">
          {s.departures.map((d) => (
            <div
              key={d.code + String(d.title)}
              className="flex items-center justify-between gap-2 rounded-lg bg-container-low p-2 transition-colors hover:bg-container"
            >
              <div className="flex min-w-0 items-center gap-2">
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded text-xs font-bold ${s.codeCls}`}>
                  {d.code}
                </div>
                <div className="flex min-w-0 flex-col">
                  <div className="truncate text-sm font-semibold">{tx(t, d.title)}</div>
                  <div className="flex flex-wrap items-center gap-1 text-small text-on-surface-variant">
                    {d.meta.map((m, i) => (
                      <span key={txtId(m.text)} className="flex items-center gap-1">
                        {i > 0 && <span>•</span>}
                        <span className={m.cls}>{tx(t, m.text)}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-4">
                <span className={`hidden items-center gap-1 rounded-full px-2 py-0.5 text-micro font-bold sm:flex ${CROWD[d.crowd.tone]}`}>
                  {d.crowd.dot && <span className={`h-1.5 w-1.5 rounded-full ${DOT[d.crowd.tone]}`} />}
                  {tx(t, d.crowd.text)}
                </span>
                <div className="min-w-[70px] text-right">
                  <div className={`text-lg font-extrabold leading-none ${d.etaPrimary ? "text-primary" : ""}`}>
                    {tx(t, d.eta)}
                  </div>
                  <div className="text-micro font-bold text-on-surface-variant">{tx(t, d.then)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Live telemetry disclaimer for modes without live GPS feeds */}
      {isMetroOrBus && (
        <div className="flex items-center gap-1.5 rounded-lg bg-container-low px-2.5 py-1 text-micro text-on-surface-variant">
          <Icon name="info" className="text-[14px] text-outline" />
          <span>{t("telemetryUnavailable")}</span>
        </div>
      )}

      {/* Amenities */}
      {s.amenities.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 pt-1">
          {s.amenities.map((a, i) => (
            <span
              key={String(a.text) + i}
              className="flex items-center gap-1 rounded bg-container px-2 py-1 text-micro font-bold text-on-surface-variant"
            >
              <Icon name={a.icon} className={`text-[14px] ${a.iconCls}`} /> {tx(t, a.text)}
            </span>
          ))}
        </div>
      )}

      {/* Auto Stand details */}
      {s.auto && (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-container p-2">
          <div className="flex items-center gap-1">
            <Icon name="electric_rickshaw" className="text-[20px] text-primary" />
            <div>
              <div className="text-xs font-semibold">{tx(t, s.auto.title)}</div>
              <div className="text-small text-on-surface-variant">{tx(t, s.auto.text)}</div>
            </div>
          </div>
          <span className="shrink-0 rounded bg-container-lowest px-2 py-1 text-micro font-bold text-primary shadow-sm">
            {tx(t, s.auto.badge)}
          </span>
        </div>
      )}
    </article>
  );
}
