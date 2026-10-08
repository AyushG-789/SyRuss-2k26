"""Tools the chatbot can call. Every fact in a chat reply comes from one of these. SPEC.md §6.2.

Each tool returns small, plain JSON (no internal objects) so Gemini can read it and the number
check can compare the reply against it.
"""
from __future__ import annotations

from collections import Counter

from ..clock import clock, fmt_hhmm
from ..data_loader import load_typed_network
from ..places import resolve_lines, resolve_place, stop_ids_for
from ..replan.impact import route_hits, summarize
from ..replan.monitor import event_title, journeys
from ..routing.baseline import plan_baseline
from ..schemas import Event, Leg, Traveller
from ..verify.store import store

SHORT_LINE = {"WR_SLOW": "WR Slow", "WR_FAST": "WR Fast", "CR_SLOW": "CR Slow", "CR_FAST": "CR Fast",
              "HARBOUR": "Harbour", "METRO1": "Metro 1", "METRO3": "Metro 3"}
MODE_WORD = {"walk": "Walk", "taxi": "Taxi", "auto": "Auto", "cab": "Cab", "bus": "BEST bus", "ferry": "Ferry"}
ALL_MODES = ["local", "metro", "bus", "auto", "taxi", "cab"]
SOURCE_WORD = {"crowd": "commuter", "news": "news report", "official": "official notice", "weather": "weather alert"}
STATUS_WORD = {"confirmed": "confirmed", "possible": "possible (not yet confirmed)",
               "ignored": "not trusted (too little evidence)", "coordinated": "not trusted (looks like a fake burst of reports)",
               "expired": "over"}


def _route_text(legs: list[Leg]) -> str:
    parts: list[str] = []
    for leg in legs:
        if leg.line_id:
            name = "BEST bus" if leg.line_id.startswith("BEST") else SHORT_LINE.get(leg.line_id, leg.line_id)
        elif leg.mode == "walk":
            continue
        else:
            name = MODE_WORD.get(leg.mode, leg.mode)
        if not parts or parts[-1] != name:
            parts.append(name)
    return " → ".join(parts) or "Walk"


def _sources(ev: Event) -> str:
    """'3 commuters + 1 news report' (contradictions and the rain prior left out)."""
    counts = Counter(e.source_type for e in ev.evidence if not e.contradicts and e.source_type != "weather")
    bits = []
    for src in ("official", "news", "crowd"):
        n = counts.get(src, 0)
        if n:
            word = SOURCE_WORD[src]
            bits.append(f"{n} {word}{'' if n == 1 else 's'}")
    return " + ".join(bits) or "no sources"


def _event_json(ev: Event, net) -> dict:
    stations, lines, transfers, _ = net
    out = {
        "event_id": ev.event_id,
        "title": event_title(ev, stations, lines, transfers),
        "status": ev.status,
        "meaning": STATUS_WORD.get(ev.status, ev.status),
        "trust_pct": round(ev.confidence * 100),
        "sources": _sources(ev),
        "first_seen": ev.first_seen,
        "last_seen": ev.last_seen,
        "flags": ev.flags,
    }
    if ev.expected_delay_min:
        out["expected_delay_min"] = ev.expected_delay_min
    return out


# ---- Tools -------------------------------------------------------------------------------------
def plan_trip(origin: str, destination: str, leave_at: str | None = None, arrive_by: str | None = None,
              hard_deadline: bool = False, max_budget_inr: int | None = None, max_walk_min: int | None = None,
              max_transfers: int | None = None, priority: str = "balanced", modes: list[str] | None = None,
              step_free: bool = False, heavy_luggage: bool = False, avoid_crowds: bool = False,
              language: str = "en") -> dict:
    a, b = resolve_place(origin), resolve_place(destination)
    missing = [name for name, p in ((origin, a), (destination, b)) if p is None]
    if missing:
        return {"ok": False, "error": f"Unknown place(s): {', '.join(missing)}. Ask the traveller for a nearby station or landmark."}
    if a.label == b.label:
        return {"ok": False, "error": "Start and destination are the same place."}
    allowed = [m for m in (modes or ALL_MODES) if m in ALL_MODES] or ALL_MODES
    traveller = Traveller(
        traveller_id="CUSTOM", name="Your trip", origin=a, destination=b,
        leave_at=leave_at or (None if arrive_by else fmt_hhmm(clock.now())), arrive_by=arrive_by,
        hard_deadline=bool(hard_deadline and arrive_by), max_budget_inr=max_budget_inr,
        max_walk_min=15 if max_walk_min is None else max_walk_min, max_transfers=2 if max_transfers is None else max_transfers,
        priority=priority if priority in ("fastest", "cheapest", "fewest_transfers", "most_reliable", "balanced") else "balanced",
        modes_allowed=["walk", *allowed], step_free=step_free, heavy_luggage=heavy_luggage, avoid_crowds=avoid_crowds,
        language=language if language in ("en", "hi", "mr") else "en",
    )
    plan = plan_baseline(traveller)
    net = load_typed_network()
    _, lines, transfers, _ = net
    live = [e for e in store.events(clock.now()) if e.status in ("confirmed", "possible")]
    by_id = {e.event_id: e for e in live}
    cards = []
    for c in plan.cards:
        hits = route_hits(c.legs, live, traveller, lines, transfers)
        blocked, delay = summarize({i: [h for h in hs if by_id[h.event_id].status == "confirmed"] for i, hs in hits.items()})
        ids = sorted({h.event_id for hs in hits.values() for h in hs})
        cards.append({
            "label": c.label, "recommended": c.recommended, "route": _route_text(c.legs),
            "depart": c.legs[0].depart, "arrive": c.legs[-1].arrive, "duration_min": c.duration_min,
            "cost_inr": c.cost_inr, "changes": c.transfers, "walk_min": c.walk_min,
            "live_problems": [_event_json(by_id[i], net) | {"on_this_route": True} for i in ids],
            "blocked_by_confirmed_problem": blocked, "confirmed_extra_delay_min": delay,
        })
    return {
        "ok": True, "from": a.label, "to": b.label, "as_of": plan.as_of,
        "leave_at": traveller.leave_at, "arrive_by": traveller.arrive_by,
        "options": cards, "rejected_count": len(plan.rejected),
        "_traveller": traveller.model_dump(),
    }


def get_live_problems(line: str | None = None, station: str | None = None, include_untrusted: bool = True) -> dict:
    net = load_typed_network()
    line_ids = resolve_lines(line) if line else []
    stop_ids = stop_ids_for(station) if station else []
    if line and not line_ids:
        return {"ok": False, "error": f"Unknown line '{line}'. Known: Western, Central, Harbour, Metro 1, Metro 3, BEST."}
    if station and not stop_ids:
        return {"ok": False, "error": f"Unknown station '{station}'."}
    keep = {"confirmed", "possible"} | ({"ignored", "coordinated"} if include_untrusted else set())
    out = []
    for ev in store.events(clock.now()):
        if ev.status not in keep:
            continue
        aff = ev.affected
        if line_ids and not set(aff.line_ids) & set(line_ids):
            lines = net[1]
            if not any(set(lines[l].stations) & set(aff.stop_ids) for l in line_ids if l in lines):
                continue
        if stop_ids and not set(aff.stop_ids) & set(stop_ids):
            continue
        out.append(_event_json(ev, net))
    order = {"confirmed": 0, "possible": 1, "coordinated": 2, "ignored": 3}
    out.sort(key=lambda e: (order.get(e["status"], 9), -e["trust_pct"]))
    return {"ok": True, "now": fmt_hhmm(clock.now()), "line_ids": line_ids, "stop_ids": stop_ids,
            "problems": out[:8], "count": len(out)}


def explain_problem(event_id: str) -> dict:
    d = store.detail(event_id, clock.now())
    if not d:
        return {"ok": False, "error": f"No problem with id {event_id}."}
    net = load_typed_network()
    ev, br = d["event"], d["breakdown"]
    return {
        "ok": True, **_event_json(ev, net), "summary": br["summary"],
        "thresholds": {"confirmed_from_pct": 70, "possible_from_pct": 40},
        "evidence": [{"source": e["source_type"], "at": e["at"], "weight_pct": round(e["weight"] * 100),
                      "contradicts": e["contradicts"], "note": e["note"]} for e in br["evidence"][:10]],
    }


def get_my_journey(journey_id: str | None = None) -> dict:
    js = journeys.all()
    j = journeys.get(journey_id) if journey_id else (js[-1] if js else None)
    if not j:
        return {"ok": False, "error": "No saved trip yet. The traveller can press 'Start trip' on a route."}
    journeys.check()
    out = {"ok": True, "journey_id": j.journey_id, "status": j.status, "route": _route_text(j.card.legs),
           "depart": j.card.legs[0].depart, "arrive": j.card.legs[-1].arrive, "cost_inr": j.card.cost_inr,
           "notice": j.notice}
    if j.proposal:
        p = j.proposal
        out["replan_proposal"] = {"message": p.message, "new_route": _route_text(p.new_card.legs),
                                  "new_arrive": p.new_card.legs[-1].arrive, "change_min": p.delta["min"],
                                  "change_inr": p.delta["inr"]}
    return out


# ---- Gemini function declarations -----------------------------------------------------------
_STR = {"type": "string"}
_INT = {"type": "integer"}
_BOOL = {"type": "boolean"}

DECLARATIONS = [
    {"name": "plan_trip",
     "description": "Plan a trip in Mumbai between two places using local trains, metro, BEST buses, autos and taxis. "
                    "Returns up to 3 options (fastest/optimal/cheapest) with times, fares and live problems on each route.",
     "parameters": {"type": "object", "properties": {
         "origin": {**_STR, "description": "Start: station, landmark or area, e.g. 'Thane', 'Andheri station', 'Gateway of India'"},
         "destination": {**_STR, "description": "Destination, same style as origin"},
         "leave_at": {**_STR, "description": "Departure time HH:MM 24h. Omit for 'now'."},
         "arrive_by": {**_STR, "description": "Arrival target HH:MM 24h, if the traveller has one"},
         "hard_deadline": {**_BOOL, "description": "True if arriving late is not acceptable (exam, match, flight)"},
         "max_budget_inr": {**_INT, "description": "Maximum total fare in rupees"},
         "max_walk_min": {**_INT, "description": "Maximum total walking minutes (default 15)"},
         "max_transfers": {**_INT, "description": "Maximum number of vehicle changes (default 2)"},
         "priority": {"type": "string", "enum": ["fastest", "cheapest", "fewest_transfers", "most_reliable", "balanced"]},
         "modes": {"type": "array", "items": {"type": "string", "enum": ALL_MODES},
                   "description": "Allowed vehicles. Omit to allow all. Walking is always allowed."},
         "step_free": {**_BOOL, "description": "Needs lifts/ramps (wheelchair, stroller)"},
         "heavy_luggage": _BOOL, "avoid_crowds": _BOOL,
         "language": {"type": "string", "enum": ["en", "hi", "mr"]},
     }, "required": ["origin", "destination"]}},
    {"name": "get_live_problems",
     "description": "Live disruptions checked by Pakka Check (crowd reports + news + official notices), with trust %. "
                    "Filter by line and/or station. Includes reports that were NOT trusted, so you can say a rumour was ignored.",
     "parameters": {"type": "object", "properties": {
         "line": {**_STR, "description": "e.g. 'Metro 1', 'Western', 'Central fast', 'Harbour', 'Metro 3'"},
         "station": {**_STR, "description": "e.g. 'Dadar', 'Andheri', 'Saki Naka'"},
         "include_untrusted": _BOOL,
     }}},
    {"name": "explain_problem",
     "description": "Why Pakka Check trusts (or doesn't trust) one problem: every piece of evidence, its weight and the thresholds.",
     "parameters": {"type": "object", "properties": {"event_id": _STR}, "required": ["event_id"]}},
    {"name": "get_my_journey",
     "description": "The traveller's saved (started) trip: status, route, and any replan suggestion caused by a confirmed problem.",
     "parameters": {"type": "object", "properties": {"journey_id": _STR}}},
]

TOOLS = {"plan_trip": plan_trip, "get_live_problems": get_live_problems,
         "explain_problem": explain_problem, "get_my_journey": get_my_journey}
