"use client";

// Dedicated BEST Bus Tracker
// Displays bus stops, route numbers, destinations, upcoming buses with clock time + countdown
// (e.g. "4:18 PM · 6 min") and clear label that live GPS telemetry is unavailable.

import React, { useEffect, useMemo, useState } from "react";
import {
  getBusArrivals,
  lines,
  stations,
  type BusArrivalEstimate,
  type BusArrivalsResponse,
} from "@/lib/api";
import DelayPanel, { DelayDot } from "./DelayPanel";
import Icon from "./Icon";
import { useKolkataClock } from "./LiveClock";

const MAJOR_BUS_STOPS = [
  { id: "andheri_bus", name: "Andheri Stn (W) Bus Stand" },
  { id: "csmt_bus", name: "CSMT Bus Terminus" },
  { id: "bandra_bus", name: "Bandra Stn (W) Bus Stand" },
  { id: "churchgate_bus", name: "Churchgate Bus Stand" },
  { id: "colaba_depot_bus", name: "Colaba Bus Depot" },
  { id: "kanjurmarg_bus", name: "Kanjurmarg Stn Bus Stand" },
];

export default function BusTracker({
  initialStopId = "andheri_bus",
}: {
  initialStopId?: string;
}) {
  const clock = useKolkataClock();
  const [selectedStopId, setSelectedStopId] = useState<string>(initialStopId);
  const [selectedRouteId, setSelectedRouteId] = useState<string>("all");
  const [data, setData] = useState<BusArrivalsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [lastRefreshed, setLastRefreshed] = useState<string>("");

  // All bus stops from network data
  const allBusStops = useMemo(() => {
    const list: { id: string; name: string }[] = [];
    for (const [sid, s] of Object.entries(stations)) {
      if (s.mode === "bus" || sid.endsWith("_bus")) {
        list.push({ id: sid, name: s.name });
      }
    }
    return list.length > 0 ? list : MAJOR_BUS_STOPS;
  }, []);

  // Available bus routes
  const busRoutes = useMemo(() => {
    return Object.entries(lines)
      .filter(([, l]) => l.mode === "bus")
      .map(([lid, l]) => ({
        id: lid,
        name: l.name,
      }));
  }, []);

  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  useEffect(() => {
    if (!selectedStopId) return;
    let alive = true;
    const routeParam = selectedRouteId === "all" ? null : selectedRouteId;
    getBusArrivals(selectedStopId, routeParam, 12)
      .then((res) => {
        if (!alive) return;
        setData(res);
        setLastRefreshed(new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit" }));
      })
      .catch((err: unknown) => {
        if (!alive) return;
        console.warn("Error fetching bus arrivals:", err);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [selectedStopId, selectedRouteId, refreshTrigger]);

  const handleRefresh = () => {
    setLoading(true);
    setRefreshTrigger((c) => c + 1);
  };

  const currentStopName = stations[selectedStopId]?.name ?? selectedStopId;

  return (
    <div className="flex flex-col gap-6">
      {/* Header Banner */}
      <div className="rounded-2xl border border-outline-variant bg-container-lowest p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-tertiary text-on-tertiary">
                <Icon name="directions_bus" className="text-[22px]" />
              </span>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-on-surface">
                  BEST Bus Arrival Tracker
                </h1>
                <p className="text-xs text-on-surface-variant">
                  Brihanmumbai Electric Supply and Transport · Scheduled Headway Arrivals
                </p>
              </div>
            </div>
          </div>

          {/* Clock & Refresh */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 rounded-xl bg-container-high px-3 py-1.5 text-xs text-on-surface">
              <span className="inline-block h-2 w-2 rounded-full bg-primary animate-pulse" />
              <span className="text-on-surface-variant">System Time:</span>
              <span className="font-bold tabular-nums">{clock ?? "--:--"} IST</span>
            </div>

            <button
              onClick={handleRefresh}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-xl border border-outline-variant bg-container-lowest px-3 py-1.5 text-xs font-semibold text-on-surface hover:bg-container-high transition-colors disabled:opacity-50"
            >
              <Icon name="refresh" className={`text-[18px] ${loading ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Quick Hub Buttons */}
        <div className="mt-4 flex flex-wrap gap-2">
          {MAJOR_BUS_STOPS.map((st) => (
            <button
              key={st.id}
              onClick={() => setSelectedStopId(st.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                selectedStopId === st.id
                  ? "bg-tertiary text-on-tertiary shadow-sm"
                  : "bg-container-high text-on-surface hover:bg-container-highest"
              }`}
            >
              {st.name.replace(" Bus Stand", "").replace(" Bus Terminus", "").replace(" Bus Depot", "")}
            </button>
          ))}
        </div>

        {/* Filters Grid */}
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Bus Stop Selector */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">
              Select Bus Stop
            </label>
            <div className="relative">
              <select
                value={selectedStopId}
                onChange={(e) => setSelectedStopId(e.target.value)}
                className="w-full appearance-none rounded-xl border border-outline-variant bg-container-high px-4 py-2.5 pr-10 text-sm font-semibold text-on-surface focus:border-tertiary focus:outline-none"
              >
                {allBusStops.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.name}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant">
                <Icon name="expand_more" className="text-[20px]" />
              </span>
            </div>
          </div>

          {/* Route Filter */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">
              Filter By Route Number
            </label>
            <div className="relative">
              <select
                value={selectedRouteId}
                onChange={(e) => setSelectedRouteId(e.target.value)}
                className="w-full appearance-none rounded-xl border border-outline-variant bg-container-high px-4 py-2.5 pr-10 text-sm font-semibold text-on-surface focus:border-tertiary focus:outline-none"
              >
                <option value="all">All Available Routes</option>
                {busRoutes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant">
                <Icon name="expand_more" className="text-[20px]" />
              </span>
            </div>
          </div>
        </div>

        {/* Live GPS Status Notice */}
        <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 rounded-xl bg-amber-500/10 border border-amber-500/30 px-4 py-3 text-xs text-amber-900 dark:text-amber-200">
          <div className="flex items-center gap-2">
            <Icon name="info" className="text-[20px] text-amber-600 dark:text-amber-400 shrink-0" />
            <div>
              <span className="font-bold">Scheduled Arrival Estimates · Live GPS Unavailable</span>
              <p className="text-micro opacity-90 mt-0.5">
                Planned times from how often each route usually runs. BEST bus GPS is not connected yet, so these are a guide, not live.
              </p>
            </div>
          </div>
          {lastRefreshed && (
            <span className="text-micro opacity-80 shrink-0">Updated: {lastRefreshed}</span>
          )}
        </div>
      </div>

      {/* Bus Arrivals Cards */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-base font-bold text-on-surface">
            Upcoming Buses at {currentStopName}
          </h2>
          <span className="text-xs font-semibold text-on-surface-variant">
            {data?.buses?.length ?? 0} departures scheduled
          </span>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-outline-variant bg-container-lowest p-12 text-on-surface-variant shadow-sm">
            <span className="h-7 w-7 animate-spin rounded-full border-2 border-tertiary border-t-transparent" />
            <p className="text-xs font-medium">Working out the next buses...</p>
          </div>
        ) : !data?.buses || data.buses.length === 0 ? (
          <div className="rounded-2xl border border-outline-variant bg-container-lowest p-12 text-center text-on-surface-variant shadow-sm">
            <Icon name="directions_bus" className="mx-auto text-[36px] text-outline" />
            <p className="mt-2 text-sm font-semibold text-on-surface">No upcoming buses found for this stop</p>
            <p className="mt-1 text-xs text-on-surface-variant">
              Select another bus stop or reset route filters.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.buses.map((bus: BusArrivalEstimate, idx: number) => (
              <div
                key={`${bus.route_id}-${idx}`}
                className="flex flex-col justify-between rounded-xl border border-outline-variant bg-container-lowest p-4 transition-all hover:border-tertiary hover:shadow-card"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="rounded bg-tertiary/15 px-2.5 py-0.5 text-xs font-black text-tertiary">
                      {bus.operator}
                    </span>
                    {/* Clock time + Countdown (e.g. 4:18 PM · 6 min) */}
                    <span className="flex shrink-0 items-center gap-1.5">
                      <DelayDot live={bus.is_live} delayMin={0} />
                      <span className="rounded-full bg-container-high px-2.5 py-0.5 text-xs font-black tabular-nums text-on-surface">
                        {bus.combined_display}
                      </span>
                    </span>
                  </div>

                  <div className="mt-3">
                    <h3 className="text-base font-bold text-on-surface leading-tight">
                      To {bus.destination}
                    </h3>
                    <p className="text-xs text-on-surface-variant font-medium mt-1">
                      {bus.route_name}
                    </p>
                  </div>
                  <DelayPanel live={bus.is_live} delayMin={0} scheduled={bus.scheduled_time} mode="bus" />
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-outline-variant/60 pt-3 text-micro text-on-surface-variant">
                  <span>Scheduled departure</span>
                  <span className="rounded-full bg-container-high px-2 py-0.5 font-bold text-on-surface">
                    {bus.status_note}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
