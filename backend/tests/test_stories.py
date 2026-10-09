"""The 5 demo travellers (PS: "five traveller itineraries") — each story's moment must happen.

Each traveller's `demo` entry in data/travellers.json says when the story starts, which option to
start, and when the moment is. These tests replay that on a fresh scripted copy of the scenario.
"""
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from app.clock import fmt_hhmm, parse_hhmm
from app.data_loader import load_seed
from app.main import app
from app.replan.monitor import JourneyStore
from app.routing.aware import plan_aware
from app.routing.baseline import plan_baseline
from app.schemas import Traveller
from app.verify import store as store_mod

client = TestClient(app)
SEED = load_seed()


@pytest.fixture()
def world():
    live = store_mod.store
    fresh = store_mod.EventStore()
    fresh.reset("scripted")
    store_mod.store = fresh
    yield fresh
    store_mod.store = live


def traveller(tid):
    return Traveller.model_validate(SEED.travellers[tid])


def demo(tid):
    return SEED.travellers[tid]["demo"]


def ride_until_proposal(t, card, start):
    """Watch the trip minute by minute; return (time, proposal) or (None, None)."""
    js = JourneyStore()
    j = js.save(t, card, parse_hhmm(start))
    now = parse_hhmm(start)
    while now <= parse_hhmm(card.legs[-1].arrive) + timedelta(minutes=5):
        js.check(now)
        if j.proposal:
            return fmt_hhmm(now), j.proposal
        now += timedelta(minutes=1)
    return None, None


def started_card(tid):
    t, d = traveller(tid), demo(tid)
    cards = plan_aware(t, d["clock"], now=parse_hhmm(d["clock"])).cards
    return t, next(c for c in cards if c.label == d["card"])


def test_every_traveller_has_a_story_to_play():
    for tid, t in SEED.travellers.items():
        d = t["demo"]
        assert d["kind"] in ("plan", "track", "itinerary") and d["clock"] and d["moment"] and d["watch"], tid
        assert t["demo_hook"], tid


def test_tr1_lift_outage_routes_wheelchair_user_around_bkc(world):
    t, d = traveller("TR1"), demo("TR1")
    now = parse_hhmm(d["clock"])
    base = next(c for c in plan_baseline(t, d["clock"]).cards if c.recommended)
    aware = plan_aware(t, d["clock"], now=now)
    rec = next(c for c in aware.cards if c.recommended)
    uses_bkc = lambda c: any("bkc_m3" in (l.from_id, l.to_id) for l in c.legs)  # noqa: E731
    assert uses_bkc(base)            # a normal app goes straight to BKC metro
    assert not uses_bkc(rec)         # TravelBuddy avoids the reported lift outage
    assert any("lift outage" in n for n in aware.notes)
    assert all(l.step_free for l in rec.legs)


def test_tr2_fake_burst_ignored_then_real_delay_replans(world):
    t, card = started_card("TR2")
    assert any(l.line_id == "METRO1" for l in card.legs)                 # still on Metro 1 despite the fake burst
    assert not any("E_M1_FAKE" in l.event_ids for l in card.legs)
    at, p = ride_until_proposal(t, card, demo("TR2")["clock"])
    assert at == demo("TR2")["moment"] and p.event_ids == ["E_M1_SAKINAKA"]
    assert p.new_card.cost_inr <= t.max_budget_inr
    assert all(l.from_id != "origin" for l in p.new_card.legs[1:])     # new part starts where he is


def test_tr3_dadar_closure_replans_before_deadline(world):
    t, card = started_card("TR3")
    assert any(l.mode == "walk" and {l.from_id, l.to_id} == {"dadar_cr", "dadar_wr"} for l in card.legs)
    at, p = ride_until_proposal(t, card, demo("TR3")["clock"])
    assert at == demo("TR3")["moment"] and "E_DADAR_FOB" in p.event_ids
    assert p.new_card.legs[-1].arrive <= t.arrive_by


def test_tr4_possible_waterlogging_warns_but_keeps_plan(world):
    client.post("/admin/reset")
    client.post("/admin/clock", json={"set": demo("TR4")["clock"]})
    tr4 = {**SEED.travellers["TR4"], "language": "en"}                     # warning text checked in English
    r = client.post("/itinerary", json={"traveller": tr4}).json()
    mr = client.post("/itinerary", json={"traveller": {**tr4, "language": "mr"}}).json()
    client.post("/admin/reset")
    assert r["feasible"] and r["stops"][-1]["visit_start"] == "18:30"
    assert any("waterlogging" in w and "plan kept" in w for w in r["warnings"])
    assert any("पाणी साचले" in w and "प्लॅन तसाच" in w for w in mr["warnings"])


def test_tr5_andheri_delay_replans(world):
    t, card = started_card("TR5")
    at, p = ride_until_proposal(t, card, demo("TR5")["clock"])
    assert at == demo("TR5")["moment"] and "E_ANDHERI_DELAY" in p.event_ids
    assert all(l.mode != "auto" for l in p.new_card.legs)               # she refuses autos
