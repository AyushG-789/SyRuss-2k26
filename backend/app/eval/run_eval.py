"""Evaluation (A10): schedule-only vs TravelBuddy on the demo day. SPEC.md §12.

For each traveller with a single trip (TR1, TR2, TR3, TR5):
- **Schedule-only**: plan at the leave time ignoring all reports, then travel without changes.
- **TravelBuddy**: plan with Pakka Check at the leave time, then the replan monitor watches the trip
  minute by minute and every proposal is accepted.
Both executed routes are then scored against `scenarios/demo.json` ground truth — what REALLY
happened: a leg on a really-closed transfer/line → + fallback minutes; on a really-delayed line
during the delay window → + the true delay. Fake events (real: false) have no effect.

Run:  python -m app.eval.run_eval   (from backend/)   ·   API: GET /eval
"""
from __future__ import annotations

import contextlib
import threading
from datetime import timedelta

from app.clock import fmt_hhmm, parse_hhmm
from app.data_loader import load_seed, load_typed_network
from app.replan.impact import touches
from app.replan.monitor import JourneyStore
from app.routing.aware import plan_aware
from app.routing.baseline import plan_baseline
from app.routing.text import route_text
from app.schemas import RouteCard, Traveller
from app.verify import store as store_mod

TRAVELLERS = ["TR1", "TR2", "TR3", "TR5"]
_lock = threading.Lock()
_cache: dict | None = None


@contextlib.contextmanager
def _scripted_world():
    """Evaluate on a fresh scripted copy of the scenario, whatever the live demo is doing."""
    with _lock:
        live = store_mod.store
        fresh = store_mod.EventStore()
        fresh.reset("scripted")
        store_mod.store = fresh
        try:
            yield fresh
        finally:
            store_mod.store = live


def _m(hhmm: str) -> int:
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def _recommended(cards: list[RouteCard]) -> RouteCard | None:
    return next((c for c in cards if c.recommended), cards[0] if cards else None)


def _outcome(card: RouteCard, world, truth: list[dict]) -> dict:
    """What really happens on this route: extra minutes from REAL events overlapping its legs."""
    _, lines, transfers, _ = load_typed_network()
    extra, hits = 0, []
    for gt in truth:
        if not gt.get("real"):
            continue
        ev = world._events.get(gt["event"])
        if ev is None or "start" not in gt:
            continue
        for leg in card.legs:
            if gt["effect"] in ("closure", "lift_out"):
                # You only hit a closure if you get there after it started.
                overlap = _m(gt["start"]) <= _m(leg.depart) <= _m(gt["end"])
            else:
                overlap = _m(leg.depart) <= _m(gt["end"]) and _m(leg.arrive) >= _m(gt["start"])
            if not overlap or not touches(leg, ev, lines, transfers):
                continue
            if gt["effect"] == "closure":
                add = gt.get("fallback_extra_min", 30)
            elif gt["effect"] == "lift_out":
                add = 30  # find another exit / lift
            else:
                add = gt.get("delay_min", 0)
            extra += add
            hits.append({"event": gt["event"], "effect": gt["effect"], "extra_min": add})
            break
    arrive = _m(card.legs[-1].arrive) + extra
    return {"planned_arrive": card.legs[-1].arrive, "real_arrive": f"{arrive // 60:02d}:{arrive % 60:02d}",
            "extra_min": extra, "hit_by": hits}


def _by_label(cards: list[RouteCard], label: str) -> RouteCard | None:
    return next((c for c in cards if c.label == label), None)


def _run_traveller(tid: str, world, truth: list[dict]) -> list[dict]:
    """One row per option (fastest / optimal / cheapest): people don't all pick the same one."""
    t = Traveller.model_validate(load_seed().travellers[tid])
    leave = t.leave_at or "17:00"
    start = parse_hhmm(leave)
    base_cards = plan_baseline(t, leave).cards
    aware_cards = plan_aware(t, leave, now=start).cards
    real = {g["event"]: g.get("real", False) for g in truth}
    rows = []
    for label in ("fastest", "optimal", "cheapest"):
        base, first = _by_label(base_cards, label), _by_label(aware_cards, label)
        if base is None or first is None:
            continue
        # TravelBuddy: watch the trip minute by minute, accept every proposal.
        js = JourneyStore()
        j = js.save(t, first, start)
        replans, now = [], start
        end = parse_hhmm(j.card.legs[-1].arrive) + timedelta(minutes=5)
        while now <= end:
            js.check(now)
            if j.proposal:
                p = j.proposal
                replans.append({"at": fmt_hhmm(now), "events": p.event_ids, "message": p.message,
                                "caused_by_fake_report": not any(real.get(e, False) for e in p.event_ids)})
                js.decide(j.journey_id, True, now)
                end = parse_hhmm(j.card.legs[-1].arrive) + timedelta(minutes=5)
            now += timedelta(minutes=1)
        row = {"traveller_id": tid, "name": t.name, "label": label, "from": t.origin.label,
               "to": t.destination.label if t.destination else None, "leave_at": leave,
               "arrive_by": t.arrive_by, "replans": replans}
        for name, card in (("schedule_only", base), ("travelbuddy", j.card)):
            o = _outcome(card, world, truth)
            late = bool(t.arrive_by and o["real_arrive"] > t.arrive_by)
            row[name] = {"route": route_text(card.legs), "cost_inr": card.cost_inr, "walk_min": card.walk_min,
                         "late": late, **o}
        rows.append(row)
    return rows


def _classification(world) -> dict:
    """Pakka Check's verdict vs the expected status of each seed report's event (at check time)."""
    seed = load_seed()
    check_at = parse_hhmm(seed.scenario.get("_meta", {}).get("check_at", "17:35"))
    status = {e.event_id: e.status for e in world.events(check_at)}
    total = correct = 0
    wrong = []
    for r in seed.reports.values() if isinstance(seed.reports, dict) else seed.reports:
        exp = r.get("expected", {})
        if not exp.get("status") or not exp.get("event"):
            continue
        total += 1
        got = status.get(exp["event"], "expired")
        if got == exp["status"] or (exp["status"] == "expired" and got not in status.values()):
            correct += 1
        else:
            wrong.append({"report": r.get("report_id"), "event": exp["event"], "expected": exp["status"], "got": got})
    return {"checked_at": fmt_hhmm(check_at), "correct": correct, "total": total, "mismatches": wrong}


def run_eval(refresh: bool = False) -> dict:
    global _cache
    if _cache is not None and not refresh:
        return _cache
    truth = load_seed().scenario.get("ground_truth", [])
    with _scripted_world() as world:
        trips = [row for tid in TRAVELLERS for row in _run_traveller(tid, world, truth)]
        classification = _classification(world)
    ok = [t for t in trips if "error" not in t]
    def summary(key):
        return {
            "late_or_failed": sum(1 for t in ok if t[key]["late"]),
            "avg_extra_min": round(sum(t[key]["extra_min"] for t in ok) / max(1, len(ok)), 1),
            "total_cost_inr": sum(t[key]["cost_inr"] for t in ok),
            "total_walk_min": sum(t[key]["walk_min"] for t in ok),
        }
    base, tb = summary("schedule_only"), summary("travelbuddy")
    _cache = {
        "travellers": len({t["traveller_id"] for t in ok}),
        "trips_compared": len(ok),
        "schedule_only": base,
        "travelbuddy": {**tb, "replans": sum(len(t["replans"]) for t in ok),
                        "false_reroutes_from_fake_reports": sum(1 for t in ok for r in t["replans"] if r["caused_by_fake_report"])},
        "extra_cost_inr": tb["total_cost_inr"] - base["total_cost_inr"],
        "extra_walk_min": tb["total_walk_min"] - base["total_walk_min"],
        "classification": classification,
        "trips": trips,
        "method": "Each traveller travels the demo day twice: schedule-only plan vs TravelBuddy (Pakka Check + "
                  "replans accepted). Scored against scenarios/demo.json ground truth (real closures add the fallback "
                  "minutes, real delays add the true delay, fake reports have no effect).",
    }
    return _cache


if __name__ == "__main__":
    import json
    r = run_eval(refresh=True)
    print(json.dumps({k: v for k, v in r.items() if k != "trips"}, indent=2))
    for t in r["trips"]:
        print(t["traveller_id"], t["label"], "| base:", t["schedule_only"]["route"], t["schedule_only"]["real_arrive"], "late" if t["schedule_only"]["late"] else "",
              "| TB:", t["travelbuddy"]["route"], t["travelbuddy"]["real_arrive"], "late" if t["travelbuddy"]["late"] else "", "| replans", len(t["replans"]))
