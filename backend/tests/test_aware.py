"""Disruption-aware routing (A5). SPEC.md §5.4."""
import pytest
from fastapi.testclient import TestClient

from app.data_loader import load_seed
from app.main import app

client = TestClient(app)
SEED = load_seed()


@pytest.fixture(autouse=True)
def fresh_demo():
    client.post("/admin/reset")
    yield
    client.post("/admin/reset")


def plan(traveller, mode):
    res = client.post("/plan", json={"traveller": traveller, "mode": mode})
    assert res.status_code == 200, res.text
    return res.json()


def uses_fob(card):
    return any(l["mode"] == "walk" and {l["from_id"], l["to_id"]} == {"dadar_cr", "dadar_wr"} for l in card["legs"])


def tr3_at(t):
    return dict(SEED.travellers["TR3"], leave_at=t, arrive_by=None, hard_deadline=False)


def metro_trip(t):
    st = SEED.stations
    return {"traveller_id": "X", "name": "x", "leave_at": t, "priority": "fastest",
            "origin": {"label": "Ghatkopar", "lat": st["ghatkopar_m1"]["lat"], "lon": st["ghatkopar_m1"]["lon"]},
            "destination": {"label": "Andheri", "lat": st["andheri_m1"]["lat"], "lon": st["andheri_m1"]["lon"]},
            "modes_allowed": ["metro", "walk", "local", "auto", "taxi"]}


def test_confirmed_closure_is_avoided_and_explained():
    client.post("/admin/clock", json={"set": "17:20"})
    base, aware = plan(tr3_at("17:20"), "baseline"), plan(tr3_at("17:20"), "aware")
    assert any(uses_fob(c) for c in base["cards"])            # a normal app sends you over the closed FOB
    assert not any(uses_fob(c) for c in aware["cards"])       # TravelBuddy doesn't
    assert any("Avoided: Dadar foot-overbridge" in n for n in aware["notes"])


def test_confirmed_delay_adds_minutes_and_lowers_reliability():
    client.post("/admin/clock", json={"set": "17:20"})
    only_metro = dict(metro_trip("17:20"), modes_allowed=["metro", "walk"])   # no way around Metro 1
    base = plan(only_metro, "baseline")
    aware = plan(only_metro, "aware")
    b = next(c for c in base["cards"] if any(l["line_id"] == "METRO1" for l in c["legs"]))
    a = next(c for c in aware["cards"] if any(l["line_id"] == "METRO1" for l in c["legs"]))
    assert b["reliability"] == 1.0 and a["reliability"] < 0.7 and a["reliability_colour"] == "red"
    assert a["duration_min"] >= b["duration_min"] + 20                     # +25 min Saki Naka delay
    leg = next(l for l in a["legs"] if l["line_id"] == "METRO1")
    assert "E_M1_SAKINAKA" in leg["event_ids"] and leg["risk"] > 0.3


def test_fake_burst_does_not_change_routes():
    client.post("/admin/clock", json={"set": "16:50"})                     # only the coordinated fake burst
    aware = plan(metro_trip("16:50"), "aware")
    assert all(not l["event_ids"] for c in aware["cards"] for l in c["legs"])
    assert all(c["reliability"] == 1.0 for c in aware["cards"])


def test_no_same_line_reboarding():
    for c in plan(tr3_at("17:20"), "baseline")["cards"]:
        rides = [l["line_id"] for l in c["legs"] if l["line_id"]]
        assert all(a != b for a, b in zip(rides, rides[1:]))


def test_with_alternatives_a_delayed_line_is_avoided():
    client.post("/admin/clock", json={"set": "17:20"})
    aware = plan(metro_trip("17:20"), "aware")
    rec = next(c for c in aware["cards"] if c["recommended"])
    assert not any(l["line_id"] == "METRO1" for l in rec["legs"])        # 25-min confirmed delay → go around


def test_line_delay_does_not_hit_a_cab_to_that_station():
    from app.data_loader import load_typed_network
    from app.replan.impact import touches
    from app.schemas import Affected, Event, Leg
    _, lines, transfers, _ = load_typed_network()
    ev = Event(event_id="E", type="delay", severity="medium", affected=Affected(line_ids=["WR_SLOW"], stop_ids=["andheri_wr"]),
               first_seen="17:00", last_seen="17:00", confidence=0.9, status="confirmed", expires_at="18:00")
    cab = Leg(mode="cab", line_id=None, from_id="origin", to_id="andheri_wr", depart="17:00", arrive="17:09",
              duration_min=9, cost_inr=80, step_free=True)
    assert not touches(cab, ev, lines, transfers)
