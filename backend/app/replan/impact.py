"""Does a Pakka Check event hit a leg of a saved journey, and how badly? SPEC.md §4.6, §8.

Matching rules (kept in step with the frontend's network view):
- Transfer events (e.g. the Dadar FOB) hit ONLY the transfer walk between those two stops,
  never trains that merely pass through the station.
- Line events hit rides on that line; with stops too, only rides whose stretch includes a stop.
- Stop-only events hit rides passing that stop and walks/rides starting or ending there.
- lift_out only matters to step-free / heavy-luggage travellers, at boarding/alighting stops.
"""
from __future__ import annotations

from dataclasses import dataclass

from ..routing.models import Line, Transfer
from ..schemas import Event, Leg, Traveller

BLOCKING_TYPES = {"closure", "mega_block"}
IGNORED_TYPES = {"running_normally", "not_a_disruption"}
ROAD_MODES = {"bus", "auto", "taxi", "cab"}


@dataclass(frozen=True)
class Hit:
    event_id: str
    blocked: bool
    delay_min: int


def ride_stops(leg: Leg, lines: dict[str, Line]) -> list[str]:
    """Stops a ride leg passes, ends included (works in either direction)."""
    line = lines.get(leg.line_id or "")
    if not line or leg.from_id not in line.stations or leg.to_id not in line.stations:
        return [leg.from_id, leg.to_id]
    a, b = line.stations.index(leg.from_id), line.stations.index(leg.to_id)
    lo, hi = min(a, b), max(a, b)
    return line.stations[lo : hi + 1]


def _transfer_pair(transfers: dict[str, Transfer], tid: str) -> set[str]:
    t = transfers.get(tid)
    return {t.a, t.b} if t else set()


def touches(leg: Leg, ev: Event, lines: dict[str, Line], transfers: dict[str, Transfer]) -> bool:
    aff = ev.affected
    ends = {leg.from_id, leg.to_id}

    if aff.transfer_ids:
        if leg.mode != "walk" or leg.line_id:
            return False
        return any(ends == _transfer_pair(transfers, tid) for tid in aff.transfer_ids)

    if ev.type == "lift_out":
        return bool(ends & set(aff.stop_ids))

    if leg.line_id:
        if aff.line_ids and leg.line_id not in aff.line_ids:
            return False
        if aff.stop_ids:
            return bool(set(ride_stops(leg, lines)) & set(aff.stop_ids))
        return bool(aff.line_ids)

    # Walks, autos, taxis and other legs without a line: only their end stops.
    return bool(ends & set(aff.stop_ids))


def leg_hit(leg: Leg, ev: Event, traveller: Traveller,
            lines: dict[str, Line], transfers: dict[str, Transfer]) -> Hit | None:
    if ev.type in IGNORED_TYPES or not touches(leg, ev, lines, transfers):
        return None
    if ev.type in BLOCKING_TYPES:
        return Hit(ev.event_id, True, 0)
    if ev.type == "lift_out":
        needs_lift = traveller.step_free or traveller.heavy_luggage
        return Hit(ev.event_id, True, 0) if needs_lift else None
    if ev.type == "crowding" and not (traveller.avoid_crowds or traveller.heavy_luggage):
        return None
    if ev.type == "diversion" and leg.mode not in ROAD_MODES:
        return None
    return Hit(ev.event_id, False, ev.expected_delay_min)


def route_hits(legs: list[Leg], events: list[Event], traveller: Traveller,
               lines: dict[str, Line], transfers: dict[str, Transfer]) -> dict[int, list[Hit]]:
    """{leg index: hits} for every leg that at least one event touches."""
    out: dict[int, list[Hit]] = {}
    for i, leg in enumerate(legs):
        hits = [h for ev in events if (h := leg_hit(leg, ev, traveller, lines, transfers))]
        if hits:
            out[i] = hits
    return out


def summarize(hits: dict[int, list[Hit]]) -> tuple[bool, int]:
    """(blocked?, total extra minutes) for a set of hits."""
    flat = [h for hs in hits.values() for h in hs]
    per_event: dict[str, int] = {}
    for h in flat:  # one event touching two legs delays the trip once
        per_event[h.event_id] = max(per_event.get(h.event_id, 0), h.delay_min)
    return any(h.blocked for h in flat), sum(per_event.values())
