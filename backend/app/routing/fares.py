"""Deterministic fare calculations for transit and last-mile legs. SPEC.md §5 and fares.yaml."""
from __future__ import annotations

import math
from typing import Sequence

from app.routing.models import FareConfig, FareSlabConfig, Line, Station
from app.schemas import Leg, Mode

AUTO_CUTOFF_LAT = 19.04  # Autos not allowed south of Bandra/Sion


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in kilometers."""
    p = math.pi / 180.0
    dlat = (lat2 - lat1) * p
    dlon = (lon2 - lon1) * p
    a = (math.sin(dlat / 2.0) ** 2
         + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin(dlon / 2.0) ** 2)
    return 2.0 * 6371.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))


def is_auto_allowed(lat1: float, lat2: float) -> bool:
    """Autos are forbidden if either end is south of Bandra/Sion (lat < 19.04)."""
    return lat1 >= AUTO_CUTOFF_LAT and lat2 >= AUTO_CUTOFF_LAT


def calculate_slab_fare(km: float, slab_cfg: FareSlabConfig) -> int:
    """Calculate fare for a given distance using slab progression."""
    for upper_km, fare in zip(slab_cfg.slabs_km, slab_cfg.fares_inr):
        if km <= upper_km:
            return fare
    return slab_cfg.fares_inr[-1]


def get_fare_system_for_line(line_id: str | None, mode: Mode, fare_cfg: FareConfig) -> tuple[str, FareSlabConfig] | None:
    """Find which transit fare slab applies to a given line/mode."""
    if line_id:
        for sys_name, cfg in fare_cfg.transit.items():
            if line_id in cfg.applies_to_lines:
                return sys_name, cfg
    for sys_name, cfg in fare_cfg.transit.items():
        if mode in cfg.applies_to_modes:
            return sys_name, cfg
    return None


def calculate_transit_km(
    from_id: str,
    to_id: str,
    line: Line,
    stations: dict[str, Station],
) -> float:
    """Calculate distance along the line between from_id and to_id."""
    if from_id not in line.stations or to_id not in line.stations:
        s1 = stations.get(from_id)
        s2 = stations.get(to_id)
        if s1 and s2:
            return haversine_km(s1.lat, s1.lon, s2.lat, s2.lon)
        return 0.0

    idx1 = line.stations.index(from_id)
    idx2 = line.stations.index(to_id)
    start_idx, end_idx = min(idx1, idx2), max(idx1, idx2)

    total_km = 0.0
    for i in range(start_idx, end_idx):
        st_a = stations[line.stations[i]]
        st_b = stations[line.stations[i + 1]]
        total_km += haversine_km(st_a.lat, st_a.lon, st_b.lat, st_b.lon)
    return total_km


def calculate_road_leg(
    mode: Mode,
    lat1: float,
    lon1: float,
    lat2: float,
    lon2: float,
    fare_cfg: FareConfig,
) -> tuple[int, int, int]:
    """Calculate (duration_min, cost_inr, distance_meters) for a road leg (auto, taxi, cab)."""
    raw_km = haversine_km(lat1, lon1, lat2, lon2)

    if mode == "auto":
        cfg = fare_cfg.auto
        road_km = raw_km * cfg.detour_factor
        duration_min = round(cfg.wait_min + (road_km / cfg.speed_kmh) * 60.0)
        if road_km <= cfg.min_km:
            cost = cfg.min_fare_inr
        else:
            cost = round(cfg.min_fare_inr + (road_km - cfg.min_km) * cfg.per_km_inr)
        return max(1, duration_min), cost, round(road_km * 1000)

    elif mode == "taxi":
        cfg = fare_cfg.taxi
        road_km = raw_km * cfg.detour_factor
        duration_min = round(cfg.wait_min + (road_km / cfg.speed_kmh) * 60.0)
        if road_km <= cfg.min_km:
            cost = cfg.min_fare_inr
        else:
            cost = round(cfg.min_fare_inr + (road_km - cfg.min_km) * cfg.per_km_inr)
        return max(1, duration_min), cost, round(road_km * 1000)

    elif mode == "cab":
        cfg = fare_cfg.cab
        road_km = raw_km * cfg.detour_factor
        drive_min = (road_km / cfg.speed_kmh) * 60.0
        duration_min = round(cfg.wait_min + drive_min)
        cost = round((cfg.base_inr + road_km * cfg.per_km_inr + duration_min * cfg.per_min_inr) * cfg.surge)
        return max(1, duration_min), cost, round(road_km * 1000)

    elif mode == "walk":
        cfg = fare_cfg.walk
        walk_km = raw_km * cfg.detour_factor
        duration_min = round((walk_km / cfg.speed_kmh) * 60.0)
        return duration_min, 0, round(walk_km * 1000)

    return 0, 0, 0


def calculate_leg_costs(
    legs: Sequence[Leg],
    stations: dict[str, Station],
    lines: dict[str, Line],
    fare_cfg: FareConfig,
    origin_coords: tuple[float, float] | None = None,
    destination_coords: tuple[float, float] | None = None,
) -> list[Leg]:
    """Calculate and assign cost_inr for each leg in a route.

    Applies through-ticketing when multiple transit legs share the same fare system.
    """
    updated_legs = [leg.model_copy() for leg in legs]
    same_system_ticket = fare_cfg.ticketing.get("same_system_through_ticket", True)

    # Group transit legs by fare system if through ticketing applies
    processed_indices: set[int] = set()
    i = 0
    while i < len(updated_legs):
        if i in processed_indices:
            i += 1
            continue

        leg = updated_legs[i]

        if leg.mode in {"walk", "transfer"}:
            leg.cost_inr = 0
            i += 1
            continue

        if leg.mode in {"auto", "taxi", "cab"}:
            p1 = _resolve_point(leg.from_id, stations, origin_coords, destination_coords)
            p2 = _resolve_point(leg.to_id, stations, origin_coords, destination_coords)
            if p1 and p2:
                _, cost, _ = calculate_road_leg(leg.mode, p1[0], p1[1], p2[0], p2[1], fare_cfg)
                leg.cost_inr = cost
            i += 1
            continue

        # Transit leg (local, metro, bus)
        sys_info = get_fare_system_for_line(leg.line_id, leg.mode, fare_cfg)
        if not sys_info:
            leg.cost_inr = 0
            i += 1
            continue

        sys_name, slab_cfg = sys_info

        if same_system_ticket:
            # Look ahead for all transit legs that belong to this same fare system
            same_sys_legs = [(i, leg)]
            j = i + 1
            while j < len(updated_legs):
                next_leg = updated_legs[j]
                if next_leg.mode in {"local", "metro", "bus"}:
                    next_sys = get_fare_system_for_line(next_leg.line_id, next_leg.mode, fare_cfg)
                    if next_sys and next_sys[0] == sys_name:
                        same_sys_legs.append((j, next_leg))
                j += 1

            total_km = 0.0
            for _, cur_leg in same_sys_legs:
                if cur_leg.line_id and cur_leg.line_id in lines:
                    line = lines[cur_leg.line_id]
                    km = calculate_transit_km(cur_leg.from_id, cur_leg.to_id, line, stations)
                else:
                    s1 = stations.get(cur_leg.from_id)
                    s2 = stations.get(cur_leg.to_id)
                    km = haversine_km(s1.lat, s1.lon, s2.lat, s2.lon) if s1 and s2 else 0.0
                total_km += km

            total_fare = calculate_slab_fare(total_km, slab_cfg)
            # Assign full ticket cost to the first leg, subsequent through-ticketed legs get 0
            for idx, (leg_idx, cur_leg) in enumerate(same_sys_legs):
                cur_leg.cost_inr = total_fare if idx == 0 else 0
                processed_indices.add(leg_idx)

            i += 1
        else:
            if leg.line_id and leg.line_id in lines:
                line = lines[leg.line_id]
                km = calculate_transit_km(leg.from_id, leg.to_id, line, stations)
            else:
                s1 = stations.get(leg.from_id)
                s2 = stations.get(leg.to_id)
                km = haversine_km(s1.lat, s1.lon, s2.lat, s2.lon) if s1 and s2 else 0.0
            leg.cost_inr = calculate_slab_fare(km, slab_cfg)
            i += 1

    return updated_legs


def _resolve_point(
    node_id: str,
    stations: dict[str, Station],
    origin_coords: tuple[float, float] | None,
    destination_coords: tuple[float, float] | None,
) -> tuple[float, float] | None:
    if node_id == "origin" and origin_coords:
        return origin_coords
    if node_id == "destination" and destination_coords:
        return destination_coords
    if node_id in stations:
        return stations[node_id].lat, stations[node_id].lon
    return None
