"use client";

// Dedicated Metro Tracker for Mumbai Metro Line 1 & Line 3
// Features line selection, station picker, direction selection,
// verified timetable countdowns, platform tags, and strict segregation from suburban rail.

import React, { useEffect, useMemo, useState } from "react";
import {
  getMetroArrivals,
  lines,
  stations,
  type MetroArrivalEstimate,
  type MetroArrivalsResponse,
} from "@/lib/api";
import Icon from "./Icon";
import { useKolkataClock } from "./LiveClock";

type MetroLineId = "METRO1" | "METRO3";

const METRO_LINES: Record<
  MetroLineId,
  {
    name: string;
    operator: string;
    color: string;
    badgeBg: string;
    defaultStation: string;
    terminusA: string;
    terminusB: string;
  }
> = {
  METRO1: {
    name: "Metro Line 1 (Versova–Ghatkopar)",
    operator: "Mumbai Metro One",
    color: "bg-[#1E88E5]",
    badgeBg: "bg-blue-600 text-white",
    defaultStation: "andheri_m1",
    terminusA: "Versova",
    terminusB: "Ghatkopar",
  },
  METRO3: {
    name: "Metro Line 3 (Aqua Line)",
    operator: "MMRCL",
    color: "bg-[#00ACC1]",
    badgeBg: "bg-cyan-600 text-white",
    defaultStation: "bkc_m3",
    terminusA: "Cuffe Parade",
    terminusB: "Aarey JVLR",
  },
};

export default function MetroTracker({
  initialLineId = "METRO1",
  initialStationId,
}: {
  initialLineId?: MetroLineId;
  initialStationId?: string;
}) {
  const clock = useKolkataClock();
  const [activeLineId, setActiveLineId] = useState<MetroLineId>(initialLineId);
  const [selectedStationId, setSelectedStationId] = useState<string>(
    initialStationId || METRO_LINES[initialLineId].defaultStation
  );
  const [direction, setDirection] = useState<"all" | "up" | "down">("all");
  const [data, setData] = useState<MetroArrivalsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [lastRefreshed, setLastRefreshed] = useState<string>("");

  const cfg = METRO_LINES[activeLineId];

  // List of stations on active metro line
  const metroStations = useMemo(() => {
    const lineData = lines[activeLineId];
    if (!lineData || !Array.isArray(lineData.stations)) return [];
    return lineData.stations.map((sid) => ({
      id: sid,
      name: stations[sid]?.name ?? sid,
    }));
  }, [activeLineId]);

  // Derived effective station on current metro line
  const effectiveStationId = useMemo(() => {
    const exists = metroStations.some((s) => s.id === selectedStationId);
    return exists ? selectedStationId : (metroStations[0]?.id ?? selectedStationId);
  }, [metroStations, selectedStationId]);

  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  useEffect(() => {
    if (!effectiveStationId) return;
    let alive = true;
    const dirParam = direction === "all" ? null : direction;
    getMetroArrivals(effectiveStationId, activeLineId, dirParam, 10)
      .then((res) => {
        if (!alive) return;
        setData(res);
        setLastRefreshed(new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit" }));
      })
      .catch((err: unknown) => {
        if (!alive) return;
        console.warn("Error fetching metro arrivals:", err);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [effectiveStationId, activeLineId, direction, refreshTrigger]);

  const handleRefresh = () => {
    setLoading(true);
    setRefreshTrigger((c) => c + 1);
  };

  const currentStationName = stations[effectiveStationId]?.name ?? effectiveStationId;

  return (
    <div className="flex flex-col gap-6">
      {/* Header Banner */}
      <div className="rounded-2xl border border-outline-variant bg-container-lowest p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-on-primary">
                <Icon name="subway" className="text-[22px]" />
              </span>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-on-surface">
                  Mumbai Metro Network Tracker
                </h1>
                <p className="text-xs text-on-surface-variant">
                  High-frequency Rapid Transit · Line 1 (Blue) & Line 3 (Aqua) Timetables
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
              <Icon name="refresh" className={`text-[16px] ${loading ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* 1. Metro Line Selector Tabs */}
        <div className="mt-6 flex flex-wrap gap-2 border-b border-outline-variant pb-4">
          {(["METRO1", "METRO3"] as MetroLineId[]).map((key) => {
            const line = METRO_LINES[key];
            const isSelected = activeLineId === key;
            return (
              <button
                key={key}
                onClick={() => {
                  setActiveLineId(key);
                  setSelectedStationId(line.defaultStation);
                }}
                className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all ${
                  isSelected
                    ? "bg-primary text-on-primary shadow-sm"
                    : "bg-container-high text-on-surface hover:bg-container-highest"
                }`}
              >
                <span className={`h-3 w-3 rounded-full ${key === "METRO1" ? "bg-blue-500" : "bg-cyan-500"}`} />
                <span>{line.name}</span>
                <span className="text-[11px] font-normal opacity-80">({line.operator})</span>
              </button>
            );
          })}
        </div>

        {/* 2. Controls Grid */}
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Station Picker */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">
              Select Metro Station
            </label>
            <div className="relative">
              <select
                value={effectiveStationId}
                onChange={(e) => setSelectedStationId(e.target.value)}
                className="w-full appearance-none rounded-xl border border-outline-variant bg-container-high px-4 py-2.5 pr-10 text-sm font-semibold text-on-surface focus:border-primary focus:outline-none"
              >
                {metroStations.map((st) => (
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

          {/* Direction Filter */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">
              Platform / Direction
            </label>
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-container-high p-1 text-xs font-semibold">
              <button
                onClick={() => setDirection("all")}
                className={`rounded-lg py-2 transition-colors ${
                  direction === "all" ? "bg-primary text-on-primary" : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                Both Platforms
              </button>
              <button
                onClick={() => setDirection("up")}
                className={`rounded-lg py-2 transition-colors ${
                  direction === "up" ? "bg-primary text-on-primary" : "text-on-surface-variant hover:text-on-surface"
                }`}
                title={`Towards ${cfg.terminusA}`}
              >
                Towards {cfg.terminusA.split(" ")[0]}
              </button>
              <button
                onClick={() => setDirection("down")}
                className={`rounded-lg py-2 transition-colors ${
                  direction === "down" ? "bg-primary text-on-primary" : "text-on-surface-variant hover:text-on-surface"
                }`}
                title={`Towards ${cfg.terminusB}`}
              >
                Towards {cfg.terminusB.split(" ")[0]}
              </button>
            </div>
          </div>
        </div>

        {/* Notice Pill */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-container-high/60 px-4 py-2.5 text-xs text-on-surface-variant border border-outline-variant/50">
          <div className="flex items-center gap-2">
            <Icon name="info" className="text-[16px] text-primary" />
            <span className="font-medium text-on-surface">
              High-Frequency Transit Headway: Peak Every 4–5 min · Off-Peak Every 6–8 min
            </span>
          </div>
          {lastRefreshed && (
            <span className="text-[11px]">Last updated: <span className="font-semibold text-on-surface">{lastRefreshed}</span></span>
          )}
        </div>
      </div>

      {/* Metro Departure Cards */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-base font-bold text-on-surface">
            Upcoming Metro Trains at {currentStationName}
          </h2>
          <span className="text-xs font-semibold text-on-surface-variant">
            {data?.trains?.length ?? 0} departures scheduled
          </span>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-outline-variant bg-container-lowest p-12 text-on-surface-variant shadow-sm">
            <span className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-xs font-medium">Loading metro departures...</p>
          </div>
        ) : !data?.trains || data.trains.length === 0 ? (
          <div className="rounded-2xl border border-outline-variant bg-container-lowest p-12 text-center text-on-surface-variant shadow-sm">
            <Icon name="subway" className="mx-auto text-[36px] text-outline" />
            <p className="mt-2 text-sm font-semibold text-on-surface">No metro departures found</p>
            <p className="mt-1 text-xs text-on-surface-variant">
              Select another platform or reset direction filters.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.trains.map((train: MetroArrivalEstimate, idx: number) => (
              <div
                key={`${train.line_id}-${idx}`}
                className="flex flex-col justify-between rounded-xl border border-outline-variant bg-container-lowest p-4 transition-all hover:border-primary hover:shadow-card"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="rounded bg-primary/10 px-2.5 py-0.5 text-xs font-black text-primary">
                      {train.platform}
                    </span>
                    <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-black tabular-nums text-primary">
                      {train.countdown_str}
                    </span>
                  </div>

                  <div className="mt-3">
                    <h3 className="text-base font-bold text-on-surface leading-tight">
                      To {train.destination}
                    </h3>
                    <p className="text-xs text-on-surface-variant font-medium mt-1">
                      {train.direction_label}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-outline-variant/60 pt-3 text-xs">
                  <span className="font-bold tabular-nums text-on-surface">
                    {train.display_time_12h}
                  </span>
                  <span className="text-[11px] text-on-surface-variant">
                    {train.frequency_note}
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
