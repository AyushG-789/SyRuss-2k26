"""FastAPI router for real-time and timetable-backed transit tracking across Mumbai modes:
- Dedicated Suburban Local Trains (Western, Central, Harbour) with fast/slow, direction, platform, delay, and RailRadar integration
- BEST Bus arrival estimates with clock time + countdown (e.g. '4:18 PM · 6 min') and clear scheduled labeling
- Dedicated Metro Line 1 & Metro Line 3 arrivals segregated from suburban trains
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from ..clock import fmt_hhmm, real_ist_now
from ..config import settings
from ..data_loader import load_seed
from ..feeds.railway import get_station_live_board

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/transit", tags=["transit"])


def _format_12h(time_str: str) -> str:
    """Convert '16:18' to '4:18 PM'."""
    try:
        parts = time_str.split(":")
        hh = int(parts[0])
        mm = int(parts[1])
        period = "PM" if hh >= 12 else "AM"
        h12 = hh % 12
        if h12 == 0:
            h12 = 12
        return f"{h12}:{mm:02d} {period}"
    except Exception:
        return time_str


def board_now() -> datetime:
    """Real Mumbai time (IST). The station boards show today's real schedule, so they never use the
    demo clock (that one replays the 4:30–6:30 pm demo story for routes and Pakka Check)."""
    return real_ist_now()


def wait_text(mins: int) -> str:
    """'6 min', or '2 h 10 min' for a long wait (first train of the morning)."""
    if mins < 60:
        return f"{mins} min"
    h, m = divmod(mins, 60)
    return f"{h} h {m} min" if m else f"{h} h"


@dataclass
class Service:
    """How a line runs right now: its frequency, or (outside service hours) when the first one comes."""
    headway: int
    running: bool
    now_mins: int
    wait: int = 0                 # minutes until the first service (when not running)
    first: str | None = None      # "04:00" (when not running)

    def offset(self, i: int, shift: int = 0, min_gap: int = 2) -> int:
        """Minutes until the i-th next departure (i = 1, 2, …)."""
        if self.running:
            o = self.headway * i - (self.now_mins % self.headway) + shift
            return o + self.headway if o < min_gap else o
        return self.wait + self.headway * (i - 1) + shift


def _hhmm_of(value) -> str | None:
    """'10:22' or '2026-10-10T10:31:00+05:30' -> '10:22' / '10:31' (None if missing)."""
    if not value:
        return None
    text = str(value)
    if "T" in text:
        text = text.split("T", 1)[1]
    parts = text.split(":")
    if len(parts) < 2 or not parts[0][-2:].isdigit() or not parts[1][:2].isdigit():
        return None
    return f"{int(parts[0][-2:]):02d}:{int(parts[1][:2]):02d}"


def _shift_hhmm(hhmm: str, minutes: int) -> str:
    h, m = (int(x) for x in hhmm.split(":"))
    total = (h * 60 + m + minutes) % 1440
    return f"{total // 60:02d}:{total % 60:02d}"


def _destination_from_name(train_name: str) -> str | None:
    """'Virar - Churchgate Local' -> 'Churchgate'."""
    if " - " not in train_name:
        return None
    return train_name.split(" - ", 1)[1].replace(" Local", "").replace(" Fast", "").strip() or None


def _direction(seed, here_lines: list[str], here: str, dest_id: str | None, dest_name: str) -> str:
    """'up' = towards the city end of the line (Churchgate / CSMT), using our line maps."""
    for lid in here_lines:
        stations = seed.lines[lid]["stations"]
        if dest_id in stations and here in stations:
            return "up" if stations.index(dest_id) < stations.index(here) else "down"
    name = dest_name.lower()
    return "up" if any(w in name for w in ("churchgate", "csmt", "mumbai central", "parel", "dadar")) else "down"


def service(line: dict, now_mins: int, default_headway: int) -> Service:
    """Pick the frequency band for `now_mins` from the line's `headway_min` ("HH:MM-HH:MM": minutes).
    Outside every band the line isn't running: plan from the start of the next band instead."""
    bands = []
    for band, hw in (line.get("headway_min") or {}).items():
        start, end = band.split("-")
        sh, sm = (int(x) for x in start.split(":"))
        eh, em = (int(x) for x in end.split(":"))
        bands.append((sh * 60 + sm, eh * 60 + em, int(hw)))
    if not bands:
        return Service(default_headway, True, now_mins)
    for start, end, hw in bands:
        if start <= now_mins < end:
            return Service(hw, True, now_mins)
    start, _, hw = min(bands, key=lambda b: (b[0] - now_mins) % 1440)
    return Service(hw, False, now_mins, wait=(start - now_mins) % 1440, first=f"{start // 60:02d}:{start % 60:02d}")


# ================================================================================================
# Data Models
# ================================================================================================

class LocalTrainDeparture(BaseModel):
    train_number: str
    train_name: str
    line_id: str
    line_name: str
    fast_slow: Literal["Fast", "Slow"]
    direction: Literal["up", "down"]
    direction_label: str
    source: str
    destination: str
    scheduled_departure: str
    expected_departure: str
    departure_clock_12h: str
    countdown_min: int
    countdown_str: str
    combined_display: str
    platform: str
    delay_minutes: int
    status: str
    is_live: bool
    data_source: str
    speed_known: bool = True      # False when the live feed doesn't say fast or slow


class LocalTrainsResponse(BaseModel):
    station_id: str
    station_name: str
    station_code: str | None
    line_id: str | None
    direction: str | None
    as_of: str
    is_live: bool
    data_source: str
    note: str
    trains: list[LocalTrainDeparture]


class BusArrivalEstimate(BaseModel):
    route_id: str
    route_name: str
    operator: str
    destination: str
    direction: str
    scheduled_time: str
    display_time_12h: str
    countdown_min: int
    countdown_str: str
    combined_display: str
    is_live: bool
    live_available: bool
    status_note: str


class BusArrivalsResponse(BaseModel):
    stop_id: str
    stop_name: str
    as_of: str
    buses: list[BusArrivalEstimate]
    live_feed_status: str
    note: str


class MetroArrivalEstimate(BaseModel):
    line_id: str
    line_name: str
    operator: str
    station_id: str
    station_name: str
    destination: str
    direction: str
    direction_label: str
    scheduled_time: str
    display_time_12h: str
    countdown_min: int
    countdown_str: str
    combined_display: str
    platform: str
    headway_min: int
    frequency_note: str
    is_live: bool


class MetroArrivalsResponse(BaseModel):
    station_id: str
    station_name: str
    line_id: str
    line_name: str
    as_of: str
    trains: list[MetroArrivalEstimate]
    note: str


# ================================================================================================
# 1. Local Trains Tracker
# ================================================================================================

@router.get("/trains/upcoming", response_model=LocalTrainsResponse)
def get_upcoming_local_trains(
    station_id: str = Query(..., description="Station id or code, e.g. 'dadar_wr', 'andheri_wr', 'csmt', 'MMCT'"),
    line_id: str | None = Query(None, description="Optional line filter: WR_SLOW, WR_FAST, CR_SLOW, CR_FAST, HARBOUR"),
    direction: str | None = Query(None, description="Optional direction: 'up' (towards South/terminals) or 'down' (towards North/outbound)"),
    limit: int = Query(15, ge=1, le=50),
) -> LocalTrainsResponse:
    """Get upcoming suburban local trains with fast/slow classification, destination, scheduled and expected times, platforms, and delay status."""
    seed = load_seed()
    stn_query = station_id.strip()

    # Match station by ID, code, or alias
    matched_stn = None
    if stn_query in seed.stations:
        matched_stn = seed.stations[stn_query]
    else:
        stn_upper = stn_query.upper()
        for s in seed.stations.values():
            st_code = (s.get("code") or "").upper()
            aliases = [a.upper() for a in s.get("aliases", [])]
            if st_code == stn_upper or stn_upper in aliases or s["id"].upper() == stn_upper:
                matched_stn = s
                break

    if not matched_stn:
        raise HTTPException(status_code=404, detail=f"Station '{station_id}' not found in network.")

    sid = matched_stn["id"]
    stn_name = matched_stn["name"]
    stn_code = matched_stn.get("code")

    now_dt = board_now()
    now_mins = now_dt.hour * 60 + now_dt.minute
    now_hhmm = fmt_hhmm(now_dt)
    closed_lines = 0  # lines outside their service hours right now (night)

    # Determine which suburban lines serve this station
    available_lines = ["WR_SLOW", "WR_FAST", "CR_SLOW", "CR_FAST", "HARBOUR"]
    if line_id:
        target_lid = line_id.strip().upper()
        if target_lid not in available_lines:
            raise HTTPException(status_code=400, detail=f"Invalid suburban line_id '{line_id}'. Allowed: {available_lines}")
        active_line_ids = [target_lid]
    else:
        active_line_ids = [lid for lid in available_lines if lid in seed.lines and sid in seed.lines[lid]["stations"]]
        # If station is not directly on these (e.g. transfer hub or general rail), include lines matching operator/mode
        if not active_line_ids:
            for lid in available_lines:
                if lid in seed.lines:
                    active_line_ids.append(lid)

    trains_list: list[LocalTrainDeparture] = []
    is_live = False
    data_source = "timetable"
    source_note = "Planned times from how often trains usually run (no live feed)"

    # If RailRadar API is active and station code is available, attempt to check live RailRadar board
    if settings.active_railway_key and stn_code:
        live_board = get_station_live_board(stn_code)
        if live_board.get("ok") and live_board.get("is_live"):
            is_live = True
            data_source = "railradar"
            source_note = "Live RailRadar telemetry"
            by_code = {str(st.get("code")).upper(): st_id for st_id, st in seed.stations.items() if st.get("code")}
            here_lines = [lid for lid in available_lines if lid in seed.lines and sid in seed.lines[lid]["stations"]]
            for t in live_board.get("trains", []):
                sched = _hhmm_of(t.get("scheduled_departure"))
                expected = _hhmm_of(t.get("expected_departure"))
                dep = expected or sched
                if not dep:
                    continue  # ends here (arrival only)
                dh, dm = (int(x) for x in dep.split(":"))
                diff = dh * 60 + dm - now_mins
                if diff < -720:
                    diff += 1440
                if diff < 0:
                    continue  # already left
                delay = int(t.get("delay_minutes") or 0)
                name = str(t.get("train_name") or "")
                is_fast = "fast" in name.lower() or "fast" in str(t.get("train_type") or "").lower()
                dest_code = str(t.get("destination") or "").upper()
                dest_id = by_code.get(dest_code)
                dest_name = seed.stations[dest_id]["name"] if dest_id else _destination_from_name(name) or dest_code or "Destination"
                tr_dir = _direction(seed, here_lines, sid, dest_id, dest_name)
                if direction and tr_dir != direction.lower():
                    continue

                clock_12h = _format_12h(dep)
                cd = "Due" if diff == 0 else wait_text(diff)
                platform = str(t.get("platform") or "").strip()
                trains_list.append(LocalTrainDeparture(
                    train_number=str(t.get("train_number") or ""),
                    train_name=name or f"{dest_name} Local",
                    line_id=line_id or "SUBURBAN",
                    line_name=line_id or "Mumbai Suburban Railway",
                    fast_slow="Fast" if is_fast else "Slow",
                    speed_known=is_fast,  # the feed only marks fast trains; others may be either
                    direction=tr_dir,
                    direction_label=f"{'UP' if tr_dir == 'up' else 'DOWN'} (Towards {dest_name})",
                    source=str(t.get("source") or "Origin"),
                    destination=dest_name,
                    scheduled_departure=sched or _shift_hhmm(dep, -delay),
                    expected_departure=dep,
                    departure_clock_12h=clock_12h,
                    countdown_min=diff,
                    countdown_str=cd,
                    combined_display=f"{clock_12h} · {cd}",
                    platform=f"PF {platform}" if platform else "PF –",
                    delay_minutes=delay,
                    status=str(t.get("status") or "live"),
                    is_live=True,
                    data_source="railradar",
                ))

    if is_live and not trains_list:  # the feed answered but listed nothing still to come
        is_live, data_source = False, "timetable"
        source_note = "Planned times from how often trains usually run (no live feed)"

    # If live trains were not retrieved (or unconfigured), plan departures from the usual frequency.
    # Train numbers come only from the live feed; planned trains have none.
    if not trains_list:
        for lid in active_line_ids:
            if lid not in seed.lines:
                continue
            line = seed.lines[lid]
            stations_seq = line["stations"]
            idx = stations_seq.index(sid) if sid in stations_seq else 0
            total_stns = len(stations_seq)
            is_fast = "FAST" in lid
            fast_slow_val: Literal["Fast", "Slow"] = "Fast" if is_fast else "Slow"

            # How the line runs right now (real time): frequency, or the first train of the morning
            run = service(line, now_mins, 6)
            headway = run.headway
            if not run.running:
                closed_lines += 1

            # Calculate cumulative run times
            run_mins = line.get("run_minutes", [2] * (total_stns - 1))

            # Direction 1: UP (towards South/Churchgate/CSMT)
            if idx > 0 and (direction is None or direction.lower() == "up"):
                dest_id = stations_seq[0]
                dest_name = seed.stations.get(dest_id, {}).get("name", "Churchgate" if "WR" in lid else "CSMT")
                src_name = seed.stations.get(stations_seq[-1], {}).get("name", "Origin")

                # Travel time from end terminus to current station
                travel_from_origin = sum(run_mins[idx:]) if idx < len(run_mins) else 10

                for i in range(1, 6):
                    # Deterministic departure offset based on headway
                    offset = run.offset(i)
                    dep_min = (now_mins + offset) % 1440
                    dh = dep_min // 60
                    dm = dep_min % 60
                    dep_str = f"{dh:02d}:{dm:02d}"
                    clock_12h = _format_12h(dep_str)
                    cd_str = wait_text(offset)

                    pf = "PF 1" if is_fast else ("PF 3" if "WR" in lid else "PF 1")
                    trains_list.append(LocalTrainDeparture(
                        train_number="",  # no real number without the live feed — never invent one
                        train_name=f"{dest_name} {fast_slow_val}",
                        line_id=lid,
                        line_name=line["name"],
                        fast_slow=fast_slow_val,
                        direction="up",
                        direction_label=f"UP (Towards {dest_name})",
                        source=src_name,
                        destination=dest_name,
                        scheduled_departure=dep_str,
                        expected_departure=dep_str,
                        departure_clock_12h=clock_12h,
                        countdown_min=offset,
                        countdown_str=cd_str,
                        combined_display=f"{clock_12h} · {cd_str}",
                        platform=pf,
                        delay_minutes=0,
                        status="scheduled",
                        is_live=False,
                        data_source="timetable",
                    ))

            # Direction 2: DOWN (towards North/Borivali/Thane/Vashi)
            if idx < total_stns - 1 and (direction is None or direction.lower() == "down"):
                dest_id = stations_seq[-1]
                dest_name = seed.stations.get(dest_id, {}).get("name", "Borivali" if "WR" in lid else ("Thane" if "CR" in lid else "Vashi"))
                src_name = seed.stations.get(stations_seq[0], {}).get("name", "Origin")

                for i in range(1, 6):
                    offset = run.offset(i, shift=1)
                    dep_min = (now_mins + offset) % 1440
                    dh = dep_min // 60
                    dm = dep_min % 60
                    dep_str = f"{dh:02d}:{dm:02d}"
                    clock_12h = _format_12h(dep_str)
                    cd_str = wait_text(offset)

                    pf = "PF 2" if is_fast else ("PF 4" if "WR" in lid else "PF 2")
                    trains_list.append(LocalTrainDeparture(
                        train_number="",  # no real number without the live feed — never invent one
                        train_name=f"{dest_name} {fast_slow_val}",
                        line_id=lid,
                        line_name=line["name"],
                        fast_slow=fast_slow_val,
                        direction="down",
                        direction_label=f"DOWN (Towards {dest_name})",
                        source=src_name,
                        destination=dest_name,
                        scheduled_departure=dep_str,
                        expected_departure=dep_str,
                        departure_clock_12h=clock_12h,
                        countdown_min=offset,
                        countdown_str=cd_str,
                        combined_display=f"{clock_12h} · {cd_str}",
                        platform=pf,
                        delay_minutes=0,
                        status="scheduled",
                        is_live=False,
                        data_source="timetable",
                    ))

    trains_list.sort(key=lambda x: (x.countdown_min, x.scheduled_departure))

    return LocalTrainsResponse(
        station_id=sid,
        station_name=stn_name,
        station_code=stn_code,
        line_id=line_id,
        direction=direction,
        as_of=now_hhmm,
        is_live=is_live,
        data_source=data_source,
        note=source_note if not closed_lines else "Not running right now (night hours). Showing the first services of the morning, planned from the usual timetable.",
        trains=trains_list[:limit],
    )


# ================================================================================================
# 2. BEST Bus Arrival Estimates
# ================================================================================================

@router.get("/bus/arrivals", response_model=BusArrivalsResponse)
def get_bus_arrivals(
    stop_id: str = Query(..., description="Bus stop ID, e.g. 'andheri_bus', 'csmt_bus', 'bandra_bus'"),
    route_id: str | None = Query(None, description="Optional route filter e.g. 'BEST_TODO_A'"),
    limit: int = Query(10, ge=1, le=30),
) -> BusArrivalsResponse:
    """Get upcoming bus arrival estimates with clock time and countdown (e.g. '4:18 PM · 6 min') from verified timetable.
    Strictly flags that live GPS telemetry is unavailable for BEST buses without fabricating real-time data."""
    seed = load_seed()
    clean_stop = stop_id.strip()

    matched_stop = None
    if clean_stop in seed.stations:
        matched_stop = seed.stations[clean_stop]
    else:
        for sid, s in seed.stations.items():
            if s.get("mode") == "bus" and (sid == clean_stop or clean_stop.lower() in s["name"].lower()):
                matched_stop = s
                break

    if not matched_stop:
        raise HTTPException(status_code=404, detail=f"Bus stop '{stop_id}' not found.")

    sid = matched_stop["id"]
    stop_name = matched_stop["name"]

    now_dt = board_now()
    now_mins = now_dt.hour * 60 + now_dt.minute
    now_hhmm = fmt_hhmm(now_dt)
    closed_lines = 0  # lines outside their service hours right now (night)

    # Find bus lines passing through this stop
    bus_lines = []
    for lid, line in seed.lines.items():
        if line.get("mode") == "bus":
            if sid in line.get("stations", []):
                if not route_id or line["id"] == route_id:
                    bus_lines.append(line)

    # Fallback to general bus lines if stop is a multimodal hub
    if not bus_lines:
        for lid, line in seed.lines.items():
            if line.get("mode") == "bus":
                if not route_id or line["id"] == route_id:
                    bus_lines.append(line)

    buses: list[BusArrivalEstimate] = []
    for line in bus_lines:
        stations_seq = line["stations"]
        idx = stations_seq.index(sid) if sid in stations_seq else 0
        dest_id = stations_seq[-1]
        dest_name = seed.stations.get(dest_id, {}).get("name", "Terminal")
        
        # Route name clean
        r_name = line.get("name", "BEST Route")
        # How the route runs right now (real time): frequency, or the first bus of the morning
        run = service(line, now_mins, 12)
        headway = run.headway
        if not run.running:
            closed_lines += 1

        # Calculate arrivals for next 3 cycles
        for step in (1, 2, 3):
            countdown = run.offset(step, min_gap=1)
            arr_min = (now_mins + countdown) % 1440
            ah = arr_min // 60
            am = arr_min % 60
            time_24h = f"{ah:02d}:{am:02d}"
            time_12h = _format_12h(time_24h)
            cd_str = wait_text(countdown)

            buses.append(BusArrivalEstimate(
                route_id=line["id"],
                route_name=r_name,
                operator=line.get("operator", "BEST"),
                destination=dest_name,
                direction=f"Towards {dest_name}",
                scheduled_time=time_24h,
                display_time_12h=time_12h,
                countdown_min=countdown,
                countdown_str=cd_str,
                combined_display=f"{time_12h} · {cd_str}",
                is_live=False,
                live_available=False,
                status_note="Scheduled • Live GPS unavailable",
            ))

    buses.sort(key=lambda b: b.countdown_min)

    return BusArrivalsResponse(
        stop_id=sid,
        stop_name=stop_name,
        as_of=now_hhmm,
        buses=buses[:limit],
        live_feed_status="unavailable",
        note="Planned times from how often each route usually runs. BEST bus GPS is not connected yet." + ("" if not closed_lines else " " + "Not running right now (night hours). Showing the first services of the morning, planned from the usual timetable."),
    )


# ================================================================================================
# 3. Dedicated Metro Line 1 & Line 3 Arrivals
# ================================================================================================

@router.get("/metro/arrivals", response_model=MetroArrivalsResponse)
def get_metro_arrivals(
    station_id: str = Query(..., description="Metro station ID, e.g. 'andheri_m1', 'marol_naka_m1', 'bkc_m3', 'cuffe_parade'"),
    line_id: str | None = Query(None, description="Optional metro line: 'METRO1' or 'METRO3'"),
    direction: str | None = Query(None, description="Optional direction: 'up' or 'down'"),
    limit: int = Query(10, ge=1, le=30),
) -> MetroArrivalsResponse:
    """Get verified timetable arrivals for Mumbai Metro (Line 1 Versova-Ghatkopar, Line 3 Aqua Line).
    Zero suburban local trains are mixed into these results."""
    seed = load_seed()
    clean_stn = station_id.strip()

    matched_stn = None
    if clean_stn in seed.stations:
        matched_stn = seed.stations[clean_stn]
    else:
        for sid, s in seed.stations.items():
            if s.get("mode") == "metro" and (sid == clean_stn or clean_stn.lower() in s["name"].lower()):
                matched_stn = s
                break

    if not matched_stn:
        raise HTTPException(status_code=404, detail=f"Metro station '{station_id}' not found.")

    sid = matched_stn["id"]
    stn_name = matched_stn["name"]

    now_dt = board_now()
    now_mins = now_dt.hour * 60 + now_dt.minute
    now_hhmm = fmt_hhmm(now_dt)
    closed_lines = 0  # lines outside their service hours right now (night)

    # Allowed metro lines
    metro_line_ids = ["METRO1", "METRO3"]
    if line_id:
        target_lid = line_id.strip().upper()
        if target_lid not in metro_line_ids:
            raise HTTPException(status_code=400, detail=f"Invalid metro line '{line_id}'. Allowed: {metro_line_ids}")
        active_lids = [target_lid]
    else:
        active_lids = [lid for lid in metro_line_ids if lid in seed.lines and sid in seed.lines[lid]["stations"]]
        if not active_lids:
            active_lids = ["METRO1"]

    trains: list[MetroArrivalEstimate] = []
    chosen_line_id = active_lids[0]
    line_data = seed.lines.get(chosen_line_id, {})
    line_name = line_data.get("name", "Mumbai Metro")
    operator = line_data.get("operator", "Metro Authority")

    for lid in active_lids:
        line = seed.lines.get(lid)
        if not line:
            continue
        stns = line["stations"]
        idx = stns.index(sid) if sid in stns else 0
        total_stns = len(stns)

        # Headway determination
        run = service(line, now_mins, 5)
        headway = run.headway
        frequency_note = f"Every {headway} min" if run.running else f"Not running now · first train {_format_12h(run.first)}"
        if not run.running:
            closed_lines += 1

        # Direction 1: Up (Towards terminal 0)
        if idx > 0 and (direction is None or direction.lower() == "up"):
            dest_id = stns[0]
            dest_name = seed.stations.get(dest_id, {}).get("name", "Terminal")
            for i in range(1, 5):
                offset = run.offset(i)
                arr_min = (now_mins + offset) % 1440
                ah = arr_min // 60
                am = arr_min % 60
                time_24h = f"{ah:02d}:{am:02d}"
                time_12h = _format_12h(time_24h)
                cd_str = wait_text(offset)

                trains.append(MetroArrivalEstimate(
                    line_id=lid,
                    line_name=line["name"],
                    operator=line.get("operator", operator),
                    station_id=sid,
                    station_name=stn_name,
                    destination=dest_name,
                    direction="up",
                    direction_label=f"Platform 1 (Towards {dest_name})",
                    scheduled_time=time_24h,
                    display_time_12h=time_12h,
                    countdown_min=offset,
                    countdown_str=cd_str,
                    combined_display=f"{time_12h} · {cd_str}",
                    platform="Platform 1",
                    headway_min=headway,
                    frequency_note=frequency_note,
                    is_live=False,
                ))

        # Direction 2: Down (Towards terminal -1)
        if idx < total_stns - 1 and (direction is None or direction.lower() == "down"):
            dest_id = stns[-1]
            dest_name = seed.stations.get(dest_id, {}).get("name", "Terminal")
            for i in range(1, 5):
                offset = run.offset(i, shift=1)
                arr_min = (now_mins + offset) % 1440
                ah = arr_min // 60
                am = arr_min % 60
                time_24h = f"{ah:02d}:{am:02d}"
                time_12h = _format_12h(time_24h)
                cd_str = wait_text(offset)

                trains.append(MetroArrivalEstimate(
                    line_id=lid,
                    line_name=line["name"],
                    operator=line.get("operator", operator),
                    station_id=sid,
                    station_name=stn_name,
                    destination=dest_name,
                    direction="down",
                    direction_label=f"Platform 2 (Towards {dest_name})",
                    scheduled_time=time_24h,
                    display_time_12h=time_12h,
                    countdown_min=offset,
                    countdown_str=cd_str,
                    combined_display=f"{time_12h} · {cd_str}",
                    platform="Platform 2",
                    headway_min=headway,
                    frequency_note=frequency_note,
                    is_live=False,
                ))

    trains.sort(key=lambda t: t.countdown_min)

    return MetroArrivalsResponse(
        station_id=sid,
        station_name=stn_name,
        line_id=chosen_line_id,
        line_name=line_name,
        as_of=now_hhmm,
        trains=trains[:limit],
        note="Metro times planned from how often each line runs at this hour." + ("" if not closed_lines else " " + "Not running right now (night hours). Showing the first services of the morning, planned from the usual timetable."),
    )


# ================================================================================================
# 4. Transit Network Metadata Helper
# ================================================================================================

@router.get("/lines")
def get_transit_lines() -> dict[str, Any]:
    """Get all categorized transit lines for Western, Central, Harbour, Metro, and BEST bus networks."""
    seed = load_seed()
    categories: dict[str, list[dict[str, Any]]] = {
        "local": [],
        "metro": [],
        "bus": [],
    }

    for lid, line in seed.lines.items():
        mode = line.get("mode", "local")
        entry = {
            "id": lid,
            "name": line.get("name", lid),
            "operator": line.get("operator", ""),
            "color": line.get("color", "#1976D2"),
            "stations_count": len(line.get("stations", [])),
            "stations": line.get("stations", []),
        }
        if mode in categories:
            categories[mode].append(entry)

    return {
        "ok": True,
        "lines": categories,
    }
