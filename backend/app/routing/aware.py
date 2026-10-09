"""Disruption-aware planning (A5). SPEC.md §4.6, §5.4.

Same search as the schedule-only planner, plus Pakka Check's live events:
- **confirmed** closure / mega block (and lift outage for step-free travellers): those connections
  are removed from the graph before the search, so real alternatives are found; any candidate that
  still touches one is rejected with the reason;
- **confirmed** delay / waterlogging / crowding: the minutes are added to the hit leg (and every
  later leg moves too), and boarding that line costs extra in the search;
- **possible** events don't change the route, they add risk:
  `leg.risk = max(confidence × impact)`, `reliability = Π(1 − leg.risk)`,
  expected delay for scoring = Σ risk × the event's delay.
Impact: closure 1.0 · delay 0.6 · lift_out 1.0 if step-free else 0.1 · waterlogging 0.5 on
walk/road legs (0.2 otherwise) · crowding 0.2.
"""
from __future__ import annotations

from app.i18n import tr

from datetime import datetime

import networkx as nx

from app.clock import clock
from app.data_loader import load_typed_network
from app.replan.impact import leg_hit, touches
from app.routing.baseline import plan_baseline
from app.routing.graph import add_minutes_hhmm
from app.schemas import Event, Leg, PlanResponse, Traveller
from app.verify.store import active_events

ROAD_MODES = {"walk", "bus", "auto", "taxi", "cab"}


def impact(ev: Event, leg: Leg, traveller: Traveller) -> float:
    if ev.type in ("closure", "mega_block"):
        return 1.0
    if ev.type == "lift_out":
        return 1.0 if (traveller.step_free or traveller.heavy_luggage) else 0.1
    if ev.type == "waterlogging":
        return 0.5 if leg.mode in ROAD_MODES else 0.2
    if ev.type == "crowding":
        return 0.2
    if ev.type in ("delay", "diversion"):
        return 0.6
    return 0.0


def _delay_of(ev: Event) -> int:
    return ev.expected_delay_min or (15 if ev.type == "delay" else 10 if ev.type == "waterlogging" else 0)


class Effects:
    """Pakka Check events turned into graph edits + per-candidate adjustments."""

    def __init__(self, traveller: Traveller, events: list[Event]):
        self.traveller = traveller
        self.events = [e for e in events if e.status in ("confirmed", "possible")]
        self.confirmed = [e for e in self.events if e.status == "confirmed"]
        self.stations, self.lines, self.transfers, _ = load_typed_network()

    # ---- before the search ------------------------------------------------------------------
    def _blocks(self, ev: Event) -> bool:
        if ev.type in ("closure", "mega_block"):
            return True
        return ev.type == "lift_out" and (self.traveller.step_free or self.traveller.heavy_luggage)

    def edit_graph(self, G: nx.DiGraph) -> None:
        drop = []
        for u, v, data in G.edges(data=True):
            et = data.get("edge_type")
            for ev in self.confirmed:
                aff = ev.affected
                if self._blocks(ev):
                    if aff.transfer_ids:
                        if et == "transfer" and data.get("transfer_id") in aff.transfer_ids:
                            drop.append((u, v))
                        continue  # a closed foot-overbridge doesn't stop trains
                    if et in ("boarding", "alighting"):
                        stop = u if et == "boarding" else v
                        line_ok = not aff.line_ids or data.get("line_id") in aff.line_ids
                        if line_ok and (not aff.stop_ids or stop in aff.stop_ids):
                            if aff.stop_ids or (aff.line_ids and ev.type != "lift_out"):
                                drop.append((u, v))
                elif ev.type in ("delay",) and et == "boarding" and data.get("line_id") in aff.line_ids:
                    d = float(_delay_of(ev))
                    data["weight_time"] = data.get("weight_time", 0) + d
                    data["weight_cost"] = data.get("weight_cost", 0) + d * 0.5
        G.remove_edges_from(set(drop))

    # ---- each candidate ---------------------------------------------------------------------
    def apply(self, legs: list[Leg]) -> tuple[list[Leg], float, float, str | None]:
        """(legs with times/risk/event_ids, reliability, expected extra minutes, blocked_by)."""
        out: list[Leg] = []
        shift = 0
        reliability = 1.0
        risk_delay = 0.0
        for leg in legs:
            ids: list[str] = []
            risk = 0.0
            extra = 0
            for ev in self.events:
                if not touches(leg, ev, self.lines, self.transfers):
                    continue
                hit = leg_hit(leg, ev, self.traveller, self.lines, self.transfers)
                if hit is None:
                    continue
                if ev.status == "confirmed" and hit.blocked:
                    return legs, 0.0, 0.0, _title(ev, self.stations, self.lines, self.transfers)
                ids.append(ev.event_id)
                risk = max(risk, ev.confidence * impact(ev, leg, self.traveller))
                if ev.status == "confirmed":
                    extra = max(extra, hit.delay_min or _delay_of(ev))
                else:
                    risk_delay += ev.confidence * impact(ev, leg, self.traveller) * _delay_of(ev)
            depart = add_minutes_hhmm(leg.depart, shift)
            shift += extra
            arrive = add_minutes_hhmm(leg.arrive, shift)
            out.append(leg.model_copy(update={
                "depart": depart, "arrive": arrive, "duration_min": leg.duration_min + extra,
                "event_ids": sorted({*leg.event_ids, *ids}), "risk": round(risk, 3),
            }))
            reliability *= 1.0 - risk
        return out, round(reliability, 3), round(risk_delay, 1), None


def _title(ev: Event, stations, lines, transfers, lang: str = "en") -> str:
    from app.replan.monitor import event_title  # local: monitor imports routing
    return event_title(ev, stations, lines, transfers, lang)


def plan_aware(traveller: Traveller, departure_time: str | None = None,
               now: datetime | None = None, events: list[Event] | None = None) -> PlanResponse:
    """Route cards that take Pakka Check's live events into account (SPEC §5.4)."""
    evs = active_events(now or clock.now()) if events is None else events
    fx = Effects(traveller, evs)
    plan = plan_baseline(traveller, departure_time, effects=fx)
    notes = list(plan.notes)
    lang = traveller.language
    # Say what was avoided: confirmed blocking problems the schedule-only plan would have used.
    if any(fx._blocks(e) for e in fx.confirmed):
        base = plan_baseline(traveller, departure_time)
        for ev in fx.confirmed:
            if fx._blocks(ev) and any(touches(l, ev, fx.lines, fx.transfers) for c in base.cards for l in c.legs):
                notes.append(tr(lang, "note.avoided", title=_title(ev, fx.stations, fx.lines, fx.transfers, lang),
                                pct=round(ev.confidence * 100)))
    for ev in fx.events:
        if any(ev.event_id in l.event_ids for c in plan.cards for l in c.legs):
            notes.append(tr(lang, "note.included" if ev.status == "confirmed" else "note.risk",
                            title=_title(ev, fx.stations, fx.lines, fx.transfers, lang), pct=round(ev.confidence * 100)))
    return plan.model_copy(update={"notes": notes})
