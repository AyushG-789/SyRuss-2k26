"""Transparency (B10), evaluation (A10) and the day planner (A9). SPEC.md §9, §10, §12."""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from ..clock import clock, fmt_hhmm
from ..config import settings
from ..data_loader import load_seed
from ..eval.run_eval import run_eval
from ..itinerary.planner import plan_itinerary
from ..replan.monitor import journeys
from ..schemas import Traveller
from ..verify import policy
from ..verify.store import store

router = APIRouter(tags=["insights"])

ASSUMPTIONS = [
    "The demo runs on a simulated clock (one Tuesday, 2026-10-20, 16:30–18:30) so the story can be replayed; every page uses that clock.",
    "Crowd reports R01–R30, news N01–N04 and official notices O01–O05 are SYNTHETIC (written for the demo) and labelled 'mock'. Live news/weather feeds are switchable (NEWS_MODE / WEATHER_MODE) but off by default.",
    "Train times come from line run-times and headways (expected wait = half the headway), not a live GTFS-RT feed. Mumbai doesn't publish one for suburban rail.",
    "Station coordinates are from OpenStreetMap. Fares follow published slabs (local, metro, BEST, auto/taxi meter) and are marked 'verify' until checked against current tariffs.",
    "BEST bus routes in the network are placeholders (BEST_TODO_A–E) until real route numbers are confirmed.",
    "Positions on Live Trip Tracking come from the timetable and the demo clock, not GPS.",
    "A problem changes routes only when Pakka Check confirms it (≥ 70%). 'Possible' problems (40–69%) only lower a route's reliability; anything below 40% is ignored.",
    "Brand-new or low-reputation accounts count very little (0.05), and a burst of near-identical new-account reports counts once, so a coordinated fake campaign can't confirm a problem.",
    "The chatbot (Gemini) only words answers; every time, fare and trust % comes from TravelBuddy's own tools, and a number check rejects any number that didn't come from them.",
]


def _verify_flags() -> dict:
    seed = load_seed()
    count = lambda d: sum(1 for v in (d.values() if isinstance(d, dict) else d) if isinstance(v, dict) and v.get("verify"))  # noqa: E731
    return {"lines": count(seed.lines), "pois": count(seed.pois),
            "note": "Items marked verify: true still need checking against an official source (timings, fares, hours)."}


@router.get("/transparency")
def transparency() -> dict:
    """Everything a judge needs to check how TravelBuddy decides: sources, weights, thresholds,
    assumptions, data counts, and the live event log with each verdict explained."""
    seed = load_seed()
    now = clock.now()
    events = []
    for ev in store.events(now):
        d = store.detail(ev.event_id, now)
        events.append({
            "event_id": ev.event_id, "type": ev.type, "status": ev.status, "confidence": ev.confidence,
            "first_seen": ev.first_seen, "last_seen": ev.last_seen, "expires_at": ev.expires_at,
            "flags": ev.flags, "summary": d["breakdown"]["summary"] if d else "",
            "affected": ev.affected.model_dump(),
        })
    decisions = [{"journey_id": j.journey_id, "traveller": j.traveller.name, **e.model_dump()}
                 for j in journeys.all() for e in j.log if e.kind != "saved"]
    return {
        "as_of": fmt_hhmm(now),
        "sources": [
            {"id": "crowd", "name": "Commuter reports", "weight": policy.SOURCE_WEIGHT["crowd"],
             "how": "Report page, Live Trip 'Report Issue', 'I see this too'. Weight 0.25 × (0.5 + reputation), max 0.35.",
             "data": f"{len(seed.reports)} seeded demo reports + whatever is reported live", "mode": "live in the app"},
            {"id": "news", "name": "News", "weight": policy.SOURCE_WEIGHT["news"],
             "how": "Mumbai news items matched to a line/station.", "data": f"{len(seed.news)} synthetic items (news_mock.json)",
             "mode": settings.news_mode},
            {"id": "official", "name": "Official notices (CR / WR / MMRDA / BEST)", "weight": policy.SOURCE_WEIGHT["official"],
             "how": "Railway / metro notices. Highest trust; a 'running normally' notice can cancel weaker claims.",
             "data": f"{len(seed.official)} synthetic notices (official_mock.json)", "mode": settings.official_mode},
            {"id": "weather", "name": "Weather (IMD / Open-Meteo)", "weight": policy.SOURCE_WEIGHT["weather"],
             "how": "Heavy rain adds a small prior to waterlogging reports only; never confirms anything alone.",
             "data": "1 synthetic IMD orange alert", "mode": settings.weather_mode},
        ],
        "policy": policy.as_dict(),
        "formula": "support = 1 − Π(1 − weight × freshness) over supporting sources; confidence = support × (1 − contradiction). "
                   "Freshness = 1 for 15 min, then exp(−(age − 15) / τ).",
        "routing": {
            "baseline": "Schedule-only: what a normal app shows (reports ignored).",
            "aware": "Confirmed closures removed before the search, confirmed delays added, possible problems lower reliability "
                     "(risk = confidence × impact; reliability = Π(1 − risk)).",
            "replan": "A confirmed problem on a leg you haven't finished → new route from where you are; nothing changes until you accept.",
        },
        "assumptions": ASSUMPTIONS,
        "data": {"stations": len(seed.stations), "lines": len(seed.lines), "pois": len(seed.pois),
                 "transfers": len(seed.transfers), "reporters": len(seed.reporters), "verify_flags": _verify_flags()},
        "ai": {"chatbot": "Google Gemini" if settings.gemini_api_key else "off (no key) — rule-based answers",
               "model": settings.gemini_model, "number_check": True,
               "fallback": "If Gemini is slow or offline, answers come straight from live data (English / हिंदी / मराठी)."},
        "event_log": events,
        "decisions": decisions,
    }


@router.get("/eval")
def evaluation(refresh: bool = False) -> dict:
    """Schedule-only vs TravelBuddy on the demo day, scored against what really happened (§12)."""
    return run_eval(refresh=refresh)


class ItineraryIn(BaseModel):
    traveller: Traveller


@router.post("/itinerary")
def itinerary(body: ItineraryIn) -> dict:
    """Best order for a multi-stop day (§9): opening hours, fixed times, live problems on each hop."""
    return plan_itinerary(body.traveller)
