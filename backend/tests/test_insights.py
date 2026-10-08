"""Transparency (B10), evaluation (A10), day planner (A9)."""
from fastapi.testclient import TestClient

from app.data_loader import load_seed
from app.main import app

client = TestClient(app)


def test_transparency_lists_sources_policy_assumptions_and_log():
    client.post("/admin/reset")
    client.post("/admin/clock", json={"set": "17:20"})
    t = client.get("/transparency").json()
    assert {s["id"] for s in t["sources"]} == {"crowd", "news", "official", "weather"}
    assert t["policy"]["thresholds"] if "thresholds" in t["policy"] else t["policy"]
    assert len(t["assumptions"]) >= 5
    fob = next(e for e in t["event_log"] if e["event_id"] == "E_DADAR_FOB")
    assert fob["status"] == "confirmed" and "official" in fob["summary"]
    assert any(e["status"] == "coordinated" for e in t["event_log"])          # the fake burst is shown, not hidden


def test_eval_shows_travelbuddy_better_and_no_false_reroutes():
    r = client.get("/eval?refresh=true").json()
    assert r["trips_compared"] >= 9
    tb, base = r["travelbuddy"], r["schedule_only"]
    assert tb["late_or_failed"] <= base["late_or_failed"]
    assert tb["avg_extra_min"] <= base["avg_extra_min"]
    assert tb["false_reroutes_from_fake_reports"] == 0
    assert r["classification"]["correct"] == r["classification"]["total"]


def test_itinerary_orders_stops_within_opening_hours():
    tr4 = load_seed().travellers["TR4"]
    r = client.post("/itinerary", json={"traveller": tr4}).json()
    assert r["feasible"], r
    names = [s["poi_id"] for s in r["stops"]]
    assert names[-1] == "poi_marine_drive" and r["stops"][-1]["visit_start"] == "18:30"   # sunset slot kept
    csmvs = next(s for s in r["stops"] if s["poi_id"] == "poi_csmvs")
    assert "10:15" <= csmvs["visit_start"] and csmvs["leave"] <= "18:00"                 # museum hours
    assert {"poi_gateway", "poi_csmvs", "poi_marine_drive"} <= set(names)                # all must-visits


def test_tight_day_plans_what_fits_and_explains_the_rest():
    tr4 = dict(load_seed().travellers["TR4"])
    tr4["itinerary"] = {**tr4["itinerary"], "day_start": "16:30", "day_end": "19:30"}   # too late for the museum
    r = client.post("/itinerary", json={"traveller": tr4}).json()
    assert r["feasible"] and r["partial"]
    kept = [s["poi_id"] for s in r["stops"]]
    assert "poi_marine_drive" in kept                                                  # must-visits kept first
    csmvs = next(d for d in r["dropped"] if d["poi_id"] == "poi_csmvs")
    assert csmvs["must_visit"] and "closes at 18:00" in csmvs["reason"]


def test_nothing_fits_explains_every_stop():
    tr4 = dict(load_seed().travellers["TR4"])
    tr4["itinerary"] = {"day_start": "21:30", "day_end": "22:00",
                        "stops": [{"poi_id": "poi_csmvs", "must_visit": True}, {"poi_id": "poi_crawford_market", "must_visit": True}]}
    r = client.post("/itinerary", json={"traveller": tr4}).json()
    assert r["feasible"] is False and len(r["dropped"]) == 2 and all(d["reason"] for d in r["dropped"])
