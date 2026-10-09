"use client";

// Dedicated Local Trains Tracker for Mumbai Suburban Railway
// Covers Western, Central, and Harbour lines with line selector, station picker,
// direction filter, fast/slow classification, platforms, delays, and RailRadar live telemetry.

import React, { useEffect, useMemo, useState } from "react";
import {
  getUpcomingLocalTrains,
  lines,
  stations,
  type LocalTrainDeparture,
  type LocalTrainsResponse,
} from "@/lib/api";
import Icon from "./Icon";
import { useKolkataClock } from "./LiveClock";

type LineKey = "WR" | "CR" | "HARBOUR";

const LINE_CONFIGS: Record<
  LineKey,
  {
    name: string;
    operator: string;
    color: string;
    subLines: { id: string; label: string; fast: boolean }[];
    defaultStation: string;
    upDest: string;
    downDest: string;
  }
> = {
  WR: {
    name: "Western Line",
    operator: "Western Railway",
    color: "bg-[#D32F2F]",
    subLines: [
      { id: "WR_SLOW", label: "Slow", fast: false },
      { id: "WR_FAST", label: "Fast", fast: true },
    ],
    defaultStation: "andheri_wr",
    upDest: "Churchgate",
    downDest: "Borivali / Virar",
  },
  CR: {
    name: "Central Line",
    operator: "Central Railway",
    color: "bg-[#F9A825]",
    subLines: [
      { id: "CR_SLOW", label: "Slow", fast: false },
      { id: "CR_FAST", label: "Fast", fast: true },
    ],
    defaultStation: "dadar_cr",
    upDest: "CSMT",
    downDest: "Thane / Kalyan",
  },
  HARBOUR: {
    name: "Harbour Line",
    operator: "Central Railway (Harbour)",
    color: "bg-[#6A1B9A]",
    subLines: [{ id: "HARBOUR", label: "All Locals", fast: false }],
    defaultStation: "kurla_hb",
    upDest: "CSMT",
    downDest: "Vashi / Panvel",
  },
};

export default function LocalTrainsTracker({
  initialStationId,
  initialLineKey,
}: {
  initialStationId?: string;
  initialLineKey?: LineKey;
}) {
  const clock = useKolkataClock();
  const [activeLine, setActiveLine] = useState<LineKey>(initialLineKey || "WR");
  const [selectedStationId, setSelectedStationId] = useState<string>(
    initialStationId || LINE_CONFIGS.WR.defaultStation
  );
  const [direction, setDirection] = useState<"all" | "up" | "down">("all");
  const [speedFilter, setSpeedFilter] = useState<"all" | "fast" | "slow">("all");
  const [data, setData] = useState<LocalTrainsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [lastRefreshed, setLastRefreshed] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const cfg = LINE_CONFIGS[activeLine];

  // List of all stations for the active line
  const lineStations = useMemo(() => {
    const stnIds = new Set<string>();
    for (const sub of cfg.subLines) {
      const lineData = lines[sub.id];
      if (lineData && Array.isArray(lineData.stations)) {
        lineData.stations.forEach((s) => stnIds.add(s));
      }
    }
    return Array.from(stnIds).map((sid) => ({
      id: sid,
      name: stations[sid]?.name ?? sid,
      code: (stations[sid] as unknown as { code?: string })?.code ?? null,
    }));
  }, [cfg]);

  // Derived effective station
  const effectiveStationId = useMemo(() => {
    const exists = lineStations.some((s) => s.id === selectedStationId);
    return exists ? selectedStationId : (lineStations[0]?.id ?? selectedStationId);
  }, [lineStations, selectedStationId]);

  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  // Fetch train arrivals asynchronously without synchronous setState in effect body
  useEffect(() => {
    if (!effectiveStationId) return;
    let alive = true;
    const dirParam = direction === "all" ? null : direction;
    getUpcomingLocalTrains(effectiveStationId, null, dirParam, 20)
      .then((res) => {
        if (!alive) return;
        setData(res);
        setLastRefreshed(new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit" }));
        setErrorMsg(null);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        console.warn("Error fetching local trains:", err);
        setErrorMsg("Failed to connect to local trains service. Showing planned times instead.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [effectiveStationId, direction, refreshTrigger]);

  const handleRefresh = () => {
    setLoading(true);
    setRefreshTrigger((c) => c + 1);
  };

  // Filter trains by speed
  const displayedTrains = useMemo(() => {
    if (!data?.trains) return [];
    return data.trains.filter((t: LocalTrainDeparture) => {
      if (speedFilter === "fast") return t.fast_slow === "Fast";
      if (speedFilter === "slow") return t.fast_slow === "Slow";
      return true;
    });
  }, [data, speedFilter]);

  const currentStationName = stations[effectiveStationId]?.name ?? effectiveStationId;
  const currentStationCode = (stations[effectiveStationId] as unknown as { code?: string })?.code ?? data?.station_code ?? "";

  return (
    <div className="flex flex-col gap-6">
      {/* Header Banner */}
      <div className="rounded-2xl border border-outline-variant bg-container-lowest p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-on-primary">
                <Icon name="train" className="text-[22px]" />
              </span>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-on-surface">
                  Mumbai Suburban Local Trains
                </h1>
                <p className="text-xs text-on-surface-variant">
                  Western, Central & Harbour Live Departures · Timetable & RailRadar Telemetry
                </p>
              </div>
            </div>
          </div>

          {/* Live Clock & Refresh */}
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
              title="Refresh departures"
            >
              <Icon name="refresh" className={`text-[18px] ${loading ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* 1. Line Selector Tabs */}
        <div className="mt-6 flex flex-wrap gap-2 border-b border-outline-variant pb-4">
          {(["WR", "CR", "HARBOUR"] as LineKey[]).map((key) => {
            const line = LINE_CONFIGS[key];
            const isSelected = activeLine === key;
            return (
              <button
                key={key}
                onClick={() => {
                  setActiveLine(key);
                  setSelectedStationId(line.defaultStation);
                }}
                className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all ${
                  isSelected
                    ? "bg-primary text-on-primary shadow-sm"
                    : "bg-container-high text-on-surface hover:bg-container-highest"
                }`}
              >
                <span
                  className={`h-3 w-3 rounded-full ${
                    key === "WR" ? "bg-red-500" : key === "CR" ? "bg-amber-400" : "bg-purple-500"
                  }`}
                />
                <span>{line.name}</span>
                <span className="text-micro font-normal opacity-80">({line.operator})</span>
              </button>
            );
          })}
        </div>

        {/* 2. Controls Grid: Station Dropdown + Direction + Fast/Slow */}
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Station Picker */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">
              Select Station ({cfg.name})
            </label>
            <div className="relative">
              <select
                value={effectiveStationId}
                onChange={(e) => setSelectedStationId(e.target.value)}
                className="w-full appearance-none rounded-xl border border-outline-variant bg-container-high px-4 py-2.5 pr-10 text-sm font-semibold text-on-surface focus:border-primary focus:outline-none"
              >
                {lineStations.map((stn) => (
                  <option key={stn.id} value={stn.id}>
                    {stn.name} {stn.code ? `(${stn.code})` : ""}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant">
                <Icon name="expand_more" className="text-[20px]" />
              </span>
            </div>
          </div>

          {/* Direction Filter */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">
              Direction / Destination
            </label>
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-container-high p-1 text-xs font-semibold">
              <button
                onClick={() => setDirection("all")}
                className={`rounded-lg py-2 transition-colors ${
                  direction === "all" ? "bg-primary text-on-primary" : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                Both
              </button>
              <button
                onClick={() => setDirection("up")}
                className={`rounded-lg py-2 transition-colors ${
                  direction === "up" ? "bg-primary text-on-primary" : "text-on-surface-variant hover:text-on-surface"
                }`}
                title={`UP (Towards ${cfg.upDest})`}
              >
                UP ({cfg.upDest.split(" ")[0]})
              </button>
              <button
                onClick={() => setDirection("down")}
                className={`rounded-lg py-2 transition-colors ${
                  direction === "down" ? "bg-primary text-on-primary" : "text-on-surface-variant hover:text-on-surface"
                }`}
                title={`DOWN (Towards ${cfg.downDest})`}
              >
                DOWN ({cfg.downDest.split(" ")[0]})
              </button>
            </div>
          </div>

          {/* Speed Filter (All / Fast / Slow) */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">
              Service Type
            </label>
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-container-high p-1 text-xs font-semibold">
              <button
                onClick={() => setSpeedFilter("all")}
                className={`rounded-lg py-2 transition-colors ${
                  speedFilter === "all" ? "bg-primary text-on-primary" : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                All
              </button>
              <button
                onClick={() => setSpeedFilter("fast")}
                className={`rounded-lg py-2 transition-colors ${
                  speedFilter === "fast" ? "bg-[#B71C1C] text-white" : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                ⚡ Fast Only
              </button>
              <button
                onClick={() => setSpeedFilter("slow")}
                className={`rounded-lg py-2 transition-colors ${
                  speedFilter === "slow" ? "bg-amber-600 text-white" : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                Slow Only
              </button>
            </div>
          </div>
        </div>

        {/* Data Source & Integrity Pill */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-container-high/60 px-4 py-2.5 text-xs text-on-surface-variant border border-outline-variant/50">
          <div className="flex items-center gap-2">
            {data?.is_live ? (
              <span className="flex items-center gap-1.5 font-bold text-emerald-600 dark:text-emerald-400">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-ping" />
                <span>Live GPS Feed (RailRadar)</span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 font-medium text-on-surface">
                <Icon name="event_note" className="text-[18px] text-primary" />
                <span>Planned times</span>
                <span className="text-micro text-on-surface-variant">
                  (no live feed right now · based on how often trains usually run · train numbers show only with live data)
                </span>
              </span>
            )}
          </div>
          {lastRefreshed && (
            <div className="text-micro text-on-surface-variant">
              Last updated: <span className="font-semibold text-on-surface">{lastRefreshed}</span>
            </div>
          )}
        </div>
      </div>

      {/* Departures Board */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-base font-bold text-on-surface">
            Upcoming Trains at {currentStationName} {currentStationCode ? `(${currentStationCode})` : ""}
          </h2>
          <span className="text-xs font-semibold text-on-surface-variant">
            {displayedTrains.length} services scheduled
          </span>
        </div>

        {errorMsg && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-3 text-xs text-amber-800 dark:text-amber-200">
            {errorMsg}
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-outline-variant bg-container-lowest p-12 text-on-surface-variant shadow-sm">
            <span className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-xs font-medium">Loading live local train departures...</p>
          </div>
        ) : displayedTrains.length === 0 ? (
          <div className="rounded-2xl border border-outline-variant bg-container-lowest p-12 text-center text-on-surface-variant shadow-sm">
            <Icon name="subway" className="mx-auto text-[36px] text-outline" />
            <p className="mt-2 text-sm font-semibold text-on-surface">No trains matching selected filters</p>
            <p className="mt-1 text-xs text-on-surface-variant">
              Try switching direction (UP/DOWN) or resetting the service type filter to &quot;All&quot;.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {displayedTrains.map((train, idx) => {
              const isFast = train.fast_slow === "Fast";
              const isUp = train.direction === "up";
              return (
                <div
                  key={`${train.train_number}-${idx}`}
                  className="flex flex-col justify-between rounded-xl border border-outline-variant bg-container-lowest p-4 transition-all hover:border-primary hover:shadow-card"
                >
                  <div>
                    {/* Top row: Badges + Countdown */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {/* Fast / Slow badge */}
                        <span
                          className={`rounded px-2 py-0.5 text-micro font-black uppercase tracking-wider text-white ${
                            isFast ? "bg-[#B71C1C]" : "bg-amber-600"
                          }`}
                        >
                          {isFast ? "⚡ FAST" : "SLOW"}
                        </span>

                        {/* Direction badge */}
                        <span className="rounded bg-container-high px-2 py-0.5 text-micro font-bold text-on-surface-variant">
                          {isUp ? "↑ UP" : "↓ DOWN"}
                        </span>

                        {/* Platform */}
                        <span className="rounded bg-primary-fixed px-2 py-0.5 text-micro font-bold text-primary">
                          {train.platform}
                        </span>
                      </div>

                      {/* Countdown badge */}
                      <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-black tabular-nums text-primary">
                        {train.countdown_str}
                      </span>
                    </div>

                    {/* Destination & Train Name */}
                    <div className="mt-3">
                      <h3 className="text-lg font-black text-on-surface leading-tight">
                        To {train.destination}
                      </h3>
                      <p className="text-xs text-on-surface-variant font-medium mt-0.5">
                        {train.train_name}{train.train_number ? ` · #${train.train_number}` : ""}
                      </p>
                    </div>
                  </div>

                  {/* Timings & Delay */}
                  <div className="mt-4 flex items-center justify-between border-t border-outline-variant/60 pt-3 text-xs">
                    <div>
                      <span className="text-on-surface-variant">Scheduled: </span>
                      <span className="font-bold text-on-surface tabular-nums">
                        {train.departure_clock_12h || train.scheduled_departure}
                      </span>
                      {train.expected_departure && train.expected_departure !== train.scheduled_departure && (
                        <span className="ml-1 text-on-surface-variant">
                          (Exp: {train.expected_departure})
                        </span>
                      )}
                    </div>

                    <div>
                      {train.delay_minutes > 0 ? (
                        <span className="rounded bg-red-100 px-2 py-0.5 text-micro font-bold text-red-700 dark:bg-red-950 dark:text-red-300">
                          +{train.delay_minutes} min delay
                        </span>
                      ) : (
                        <span className="rounded bg-emerald-100 px-2 py-0.5 text-micro font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                          Right time
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
