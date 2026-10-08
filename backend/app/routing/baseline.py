"""Baseline schedule-only router. SPEC.md §5.2, §5.3, §5.4."""
from __future__ import annotations

import networkx as nx

from app.clock import clock, fmt_hhmm
from app.data_loader import load_typed_network
from app.routing.fares import calculate_leg_costs
from app.routing.graph import (
    build_multimodal_graph,
    diff_minutes_hhmm,
    extract_legs_from_path,
)
from app.routing.scorer import ScoredCandidate, build_route_cards
from app.schemas import Leg, PlanResponse, RejectedOption, Traveller


def summarize_legs(legs: list[Leg]) -> str:
    """Short readable summary of a route."""
    main_parts = []
    for leg in legs:
        if leg.line_id:
            main_parts.append(leg.line_id)
        elif leg.mode in {"auto", "taxi", "cab"}:
            main_parts.append(leg.mode.capitalize())
        elif leg.mode == "walk" and not main_parts:
            main_parts.append("Walk")
    if not main_parts:
        return "Walk route"
    return "Via " + " -> ".join(main_parts)


def plan_baseline(
    traveller: Traveller,
    departure_time: str | None = None,
) -> PlanResponse:
    """Generate baseline (schedule-only) route cards for a traveller."""
    if not traveller.destination:
        return PlanResponse(
            cards=[],
            rejected=[RejectedOption(summary="Trip request", reason="No destination specified (use /itinerary for multi-stop day trips)")],
            as_of=departure_time or fmt_hhmm(clock.now()),
        )

    dep_time = departure_time or traveller.leave_at or fmt_hhmm(clock.now())
    stations, lines, transfers, fares = load_typed_network()

    G = build_multimodal_graph(stations, lines, transfers, fares, traveller, dep_time)

    # 1. Search candidate paths under 4 weightings
    weightings = ("weight_time", "weight_cost", "weight_transfers", "weight_walk")
    raw_paths = []
    for w in weightings:
        try:
            generator = nx.shortest_simple_paths(G, "origin", "destination", weight=w)
            for _, path in zip(range(8), generator):
                raw_paths.append(path)
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            continue

    # 2. Extract legs, deduplicate by leg sequence
    unique_candidates: list[list[Leg]] = []
    seen_signatures: set[tuple] = set()

    orig_coords = (traveller.origin.lat, traveller.origin.lon)
    dest_coords = (traveller.destination.lat, traveller.destination.lon)

    for path in raw_paths:
        legs = extract_legs_from_path(G, path, dep_time, stations, lines)
        if not legs:
            continue

        legs = calculate_leg_costs(legs, stations, lines, fares, orig_coords, dest_coords)

        # Signature: sequence of (mode, line_id, from_id, to_id)
        sig = tuple((leg.mode, leg.line_id, leg.from_id, leg.to_id) for leg in legs)
        if sig in seen_signatures:
            continue
        seen_signatures.add(sig)
        unique_candidates.append(legs)

    # 3. Apply Hard Filters (SPEC §5.3)
    surviving: list[ScoredCandidate] = []
    rejected: list[RejectedOption] = []

    for idx, legs in enumerate(unique_candidates):
        summary = summarize_legs(legs)

        # Calculate metrics
        dur = diff_minutes_hhmm(legs[0].depart, legs[-1].arrive)
        cost = sum(leg.cost_inr for leg in legs)
        walk_min = sum(leg.duration_min for leg in legs if leg.mode == "walk")
        vehicle_legs = [leg for leg in legs if leg.mode != "walk"]
        num_transfers = max(0, len(vehicle_legs) - 1)
        final_arrive = legs[-1].arrive

        # Filter A: Modes allowed
        disallowed_mode = next((leg.mode for leg in legs if leg.mode not in traveller.modes_allowed), None)
        if disallowed_mode:
            rejected.append(RejectedOption(summary=summary, reason=f"Uses mode '{disallowed_mode}' not in allowed modes"))
            continue

        # Filter B: Step-free requirement
        if traveller.step_free and any(not leg.step_free for leg in legs):
            rejected.append(RejectedOption(summary=summary, reason="Not step-free (requires stairs or non-accessible interchange)"))
            continue

        # Filter C: Budget
        if traveller.max_budget_inr is not None and cost > traveller.max_budget_inr:
            rejected.append(RejectedOption(summary=summary, reason=f"Over budget (est. {cost} rupees > {traveller.max_budget_inr})"))
            continue

        # Filter D: Hard deadline
        if traveller.hard_deadline and traveller.arrive_by and final_arrive > traveller.arrive_by:
            rejected.append(RejectedOption(summary=summary, reason=f"Arrives at {final_arrive}, after strict deadline {traveller.arrive_by}"))
            continue

        # Filter E: Max walking time
        if traveller.max_walk_min is not None and walk_min > traveller.max_walk_min:
            rejected.append(RejectedOption(summary=summary, reason=f"Walking time {walk_min} min exceeds max {traveller.max_walk_min} min"))
            continue

        # Filter F: Max transfers
        if traveller.max_transfers is not None and num_transfers > traveller.max_transfers:
            rejected.append(RejectedOption(summary=summary, reason=f"Requires {num_transfers} transfers, exceeding max {traveller.max_transfers}"))
            continue

        surviving.append(
            ScoredCandidate(
                plan_id=f"c_{idx}",
                legs=legs,
                duration_min=dur,
                cost_inr=cost,
                transfers=num_transfers,
                walk_min=walk_min,
                reliability=1.0,  # Schedule-only baseline has 100% baseline reliability
                risk_delay_min=0.0,
            )
        )

    # 4. Score and select top 3 cards
    cards = build_route_cards(surviving, traveller.priority)

    return PlanResponse(
        cards=cards,
        rejected=rejected,
        destination=traveller.destination,
        as_of=dep_time,
    )
