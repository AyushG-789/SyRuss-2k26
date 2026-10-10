"""Saved journeys + replan monitor (B9). SPEC.md §8."""
import pytest
from fastapi.testclient import TestClient

from app.data_loader import load_seed, load_typed_network
from app.main import app
from app.replan.impact import touches
from app.schemas import Affected, Event, Leg

client = TestClient(app)
SEED = load_seed()


@pytest.fixture(autouse=True)
def fresh_demo():
    client.post("/admin/reset")
    yield
    client.post("/admin/reset")


def set_clock(hhmm):
    client.post("/admin/clock", json={"set": hhmm})


def plan_card(traveller, pick):
    cards = client.post("/plan", json={"traveller": traveller}).json()["cards"]
    return next(c for c in cards if pick(c))


def uses_dadar_fob(card):
    return any(l["mode"] == "walk" and {l["from_id"], l["to_id"]} == {"dadar_cr", "dadar_wr"} for l in card["legs"])


def save(traveller, card):
    res = client.post("/journeys", json={"traveller": traveller, "card": card})
    assert res.status_code == 201, res.text
    return res.json()


def get(jid):
    return client.get(f"/journeys/{jid}").json()


def tr3_via_dadar():
    set_clock("16:35")
    tr3 = SEED.travellers["TR3"]
    return tr3, save(tr3, plan_card(tr3, uses_dadar_fob))


def metro1_trip():
    st = SEED.stations
    return {
        "traveller_id": "CUSTOM", "name": "Metro rider",
        "origin": {"label": "Ghatkopar", "lat": st["ghatkopar_m1"]["lat"], "lon": st["ghatkopar_m1"]["lon"]},
        "destination": {"label": "Andheri", "lat": st["andheri_m1"]["lat"], "lon": st["andheri_m1"]["lon"]},
        "modes_allowed": ["metro", "walk"], "priority": "fastest",
    }


# ---- Matching rules ---------------------------------------------------------------------------
def _event(**affected):
    return Event(event_id="E", type="closure", severity="high", affected=Affected(**affected),
                 first_seen="17:00", last_seen="17:00", confidence=0.9, status="confirmed", expires_at="21:00")


def _leg(mode, line_id, a, b):
    return Leg(mode=mode, line_id=line_id, from_id=a, to_id=b, depart="17:00", arrive="17:10",
               duration_min=10, cost_inr=0, step_free=False)


def test_transfer_closure_hits_only_the_transfer_walk():
    _, lines, transfers, _ = load_typed_network()
    fob = _event(transfer_ids=["T_dadar_cr__dadar_wr"], stop_ids=["dadar_cr", "dadar_wr"])
    assert touches(_leg("walk", None, "dadar_cr", "dadar_wr"), fob, lines, transfers)
    assert touches(_leg("walk", None, "dadar_wr", "dadar_cr"), fob, lines, transfers)
    # A fast train running through Dadar is not affected by a closed foot-overbridge.
    assert not touches(_leg("local", "CR_FAST", "thane", "csmt"), fob, lines, transfers)


def test_stop_event_hits_rides_passing_the_stop_only():
    _, lines, transfers, _ = load_typed_network()
    saki = _event(line_ids=["METRO1"], stop_ids=["saki_naka"])
    assert touches(_leg("metro", "METRO1", "ghatkopar_m1", "andheri_m1"), saki, lines, transfers)
    assert touches(_leg("metro", "METRO1", "andheri_m1", "ghatkopar_m1"), saki, lines, transfers)
    assert not touches(_leg("metro", "METRO1", "versova", "andheri_m1"), saki, lines, transfers)


# ---- Journeys + proposals ---------------------------------------------------------------------
def test_dadar_fob_closure_proposes_replan_from_dadar():
    _, j = tr3_via_dadar()
    assert j["status"] in ("upcoming", "active") and j["proposal"] is None

    set_clock("17:10")  # closure only "possible" so far: no replan
    assert get(j["journey_id"])["proposal"] is None

    set_clock("17:15")  # CR official notice → confirmed
    p = get(j["journey_id"])["proposal"]
    assert p is not None
    assert "E_DADAR_FOB" in p["event_ids"]
    assert p["old_blocked"] is True
    assert p["from_label"].startswith("Dadar")
    assert not uses_dadar_fob(p["new_card"])
    hit = p["old_card"]["legs"][p["affected_leg_idx"][0]]
    assert "E_DADAR_FOB" in hit["event_ids"] and hit["risk"] >= 0.7
    # The train they are already on is kept; the new route continues from where it stops.
    assert p["new_card"]["legs"][0] == j["card"]["legs"][0]
    assert isinstance(p["delta"]["min"], int) and abs(p["delta"]["min"]) < 120


def test_accept_switches_plan_and_does_not_ask_again():
    _, j = tr3_via_dadar()
    set_clock("17:15")
    p = get(j["journey_id"])["proposal"]
    res = client.post(f"/journeys/{j['journey_id']}/replan/accept")
    assert res.status_code == 200
    after = res.json()
    assert after["proposal"] is None
    assert after["card"]["legs"] == p["new_card"]["legs"]
    assert [e["kind"] for e in after["log"]] == ["saved", "proposed", "accepted"]
    set_clock("17:18")
    assert get(j["journey_id"])["proposal"] is None


def test_reject_keeps_plan_and_does_not_ask_again():
    _, j = tr3_via_dadar()
    set_clock("17:15")
    get(j["journey_id"])
    after = client.post(f"/journeys/{j['journey_id']}/replan/reject").json()
    assert after["card"] == j["card"]
    assert after["log"][-1]["kind"] == "rejected"
    set_clock("17:18")
    assert get(j["journey_id"])["proposal"] is None


def test_fake_metro_burst_never_triggers_a_replan():
    set_clock("16:40")
    trip = metro1_trip()
    card = plan_card(trip, lambda c: any(l["line_id"] == "METRO1" for l in c["legs"]))
    j = save(trip, card)
    for t in ("16:43", "16:46", "16:50"):  # the burst of new accounts arrives 16:40–16:44
        set_clock(t)
        got = get(j["journey_id"])
        assert got["proposal"] is None and got["notice"] is None


def test_confirmed_delay_tells_the_traveller():
    set_clock("17:12")
    trip = metro1_trip()
    j = save(trip, plan_card(trip, lambda c: any(l["line_id"] == "METRO1" for l in c["legs"])))
    set_clock("17:15")
    got = get(j["journey_id"])
    text = got["notice"] or got["proposal"]["message"]
    assert "Metro Line 1" in text and "delay" in text


def test_errors_and_reset():
    assert client.get("/journeys/J_nope").status_code == 404
    _, j = tr3_via_dadar()
    assert client.post(f"/journeys/{j['journey_id']}/replan/accept").status_code == 409
    assert len(client.get("/journeys").json()) == 1
    client.post("/admin/reset")
    assert client.get("/journeys").json() == []


def test_alerts_socket_sends_clock_on_connect():
    with client.websocket_connect("/ws/alerts") as ws:
        msg = ws.receive_json()
        assert msg["type"] == "clock" and ":" in msg["now"]


def test_hub_tick_emits_proposal_once():
    from app.api.journeys import AlertHub

    hub = AlertHub()
    _, j = tr3_via_dadar()
    set_clock("17:15")
    first = [m for m in hub.tick() if m["type"] == "replan_proposal"]
    assert [m["journey_id"] for m in first] == [j["journey_id"]]
    assert not [m for m in hub.tick() if m["type"] == "replan_proposal"]


def test_journey_lists_live_problems_per_leg():
    _, j = tr3_via_dadar()
    set_clock("17:14")                       # FOB closure only "possible" (44%)
    hits = get(j["journey_id"])["live_hits"]
    fob = [h for h in hits if h["event_id"] == "E_DADAR_FOB"]
    assert fob and fob[0]["status"] == "possible" and fob[0]["blocked"]
    assert j["card"]["legs"][fob[0]["leg_idx"]]["mode"] == "walk"
    set_clock("17:15")
    fob = [h for h in get(j["journey_id"])["live_hits"] if h["event_id"] == "E_DADAR_FOB"]
    assert fob[0]["status"] == "confirmed" and "foot-overbridge" in fob[0]["title"]


def test_live_problem_titles_use_the_travellers_language():
    # The heads-up pop-up shows these titles, so a Hindi rider must get them in Hindi.
    set_clock("16:35")
    tr3 = {**SEED.travellers["TR3"], "language": "hi"}
    j = save(tr3, plan_card(tr3, uses_dadar_fob))
    set_clock("17:14")                       # FOB closure "possible": what the heads-up is for
    fob = [h for h in get(j["journey_id"])["live_hits"] if h["event_id"] == "E_DADAR_FOB"]
    assert fob and fob[0]["status"] == "possible"
    # place names stay as in the data; the kind of problem is translated ("बंद" = closed)
    assert "बंद" in fob[0]["title"] and "closure" not in fob[0]["title"]


def test_another_viewers_later_clock_does_not_drop_my_proposal():
    # Each browser has its own demo clock. Viewer B looking at their trip at 18:30 must not mark
    # A's trip finished (that dropped A's pending proposal: countdown restarted, Accept got a 409).
    _, a = tr3_via_dadar()
    _, b = tr3_via_dadar()
    set_clock("17:15")
    first = get(a["journey_id"])["proposal"]
    assert first is not None
    set_clock("18:30")                       # B's clock: B's trip is over
    assert get(b["journey_id"])["status"] == "completed"
    set_clock("17:15")                       # back to A
    again = get(a["journey_id"])["proposal"]
    assert again is not None and again["proposal_id"] == first["proposal_id"]
    res = client.post(f"/journeys/{a['journey_id']}/replan/accept")
    assert res.status_code == 200 and res.json()["proposal"] is None
