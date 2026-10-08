"""Saved journeys + replan monitor (B9). SPEC.md §8.

1. A traveller saves the card they chose (POST /journeys).
2. `check(now)` looks at every journey that isn't finished. If a CONFIRMED event hits a leg the
   traveller hasn't completed yet, we replan from their position (the start of that first
   unfinished leg) and store a proposal. "Possible" events never trigger a replan.
3. Nothing changes until the traveller accepts. Reject keeps the old plan. Both are logged.

Until routing reads Pakka Check itself (A5), alternatives come from the schedule-only planner and
are checked here against the same events: blocked options are dropped, delays are added.
"""
from __future__ import annotations

import threading
import uuid
from datetime import datetime

from ..clock import clock, fmt_hhmm
from ..data_loader import load_typed_network
from ..routing.baseline import plan_baseline, summarize_legs
from ..routing.text import route_text
from ..routing.graph import add_minutes_hhmm, diff_minutes_hhmm
from ..schemas import Event, Journey, JourneyLogEntry, Leg, LegHit, Place, ReplanProposal, RouteCard, Traveller
from ..verify.store import active_events
from .impact import Hit, route_hits, summarize

MIN_GAIN_MIN = 3        # a delayed (not blocked) route is only swapped if this many minutes are saved
DELAY_NOTICE_MIN = 5    # smaller confirmed delays are not worth bothering the traveller about


def _status(card: RouteCard, now: str) -> str:
    if not card.legs or now >= card.legs[-1].arrive:
        return "completed"
    return "upcoming" if now < card.legs[0].depart else "active"


def _first_open_leg(card: RouteCard, now: str) -> int | None:
    return next((i for i, leg in enumerate(card.legs) if leg.arrive > now), None)


def _mins(hhmm: str) -> int:
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def _later(a: str, b: str) -> str:
    return a if a >= b else b


def _mark(card: RouteCard, hits: dict[int, list[Hit]], events: dict[str, Event]) -> RouteCard:
    """Copy of the card with each hit leg carrying its event ids and risk (for the UI)."""
    legs = []
    for i, leg in enumerate(card.legs):
        hs = hits.get(i, [])
        ids = sorted({*leg.event_ids, *(h.event_id for h in hs)})
        risk = max([leg.risk, *(events[h.event_id].confidence for h in hs if h.event_id in events)])
        legs.append(leg.model_copy(update={"event_ids": ids, "risk": risk}))
    return card.model_copy(update={"legs": legs})


def _join(done: list[Leg], new: RouteCard, label: str, plan_id: str,
          pivot_stop: str | None = None, committed_delay: int = 0) -> RouteCard:
    """Completed legs + the new route, with the totals recomputed.

    The new route was planned from the traveller's position, so its "origin" is that station: name
    it (otherwise the UI shows the trip's original start). A delay on the ride they're already on is
    added to that ride, so the times read straight through.
    """
    done = list(done)
    if committed_delay and done:
        last = done[-1]
        done[-1] = last.model_copy(update={"arrive": add_minutes_hhmm(last.arrive, committed_delay),
                                           "duration_min": last.duration_min + committed_delay})
    new_legs = [
        leg.model_copy(update={"from_id": pivot_stop if leg.from_id == "origin" else leg.from_id})
        for leg in new.legs
    ] if pivot_stop else list(new.legs)
    legs = [*done, *new_legs]
    vehicles = [leg for leg in legs if leg.mode != "walk"]
    return new.model_copy(update={
        "plan_id": plan_id,
        "label": label,
        "legs": legs,
        "duration_min": diff_minutes_hhmm(legs[0].depart, legs[-1].arrive),
        "cost_inr": sum(leg.cost_inr for leg in legs),
        "transfers": max(0, len(vehicles) - 1),
        "walk_min": sum(leg.duration_min for leg in legs if leg.mode == "walk"),
    })


def _signature(legs: list[Leg]) -> tuple:
    return tuple((leg.mode, leg.line_id, leg.from_id, leg.to_id) for leg in legs)


def event_title(ev: Event, stations: dict, lines: dict, transfers: dict) -> str:
    """e.g. 'Dadar foot-overbridge (FOB) closure', 'Metro Line 1 delay at Saki Naka'."""
    kind = {"lift_out": "lift outage", "crowding": "heavy crowding", "mega_block": "mega block"}.get(ev.type, ev.type)
    aff = ev.affected
    vias = [transfers[t].via for t in aff.transfer_ids if t in transfers and transfers[t].via]
    if vias:
        return f"{vias[0]} {kind}"
    line = next((lines[l].name for l in aff.line_ids if l in lines), None)
    stop = next((stations[s].name for s in aff.stop_ids if s in stations), None)
    if line and stop:
        return f"{line} {kind} at {stop}"
    return f"{line or stop} {kind}" if (line or stop) else kind


class JourneyStore:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._journeys: dict[str, Journey] = {}

    def reset(self) -> None:
        with self._lock:
            self._journeys.clear()

    # ---- CRUD ------------------------------------------------------------------------------
    def save(self, traveller: Traveller, card: RouteCard, now: datetime | None = None) -> Journey:
        at = fmt_hhmm(now or clock.now())
        j = Journey(
            journey_id=f"J_{uuid.uuid4().hex[:8]}",
            traveller=traveller,
            card=card,
            status=_status(card, at),
            saved_at=at,
            log=[JourneyLogEntry(at=at, kind="saved", detail=f"{card.label}: {summarize_legs(card.legs)}")],
        )
        with self._lock:
            self._journeys[j.journey_id] = j
        return j

    def get(self, journey_id: str) -> Journey | None:
        return self._journeys.get(journey_id)

    def all(self) -> list[Journey]:
        return list(self._journeys.values())

    def decide(self, journey_id: str, accept: bool, now: datetime | None = None) -> Journey | None:
        at = fmt_hhmm(now or clock.now())
        with self._lock:
            j = self._journeys.get(journey_id)
            if not j or not j.proposal:
                return j
            p = j.proposal
            if accept:
                j.card = p.new_card
                j.notice = None
            j.handled_event_ids = sorted({*j.handled_event_ids, *p.event_ids})
            j.log.append(JourneyLogEntry(
                at=at, kind="accepted" if accept else "rejected", event_ids=p.event_ids,
                detail=f"{p.delta['min']:+d} min, {p.delta['inr']:+d} rupees" if accept else "kept the original plan",
            ))
            j.proposal = None
            j.status = _status(j.card, at)
            return j

    # ---- Monitor ---------------------------------------------------------------------------
    def check(self, now: datetime | None = None) -> list[Journey]:
        """Re-check every unfinished journey. Returns the journeys that got a NEW proposal or notice."""
        now = now or clock.now()
        live = active_events(now)
        confirmed = [e for e in live if e.status == "confirmed"]
        changed = []
        with self._lock:
            for j in self._journeys.values():
                at = fmt_hhmm(now)
                j.status = _status(j.card, at)
                j.live_hits = self._live_hits(j, live, at)
                if j.status == "completed":
                    j.proposal = None
                    continue
                if self._check_one(j, confirmed, now):
                    changed.append(j)
        return changed

    def _live_hits(self, j: Journey, live: list[Event], at: str) -> list[LegHit]:
        """Every confirmed/possible problem on a leg the traveller hasn't finished (for the UI)."""
        start = _first_open_leg(j.card, at)
        if start is None:
            return []
        stations, lines, transfers, _ = load_typed_network()
        by_id = {e.event_id: e for e in live}
        open_hits = route_hits(j.card.legs[start:], live, j.traveller, lines, transfers)
        out = []
        for i, hs in sorted(open_hits.items()):
            for h in hs:
                ev = by_id[h.event_id]
                out.append(LegHit(leg_idx=start + i, event_id=ev.event_id, status=ev.status,
                                  title=event_title(ev, stations, lines, transfers), confidence=ev.confidence,
                                  blocked=h.blocked, delay_min=h.delay_min))
        return out

    def _check_one(self, j: Journey, confirmed: list[Event], now: datetime) -> bool:
        at = fmt_hhmm(now)
        start = _first_open_leg(j.card, at)
        if start is None:
            return False
        stations, lines, transfers, _ = load_typed_network()
        by_id = {e.event_id: e for e in confirmed}

        open_legs = j.card.legs[start:]
        hits = {start + i: hs for i, hs in route_hits(open_legs, confirmed, j.traveller, lines, transfers).items()}
        new_ids = sorted({h.event_id for hs in hits.values() for h in hs} - set(j.handled_event_ids))
        if j.proposal and set(j.proposal.event_ids) >= set(new_ids):
            return False  # already asked about these
        if not new_ids:
            return False

        old_blocked, old_delay = summarize(hits)
        if not old_blocked and old_delay < DELAY_NOTICE_MIN:
            return False
        titles = ", ".join(event_title(by_id[i], stations, lines, transfers) for i in new_ids if i in by_id)

        # Replan from the traveller's position: the start of the first unfinished leg. If they are
        # already riding a train/bus, they stay on it, so the new route starts where it stops.
        first = j.card.legs[start]
        riding = first.mode != "walk" and first.depart <= at
        commit = start + 1 if riding else start
        if commit >= len(j.card.legs):
            return False  # last leg is underway; nothing left to change
        pivot = j.card.legs[commit]
        if pivot.from_id == "origin":
            origin = j.traveller.origin
        else:
            st = stations[pivot.from_id]
            origin = Place(label=st.name, lat=st.lat, lon=st.lon)
        done = j.card.legs[:commit]
        committed_delay = summarize({i: hs for i, hs in hits.items() if i < commit})[1]
        spent = sum(leg.cost_inr for leg in done)
        budget = None if j.traveller.max_budget_inr is None else max(0, j.traveller.max_budget_inr - spent)
        here = j.traveller.model_copy(update={"origin": origin, "max_budget_inr": budget})
        depart = add_minutes_hhmm(_later(at, pivot.depart), committed_delay)
        open_legs = j.card.legs[commit:]

        old_arrive = add_minutes_hhmm(j.card.legs[-1].arrive, old_delay)
        best: tuple[str, int, RouteCard] | None = None
        from ..routing.aware import plan_aware  # local: aware imports this module's helpers
        for card in plan_aware(here, departure_time=depart, now=now).cards:
            if _signature(card.legs) == _signature(open_legs):
                continue
            blocked, delay = summarize(route_hits(card.legs, confirmed, here, lines, transfers))
            if blocked:
                continue
            arrive = add_minutes_hhmm(card.legs[-1].arrive, delay)  # departs after committed delay
            key = (arrive, card.cost_inr)
            if best is None or key < (best[0], best[1]):
                best = (arrive, card.cost_inr, card)

        worth_it = best is not None and (old_blocked or _mins(best[0]) - _mins(old_arrive) <= -MIN_GAIN_MIN)
        if not worth_it:
            j.handled_event_ids = sorted({*j.handled_event_ids, *new_ids})
            j.notice = (f"Confirmed {titles} on your route. No working alternative was found within your limits."
                        if old_blocked else
                        f"Confirmed {titles} on your route (about +{old_delay} min). Your route is still the best option.")
            j.log.append(JourneyLogEntry(at=at, kind="notice", event_ids=new_ids, detail=j.notice))
            return True

        arrive, _, alt = best
        pivot_stop = None if pivot.from_id == "origin" else pivot.from_id
        new_card = _join(done, alt, j.card.label, f"{j.card.plan_id}_r{len(j.log)}", pivot_stop, committed_delay)
        # Compared with what the traveller would have got: the delayed arrival, or (if the route is
        # unusable) the arrival they were originally promised.
        delta = {"min": _mins(arrive) - _mins(j.card.legs[-1].arrive if old_blocked else old_arrive),
                 "inr": new_card.cost_inr - j.card.cost_inr}
        late = j.traveller.arrive_by and arrive > j.traveller.arrive_by
        message = (f"Confirmed {titles}. "
                   + ("Your planned route can't be used. " if old_blocked else f"Your route is about {old_delay} min slower. ")
                   + f"New route from {origin.label}: {route_text(alt.legs)}, arriving {arrive}"
                   + (f" (after your {j.traveller.arrive_by} target)." if late else "."))
        j.proposal = ReplanProposal(
            proposal_id=f"P_{uuid.uuid4().hex[:8]}",
            created_at=at,
            event_ids=new_ids,
            affected_leg_idx=sorted(hits),
            from_label=origin.label,
            old_card=_mark(j.card, hits, by_id),
            new_card=new_card,
            delta=delta,
            old_blocked=old_blocked,
            message=message,
        )
        j.notice = None
        j.log.append(JourneyLogEntry(at=at, kind="proposed", event_ids=new_ids, detail=message))
        return True


journeys = JourneyStore()
