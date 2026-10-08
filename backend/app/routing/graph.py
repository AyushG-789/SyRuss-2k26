"""Multimodal transit graph construction and path extraction. SPEC.md §5.1."""
from __future__ import annotations

import math
from typing import Any

import networkx as nx

from app.routing.fares import (
    calculate_road_leg,
    haversine_km,
    is_auto_allowed,
)
from app.routing.models import FareConfig, Line, Station, Transfer
from app.schemas import Leg, Mode, Traveller


def add_minutes_hhmm(hhmm: str, minutes: int) -> str:
    h, m = map(int, hhmm.split(":"))
    total = h * 60 + m + minutes
    nh = (total // 60) % 24
    nm = total % 60
    return f"{nh:02d}:{nm:02d}"


def diff_minutes_hhmm(start: str, end: str) -> int:
    h1, m1 = map(int, start.split(":"))
    h2, m2 = map(int, end.split(":"))
    diff = (h2 * 60 + m2) - (h1 * 60 + m1)
    return diff if diff >= 0 else diff + 1440


def get_line_headway(line: Line, time_hhmm: str) -> int:
    """Lookup headway in minutes for a line at a given time."""
    try:
        h, m = map(int, time_hhmm.split(":"))
        cur_mins = h * 60 + m
    except Exception:
        return 8

    for band, hw in line.headway_min.items():
        try:
            parts = band.split("-")
            sh, sm = map(int, parts[0].split(":"))
            eh, em = map(int, parts[1].split(":"))
            start_mins = sh * 60 + sm
            end_mins = eh * 60 + em
            if start_mins <= cur_mins < end_mins or (end_mins == 24 * 60 and start_mins <= cur_mins <= end_mins):
                return hw
        except Exception:
            continue
    return list(line.headway_min.values())[0] if line.headway_min else 8


def build_multimodal_graph(
    stations: dict[str, Station],
    lines: dict[str, Line],
    transfers: dict[str, Transfer],
    fare_cfg: FareConfig,
    traveller: Traveller,
    departure_time: str,
) -> nx.DiGraph:
    """Build a directed multimodal graph for a specific trip and departure time."""
    G = nx.DiGraph()

    # 1. Physical station nodes
    for sid, st in stations.items():
        G.add_node(sid, node_type="station", name=st.name, mode=st.mode, lat=st.lat, lon=st.lon, step_free=st.step_free)

    # 2. Transit lines: Ride edges, Boarding edges, Alighting edges
    for lid, line in lines.items():
        # Check if line's mode is allowed by traveller
        if line.mode not in traveller.modes_allowed:
            continue

        headway = get_line_headway(line, departure_time)
        wait_min = max(1.0, headway / 2.0)
        st_list = line.stations
        runs = line.run_minutes

        # Direction 0: forward as listed in YAML
        # Direction 1: reverse
        for direction, seq, run_times in ((0, st_list, runs), (1, list(reversed(st_list)), list(reversed(runs)))):
            for i, sid in enumerate(seq):
                line_node = (lid, direction, sid)
                st = stations.get(sid)
                st_step_free = st.step_free if st else False

                G.add_node(line_node, node_type="transit_stop", line_id=lid, direction=direction, stop_id=sid)

                # Boarding edge: station -> line_node (wait time = headway / 2)
                # If traveller requires step_free, cannot board at non-step-free station
                if not traveller.step_free or st_step_free:
                    G.add_edge(
                        sid,
                        line_node,
                        edge_type="boarding",
                        line_id=lid,
                        mode=line.mode,
                        duration_min=wait_min,
                        cost_inr=0,
                        walk_m=0,
                        step_free=st_step_free,
                        weight_time=wait_min,
                        weight_cost=wait_min * 0.5,
                        weight_transfers=wait_min + 15.0,
                        weight_walk=wait_min,
                    )

                # Alighting edge: line_node -> station (duration 0)
                if not traveller.step_free or st_step_free:
                    G.add_edge(
                        line_node,
                        sid,
                        edge_type="alighting",
                        line_id=lid,
                        mode=line.mode,
                        duration_min=0.0,
                        cost_inr=0,
                        walk_m=0,
                        step_free=st_step_free,
                        weight_time=0.0,
                        weight_cost=0.0,
                        weight_transfers=0.0,
                        weight_walk=0.0,
                    )

                # Ride edge to next stop
                if i < len(seq) - 1:
                    next_sid = seq[i + 1]
                    next_node = (lid, direction, next_sid)
                    ride_min = float(run_times[i])

                    G.add_edge(
                        line_node,
                        next_node,
                        edge_type="ride",
                        line_id=lid,
                        mode=line.mode,
                        from_stop=sid,
                        to_stop=next_sid,
                        duration_min=ride_min,
                        cost_inr=0,
                        walk_m=0,
                        step_free=True,  # riding inside vehicle is step-free
                        weight_time=ride_min,
                        weight_cost=ride_min * 0.5,
                        weight_transfers=ride_min,
                        weight_walk=ride_min,
                    )

    # 3. Inter-station Transfers (from lines.yaml)
    for tid, t in transfers.items():
        if t.a not in stations or t.b not in stations:
            continue
        if traveller.step_free and not t.step_free:
            continue
        if "walk" not in traveller.modes_allowed:
            continue

        st_a = stations[t.a]
        st_b = stations[t.b]
        dist_m = round(haversine_km(st_a.lat, st_a.lon, st_b.lat, st_b.lon) * 1.3 * 1000)
        walk_min = float(t.walk_min)

        for u, v in ((t.a, t.b), (t.b, t.a)):
            G.add_edge(
                u,
                v,
                edge_type="transfer",
                transfer_id=t.id,
                mode="walk",
                duration_min=walk_min,
                cost_inr=0,
                walk_m=dist_m,
                step_free=t.step_free,
                weight_time=walk_min,
                weight_cost=walk_min * 0.5,
                weight_transfers=walk_min + 10.0,
                weight_walk=walk_min * 3.0,
            )

    # 4. Access & Egress connections
    orig = traveller.origin
    dest = traveller.destination
    if not dest:
        return G

    o_lat, o_lon = orig.lat, orig.lon
    d_lat, d_lon = dest.lat, dest.lon
    walk_speed = fare_cfg.walk.step_free_speed_kmh if (traveller.step_free or traveller.heavy_luggage) else fare_cfg.walk.speed_kmh

    G.add_node("origin", node_type="endpoint", lat=o_lat, lon=o_lon)
    G.add_node("destination", node_type="endpoint", lat=d_lat, lon=d_lon)

    direct_dist_km = haversine_km(o_lat, o_lon, d_lat, d_lon)

    # Direct walk from origin to destination
    if direct_dist_km <= 1.2 and "walk" in traveller.modes_allowed:
        walk_dur = max(1, round((direct_dist_km * fare_cfg.walk.detour_factor / walk_speed) * 60.0))
        dist_m = round(direct_dist_km * fare_cfg.walk.detour_factor * 1000)
        G.add_edge(
            "origin",
            "destination",
            edge_type="direct",
            mode="walk",
            from_stop="origin",
            to_stop="destination",
            duration_min=float(walk_dur),
            cost_inr=0,
            walk_m=dist_m,
            step_free=True,
            weight_time=float(walk_dur),
            weight_cost=walk_dur * 0.5,
            weight_transfers=float(walk_dur),
            weight_walk=walk_dur * 3.0,
        )

    # Direct road options (auto, taxi, cab) within 8 km
    if direct_dist_km <= 8.0:
        for mode in ("auto", "taxi", "cab"):
            if mode not in traveller.modes_allowed:
                continue
            if mode == "auto" and not is_auto_allowed(o_lat, d_lat):
                continue
            dur, cost, meters = calculate_road_leg(mode, o_lat, o_lon, d_lat, d_lon, fare_cfg)
            via_node = f"direct_{mode}"
            G.add_edge(
                "origin",
                via_node,
                edge_type="direct",
                mode=mode,
                from_stop="origin",
                to_stop="destination",
                duration_min=float(dur),
                cost_inr=cost,
                walk_m=0,
                step_free=True,
                weight_time=float(dur),
                weight_cost=dur * 0.5 + cost * 1.5,
                weight_transfers=float(dur),
                weight_walk=float(dur),
            )
            G.add_edge(via_node, "destination", edge_type="connector", duration_min=0.0, cost_inr=0, walk_m=0, weight_time=0.0, weight_cost=0.0, weight_transfers=0.0, weight_walk=0.0)

    # Access edges from origin to stations
    for sid, st in stations.items():
        if traveller.step_free and not st.step_free:
            continue

        d_o = haversine_km(o_lat, o_lon, st.lat, st.lon)

        # Walk access <= 1.2 km
        if d_o <= 1.2 and "walk" in traveller.modes_allowed:
            dur = max(0, round((d_o * fare_cfg.walk.detour_factor / walk_speed) * 60.0))
            dist_m = round(d_o * fare_cfg.walk.detour_factor * 1000)
            node_key = f"acc_walk_{sid}"
            G.add_edge(
                "origin",
                node_key,
                edge_type="access",
                mode="walk",
                from_stop="origin",
                to_stop=sid,
                duration_min=float(dur),
                cost_inr=0,
                walk_m=dist_m,
                step_free=st.step_free,
                weight_time=float(dur),
                weight_cost=dur * 0.5,
                weight_transfers=float(dur),
                weight_walk=dur * 3.0,
            )
            G.add_edge(node_key, sid, edge_type="connector", duration_min=0.0, cost_inr=0, walk_m=0, weight_time=0.0, weight_cost=0.0, weight_transfers=0.0, weight_walk=0.0)

        # Road access <= 8.0 km
        if d_o <= 8.0:
            for mode in ("auto", "taxi", "cab"):
                if mode not in traveller.modes_allowed:
                    continue
                if mode == "auto" and not is_auto_allowed(o_lat, st.lat):
                    continue
                dur, cost, _ = calculate_road_leg(mode, o_lat, o_lon, st.lat, st.lon, fare_cfg)
                node_key = f"acc_{mode}_{sid}"
                G.add_edge(
                    "origin",
                    node_key,
                    edge_type="access",
                    mode=mode,
                    from_stop="origin",
                    to_stop=sid,
                    duration_min=float(dur),
                    cost_inr=cost,
                    walk_m=0,
                    step_free=st.step_free,
                    weight_time=float(dur),
                    weight_cost=dur * 0.5 + cost * 1.5,
                    weight_transfers=float(dur),
                    weight_walk=float(dur),
                )
                G.add_edge(node_key, sid, edge_type="connector", duration_min=0.0, cost_inr=0, walk_m=0, weight_time=0.0, weight_cost=0.0, weight_transfers=0.0, weight_walk=0.0)

    # Egress edges from stations to destination
    for sid, st in stations.items():
        if traveller.step_free and not st.step_free:
            continue

        d_d = haversine_km(st.lat, st.lon, d_lat, d_lon)

        # Walk egress <= 1.2 km
        if d_d <= 1.2 and "walk" in traveller.modes_allowed:
            dur = max(0, round((d_d * fare_cfg.walk.detour_factor / walk_speed) * 60.0))
            dist_m = round(d_d * fare_cfg.walk.detour_factor * 1000)
            node_key = f"egr_walk_{sid}"
            G.add_edge(
                sid,
                node_key,
                edge_type="egress",
                mode="walk",
                from_stop=sid,
                to_stop="destination",
                duration_min=float(dur),
                cost_inr=0,
                walk_m=dist_m,
                step_free=st.step_free,
                weight_time=float(dur),
                weight_cost=dur * 0.5,
                weight_transfers=float(dur),
                weight_walk=dur * 3.0,
            )
            G.add_edge(node_key, "destination", edge_type="connector", duration_min=0.0, cost_inr=0, walk_m=0, weight_time=0.0, weight_cost=0.0, weight_transfers=0.0, weight_walk=0.0)

        # Road egress <= 8.0 km
        if d_d <= 8.0:
            for mode in ("auto", "taxi", "cab"):
                if mode not in traveller.modes_allowed:
                    continue
                if mode == "auto" and not is_auto_allowed(st.lat, d_lat):
                    continue
                dur, cost, _ = calculate_road_leg(mode, st.lat, st.lon, d_lat, d_lon, fare_cfg)
                node_key = f"egr_{mode}_{sid}"
                G.add_edge(
                    sid,
                    node_key,
                    edge_type="egress",
                    mode=mode,
                    from_stop=sid,
                    to_stop="destination",
                    duration_min=float(dur),
                    cost_inr=cost,
                    walk_m=0,
                    step_free=st.step_free,
                    weight_time=float(dur),
                    weight_cost=dur * 0.5 + cost * 1.5,
                    weight_transfers=float(dur),
                    weight_walk=float(dur),
                )
                G.add_edge(node_key, "destination", edge_type="connector", duration_min=0.0, cost_inr=0, walk_m=0, weight_time=0.0, weight_cost=0.0, weight_transfers=0.0, weight_walk=0.0)

    return G


def extract_legs_from_path(
    G: nx.DiGraph,
    path: list[Any],
    start_time: str,
    stations: dict[str, Station],
    lines: dict[str, Line],
) -> list[Leg]:
    """Compress a raw graph path into a sequence of concrete Leg objects with departure and arrival times."""
    raw_edges: list[dict[str, Any]] = []
    for i in range(len(path) - 1):
        u = path[i]
        v = path[i + 1]
        raw_edges.append(G.get_edge_data(u, v))

    legs: list[Leg] = []
    current_time = start_time

    i = 0
    while i < len(raw_edges):
        edge = raw_edges[i]
        edge_type = edge.get("edge_type")

        # Skip connectors (0-weight helpers)
        if edge_type == "connector":
            i += 1
            continue

        # Direct journey (walk, auto, taxi, cab from origin to destination)
        if edge_type == "direct":
            dur = max(1, round(edge["duration_min"]))
            arr = add_minutes_hhmm(current_time, dur)
            legs.append(
                Leg(
                    mode=edge["mode"],
                    line_id=None,
                    from_id="origin",
                    to_id="destination",
                    depart=current_time,
                    arrive=arr,
                    duration_min=dur,
                    cost_inr=edge.get("cost_inr", 0),
                    walk_m=edge.get("walk_m", 0),
                    step_free=edge.get("step_free", True),
                )
            )
            current_time = arr
            i += 1
            continue

        # Access leg (origin to station)
        if edge_type == "access":
            dur = round(edge["duration_min"])
            to_stop = edge["to_stop"]
            if dur > 0:
                arr = add_minutes_hhmm(current_time, dur)
                legs.append(
                    Leg(
                        mode=edge["mode"],
                        line_id=None,
                        from_id="origin",
                        to_id=to_stop,
                        depart=current_time,
                        arrive=arr,
                        duration_min=dur,
                        cost_inr=edge.get("cost_inr", 0),
                        walk_m=edge.get("walk_m", 0),
                        step_free=edge.get("step_free", True),
                    )
                )
                current_time = arr
            i += 1
            continue

        # Egress leg (station to destination)
        if edge_type == "egress":
            dur = round(edge["duration_min"])
            from_stop = edge["from_stop"]
            if dur > 0:
                arr = add_minutes_hhmm(current_time, dur)
                legs.append(
                    Leg(
                        mode=edge["mode"],
                        line_id=None,
                        from_id=from_stop,
                        to_id="destination",
                        depart=current_time,
                        arrive=arr,
                        duration_min=dur,
                        cost_inr=edge.get("cost_inr", 0),
                        walk_m=edge.get("walk_m", 0),
                        step_free=edge.get("step_free", True),
                    )
                )
                current_time = arr
            i += 1
            continue

        # Station-to-station Transfer
        if edge_type == "transfer":
            dur = max(1, round(edge["duration_min"]))
            arr = add_minutes_hhmm(current_time, dur)
            u_node = path[i]
            v_node = path[i + 1]
            legs.append(
                Leg(
                    mode="walk",
                    line_id=None,
                    from_id=str(u_node),
                    to_id=str(v_node),
                    depart=current_time,
                    arrive=arr,
                    duration_min=dur,
                    cost_inr=0,
                    walk_m=edge.get("walk_m", 0),
                    step_free=edge.get("step_free", False),
                )
            )
            current_time = arr
            i += 1
            continue

        # Boarding edge followed by ride edges
        if edge_type == "boarding":
            wait_min = round(edge["duration_min"])
            depart_train_time = add_minutes_hhmm(current_time, wait_min)

            line_id = edge["line_id"]
            line = lines.get(line_id)
            from_station = path[i]  # the station we boarded at

            # Accumulate consecutive ride edges on this same line
            ride_dur = 0
            to_station = from_station
            j = i + 1
            while j < len(raw_edges):
                next_edge = raw_edges[j]
                if next_edge.get("edge_type") == "ride" and next_edge.get("line_id") == line_id:
                    ride_dur += round(next_edge["duration_min"])
                    to_station = next_edge["to_stop"]
                    j += 1
                elif next_edge.get("edge_type") == "alighting" and next_edge.get("line_id") == line_id:
                    j += 1
                    break
                else:
                    break

            total_dur = wait_min + ride_dur
            arr_train_time = add_minutes_hhmm(depart_train_time, ride_dur)

            st_from = stations.get(from_station)
            st_to = stations.get(to_station)
            step_free = (st_from.step_free if st_from else False) and (st_to.step_free if st_to else False)

            legs.append(
                Leg(
                    mode=line.mode if line else "local",
                    line_id=line_id,
                    from_id=str(from_station),
                    to_id=str(to_station),
                    depart=depart_train_time,
                    arrive=arr_train_time,
                    duration_min=ride_dur,
                    cost_inr=0,  # calculated via fares.py
                    walk_m=0,
                    step_free=step_free,
                )
            )
            current_time = arr_train_time
            i = j
            continue

        i += 1

    return legs
