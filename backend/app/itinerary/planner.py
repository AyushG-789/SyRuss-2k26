"""Day planner (A9): best order for up to 5 stops in one day. SPEC.md §9.

- Try every order of the chosen stops (≤ 120) and every choice of optional stops.
- Travel time/cost between places come from the router (schedule-only estimate for the search,
  then the real disruption-aware route for the chosen order).
- Each visit must fit the place's opening hours and not fall on a closed day; a stop with
  `fixed_time` (e.g. Marine Drive at sunset) must be reached by then and starts then.
- Objective: travel minutes + 0.2 × cost(₹) − 10 × optional stops kept; ties → more slack.
"""
from __future__ import annotations

from app.i18n import T, tr

from datetime import date
from functools import lru_cache
from itertools import combinations, permutations

from app.clock import clock
from app.config import settings
from app.data_loader import load_seed
from app.routing.aware import plan_aware
from app.routing.baseline import plan_baseline
from app.routing.fares import haversine_km
from app.routing.text import route_text
from app.schemas import Place, RouteCard, Traveller
from app.verify.store import active_events

NEARBY_KM = 1.0   # a station-wide problem (waterlogging, crowding…) this close to a stop gets a warning

DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
TIGHT_SLACK_MIN = 10


def _m(hhmm: str) -> int:
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def _t(minutes: int) -> str:
    return f"{(minutes // 60) % 24:02d}:{minutes % 60:02d}"


def _hours(poi: dict, weekday: str) -> tuple[int, int] | None:
    """Opening window in minutes for the day, or None if closed."""
    if weekday in [d.lower() for d in poi.get("closed_on", [])]:
        return None
    spec = poi.get("hours", {})
    value = spec.get(weekday) or spec.get(weekday[:3]) or spec.get("all") or "24h"
    if value in ("24h", "open"):
        return 0, 24 * 60
    if value == "closed":
        return None
    a, b = value.split("-")
    return _m(a), _m(b)


def _place(poi_id: str, poi: dict) -> Place:
    return Place(label=poi["name"], lat=poi["lat"], lon=poi["lon"], poi_id=poi_id)


def _best_card(cards: list[RouteCard]) -> RouteCard | None:
    return next((c for c in cards if c.recommended), cards[0] if cards else None)


def _hop(traveller: Traveller, a: Place, b: Place, depart: str, aware: bool) -> RouteCard | None:
    t = traveller.model_copy(update={"origin": a, "destination": b, "leave_at": depart, "arrive_by": None,
                                     "hard_deadline": False, "itinerary": None})
    plan = plan_aware(t, depart) if aware else plan_baseline(t, depart)
    return _best_card(plan.cards)


@lru_cache(maxsize=512)
def _estimate(key: str, a: tuple, b: tuple, depart: str) -> tuple[int, int] | None:
    """(minutes, ₹) between two places — schedule-only, cached for the order search."""
    traveller = Traveller.model_validate_json(key)
    card = _hop(traveller, Place(label=a[0], lat=a[1], lon=a[2]), Place(label=b[0], lat=b[1], lon=b[2]), depart, aware=False)
    return (card.duration_min, card.cost_inr) if card else None


def _nearby_problems(a: Place, b: Place, depart: str) -> list[dict]:
    """Station-wide problems (no line named, e.g. waterlogging at CSMT) near either end of a hop.
    They don't change the plan — 'possible' isn't enough — but the family should know."""
    stations = load_seed().stations
    out = []
    for ev in active_events():
        if ev.affected.line_ids or ev.affected.transfer_ids or depart < ev.first_seen:
            continue  # line problems are handled by routing; earlier hops weren't affected
        for sid in ev.affected.stop_ids:
            st = stations.get(sid)
            if st and min(haversine_km(st["lat"], st["lon"], p.lat, p.lon) for p in (a, b)) <= NEARBY_KM:
                out.append({"event_id": ev.event_id, "type": ev.type, "status": ev.status,
                            "confidence": ev.confidence, "near": st["name"]})
                break
    return out


def plan_itinerary(traveller: Traveller, on: date | None = None) -> dict:
    it = traveller.itinerary
    lang = traveller.language
    if not it or not it.stops:
        return {"feasible": False, "error": tr(lang, "it.no_stops")}
    pois = load_seed().pois
    unknown = [s.poi_id for s in it.stops if s.poi_id not in pois]
    if unknown:
        return {"feasible": False, "error": tr(lang, "it.unknown", ids=", ".join(unknown))}
    weekday = DAYS[(on or date.fromisoformat(settings.demo_date)).weekday()]
    day_start, day_end = _m(it.day_start), _m(it.day_end)
    search_key = traveller.model_copy(update={"itinerary": None}).model_dump_json()
    start_place = traveller.origin
    as_tuple = lambda p: (p.label, p.lat, p.lon)  # noqa: E731

    stops = {s.poi_id: s for s in it.stops}
    must = [s.poi_id for s in it.stops if s.must_visit]
    optional = [s.poi_id for s in it.stops if not s.must_visit]
    closed = [pid for pid in stops if _hours(pois[pid], weekday) is None]

    def simulate(order: tuple[str, ...]):
        """Walk the order with estimated hops. Returns (objective, slack_min, rows) or None."""
        now, here, travel, cost, rows, min_slack = day_start, start_place, 0, 0, [], 10_000
        for pid in order:
            poi, s = pois[pid], stops[pid]
            hours = _hours(poi, weekday)
            if hours is None:
                return None
            dest = _place(pid, poi)
            est = _estimate(search_key, as_tuple(here), as_tuple(dest), _t(now))
            if est is None:
                return None
            arrive = now + est[0]
            start = max(arrive, hours[0])
            if s.fixed_time:
                if arrive > _m(s.fixed_time):
                    return None
                start = _m(s.fixed_time)
            visit = s.visit_min or poi.get("visit_min", 30)
            leave = start + visit
            if leave > hours[1] or leave > day_end:
                return None
            slack = min(hours[1] - leave, day_end - leave, (_m(s.fixed_time) - arrive) if s.fixed_time else 10_000)
            min_slack = min(min_slack, slack)
            rows.append((pid, arrive, start, leave, slack))
            travel, cost, now, here = travel + est[0], cost + est[1], leave, dest
        if traveller.max_budget_inr is not None and cost > traveller.max_budget_inr:
            return None
        kept_optional = sum(1 for pid in order if pid in optional)
        return travel + 0.2 * cost - 10 * kept_optional, min_slack, rows

    def search(chosen_sets):
        best = None
        for chosen in chosen_sets:
            for order in permutations(chosen):
                r = simulate(order)
                if r and (best is None or (r[0], -r[1]) < (best[0], -best[1])):
                    best = (*r, order)
        return best

    open_stops = [pid for pid in stops if pid not in closed]
    best = None
    partial = False
    # 1. All must-visits + as many optional stops as fit (more optional stops are always better).
    if not any(pid in closed for pid in must):
        for k in range(len(optional), -1, -1):
            best = search([[*must, *extra] for extra in combinations([o for o in optional if o not in closed], k)])
            if best:
                break
    # 2. The must-visits can't all fit: plan the largest set of stops that DOES fit (must-visits first)
    #    and explain each one that was left out.
    if best is None:
        partial = True
        n_must = lambda c: sum(1 for pid in c if pid in must)  # noqa: E731
        subsets = [c for k in range(len(open_stops), 0, -1) for c in combinations(open_stops, k)]
        # Keep as many must-visit stops as possible first, then as many stops in total.
        for key in sorted({(n_must(c), len(c)) for c in subsets}, reverse=True):
            best = search([c for c in subsets if (n_must(c), len(c)) == key])
            if best:
                break

    def why_not(pid: str, kept: tuple[str, ...]) -> str:
        """Plain reason a stop was left out."""
        poi, s = pois[pid], stops[pid]
        name = poi["name"]
        day = lambda d: tr(lang, f"day.{d.lower()}")  # noqa: E731
        if pid in closed:
            days = ", ".join(day(d) for d in poi.get("closed_on", [])) or day(weekday)
            return tr(lang, "why.closed", name=name, today=day(weekday), days=days)
        opens, closes = _hours(poi, weekday)
        visit = s.visit_min or poi.get("visit_min", 30)
        est = _estimate(search_key, as_tuple(start_place), as_tuple(_place(pid, poi)), _t(day_start))
        if est is None:
            return tr(lang, "why.no_route", name=name)
        earliest = day_start + est[0]
        hours_txt = (tr(lang, "hours.24") if closes - opens >= 1440
                     else tr(lang, "hours.range", opens=_t(opens), closes=_t(closes)))
        fixed = s.fixed_time
        if fixed and _m(fixed) < day_start:
            return tr(lang, "why.before_start", name=name, fixed=fixed, start=it.day_start)
        if fixed and earliest > _m(fixed):
            return tr(lang, "why.too_late", name=name, fixed=fixed, earliest=_t(earliest))
        if fixed and _m(fixed) >= day_end:
            return tr(lang, "why.after_end", name=name, fixed=fixed, end=it.day_end)
        if fixed and _m(fixed) + visit > day_end:
            return tr(lang, "why.fixed_overrun", name=name, fixed=fixed, visit=visit,
                      until=_t(_m(fixed) + visit), end=it.day_end)
        if max(earliest, opens) + visit > closes:
            return tr(lang, "why.closes", name=name, closes=_t(closes), visit=visit,
                      by=_t(closes - visit), earliest=_t(earliest))
        if max(earliest, opens) + visit > day_end:
            return tr(lang, "why.day_end", name=name, visit=visit, end=it.day_end)
        if traveller.max_budget_inr is not None and est[1] > traveller.max_budget_inr:
            return tr(lang, "why.budget", name=name, cost=est[1], max=traveller.max_budget_inr)
        others = [pois[k]["name"] for k in kept]
        with_txt = tr(lang, "why.together", names=", ".join(others[:3])) if others else ""
        return tr(lang, "why.no_room", name=name, with_=with_txt, start=it.day_start, end=it.day_end,
                  hours=hours_txt, visit=visit)

    if best is None:
        return {"feasible": False, "error": tr(lang, "it.none_fit"),
                "dropped": [{"poi_id": pid, "name": pois[pid]["name"], "must_visit": stops[pid].must_visit,
                             "reason": why_not(pid, ())} for pid in stops],
                "closed_today": closed}

    # Real, disruption-aware routes for the chosen order, at their real departure times.
    _, _, rows, order = best
    out, now, here, total_travel, total_cost, warnings = [], day_start, start_place, 0, 0, []
    for pid, *_ in rows:
        poi, s = pois[pid], stops[pid]
        hours = _hours(poi, weekday)
        dest = _place(pid, poi)
        card = _hop(traveller, here, dest, _t(now), aware=True)
        if card is None:
            return {"feasible": False, "error": tr(lang, "it.no_route_to", name=poi["name"])}
        arrive = _m(card.legs[-1].arrive)
        start = max(arrive, hours[0])
        if s.fixed_time:
            start = max(start, _m(s.fixed_time))
        visit = s.visit_min or poi.get("visit_min", 30)
        leave = start + visit
        slack = min(hours[1] - leave, day_end - leave, (_m(s.fixed_time) - arrive) if s.fixed_time else 10_000)
        problems = sorted({i for l in card.legs for i in l.event_ids})
        if problems:
            warnings.append(tr(lang, "warn.problems", name=poi["name"], ids=", ".join(problems),
                               rel=round(card.reliability * 100)))
        nearby = _nearby_problems(here, dest, card.legs[0].depart)
        for n in nearby:
            kind = tr(lang, f"kind.{n['type']}") if f"kind.{n['type']}" in T else n["type"].replace("_", " ")
            status = tr(lang, f"status.{n['status']}") if f"status.{n['status']}" in T else n["status"]
            warnings.append(tr(lang, "warn.nearby", name=poi["name"], status=status, kind=kind, near=n["near"],
                               pct=round(n["confidence"] * 100)))
        out.append({
            "poi_id": pid, "name": poi["name"], "must_visit": s.must_visit, "fixed_time": s.fixed_time,
            "opens": _t(hours[0]) if hours[1] - hours[0] < 1440 else None,
            "closes": _t(hours[1]) if hours[1] - hours[0] < 1440 else None,
            "arrive": _t(arrive), "visit_start": _t(start), "leave": _t(leave), "wait_min": start - arrive,
            "visit_min": visit, "slack_min": min(slack, 999), "tight": slack < TIGHT_SLACK_MIN,
            "leg": {"route": route_text(card.legs, lang), "depart": card.legs[0].depart, "arrive": card.legs[-1].arrive,
                    "duration_min": card.duration_min, "cost_inr": card.cost_inr, "reliability": card.reliability,
                    "event_ids": problems, "nearby": nearby, "card": card.model_dump()},
        })
        total_travel += card.duration_min
        total_cost += card.cost_inr
        now, here = leave, dest

    dropped = [{"poi_id": pid, "name": pois[pid]["name"], "must_visit": stops[pid].must_visit,
                "reason": why_not(pid, tuple(order))}
               for pid in stops if pid not in order]
    return {
        "feasible": True, "partial": partial, "weekday": weekday, "day_start": it.day_start, "day_end": it.day_end,
        "stops": out, "dropped": dropped, "total_travel_min": total_travel, "total_cost_inr": total_cost,
        "ends_at": out[-1]["leave"], "orders_tried": "every order of the chosen stops (≤ 120)",
        "warnings": warnings, "as_of": clock.now().strftime("%H:%M"),
    }
