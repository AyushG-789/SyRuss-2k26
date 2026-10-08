"""Live event list, report submission and the routing contract (B3)."""
import pytest
from fastapi.testclient import TestClient

from app.clock import parse_hhmm
from app.main import app
from app.verify.store import active_events

client = TestClient(app)


@pytest.fixture(autouse=True)
def fresh_demo():
    client.post("/admin/reset")
    yield
    client.post("/admin/reset")


def set_clock(hhmm: str) -> None:
    assert client.post("/admin/clock", json={"set": hhmm}).json()["now"] == hhmm


def by_id(events):
    return {e["event_id"]: e for e in events}


def test_reset_puts_clock_at_scenario_start():
    assert client.get("/admin/clock").json()["now"] == "16:30"


def test_events_at_check_time_match_seed_expectations():
    set_clock("17:35")
    events = by_id(client.get("/events").json())
    assert len(events) == 11
    assert events["E_M1_FAKE"]["status"] == "coordinated"
    assert events["E_DADAR_FOB"]["status"] == "confirmed"
    assert events["E_DADAR_FOB"]["affected"]["transfer_ids"] == ["T_dadar_cr__dadar_wr"]
    assert events["E_WR_FALSE"]["status"] == "ignored"
    assert "contradicted" in events["E_WR_FALSE"]["flags"]
    assert events["E_BKC_LIFT"]["status"] == "possible"


def test_events_not_yet_reported_are_hidden():
    set_clock("16:35")
    ids = set(by_id(client.get("/events").json()))
    assert "E_DADAR_FOB" not in ids and "E_M1_SAKINAKA" not in ids
    assert {"E_STALE_KURLA", "E_STALE_PRABHADEVI"} <= ids   # morning reports, already expired


def test_moving_the_clock_confirms_metro1_when_news_lands():
    set_clock("17:08")
    assert by_id(client.get("/events").json())["E_M1_SAKINAKA"]["status"] == "possible"
    set_clock("17:12")
    m1 = by_id(client.get("/events").json())["E_M1_SAKINAKA"]
    assert m1["status"] == "confirmed" and m1["confidence"] == pytest.approx(0.831, abs=0.001)


def test_filters():
    set_clock("17:35")
    confirmed = client.get("/events", params={"status": "confirmed"}).json()
    assert {e["event_id"] for e in confirmed} == {"E_M1_SAKINAKA", "E_DADAR_FOB", "E_ANDHERI_DELAY"}
    metro1 = client.get("/events", params={"line_id": "METRO1"}).json()
    assert {e["event_id"] for e in metro1} == {"E_M1_FAKE", "E_M1_SAKINAKA"}


def test_event_detail_explains_the_score():
    set_clock("17:35")
    body = client.get("/events/E_M1_FAKE").json()
    assert body["breakdown"]["summary"].startswith("1 burst of 5")
    burst = body["breakdown"]["evidence"][0]
    assert sorted(burst["covers"]) == ["R04", "R05", "R06", "R07", "R08"]
    assert client.get("/events/nope").status_code == 404


def test_policy_endpoint():
    body = client.get("/verify/policy").json()
    assert body["thresholds"] == {"confirmed": 0.7, "possible": 0.4}


def test_new_report_joins_matching_event_and_raises_confidence():
    set_clock("17:30")
    before = by_id(client.get("/events").json())["E_BKC_LIFT"]["confidence"]
    res = client.post("/reports", json={
        "reporter_id": "u03", "text": "BKC lift still not working", "type": "lift_out",
        "affected": {"stop_ids": ["bkc_m3"], "line_ids": ["METRO3"]}, "reported_at": "17:30",
    })
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["event_id"] == "E_BKC_LIFT" and not body["created_event"]
    assert body["confidence"] > before


def test_report_somewhere_new_creates_an_event():
    set_clock("17:00")
    res = client.post("/reports", json={
        "reporter_id": "u09", "text": "Sion station platform 2 flooded", "type": "waterlogging",
        "affected": {"stop_ids": ["sion"]},
    })
    body = res.json()
    assert res.status_code == 201 and body["created_event"]
    assert body["reported_at"] == "17:00"
    # rain alert O04 (15:30) is attached as a prior → 1 crowd + weather = 40%
    assert body["status"] == "possible"


def test_unknown_reporter_counts_as_new_account():
    set_clock("17:00")
    body = client.post("/reports", json={
        "reporter_id": "brand_new_user", "text": "Chembur station closed!!", "type": "closure",
        "affected": {"stop_ids": ["chembur"]},
    }).json()
    assert body["confidence"] == pytest.approx(0.05)


@pytest.mark.parametrize("affected,msg", [
    ({"stop_ids": ["hogwarts"]}, "unknown stop_id"),
    ({"line_ids": ["METRO9"]}, "unknown line_id"),
    ({"stop_ids": ["churchgate"], "line_ids": ["METRO1"]}, "is not on line"),
    ({}, "at least one"),
])
def test_bad_ids_are_rejected(affected, msg):
    res = client.post("/reports", json={"reporter_id": "u01", "text": "something wrong", "type": "delay",
                                        "affected": affected})
    assert res.status_code == 422 and msg in str(res.json()["detail"])


def test_future_report_time_is_rejected():
    set_clock("17:00")
    res = client.post("/reports", json={"reporter_id": "u01", "text": "delay at dadar", "type": "delay",
                                        "affected": {"stop_ids": ["dadar_cr"]}, "reported_at": "18:00"})
    assert res.status_code == 422


def test_active_events_contract_for_routing():
    events = active_events(parse_hhmm("17:35"))
    assert {e.status for e in events} <= {"confirmed", "possible"}
    ids = {e.event_id for e in events}
    assert "E_DADAR_FOB" in ids and "E_M1_FAKE" not in ids and "E_WR_FALSE" not in ids
    dadar = next(e for e in events if e.event_id == "E_DADAR_FOB")
    assert dadar.affected.transfer_ids == ["T_dadar_cr__dadar_wr"]
    m1 = next(e for e in events if e.event_id == "E_M1_SAKINAKA")
    assert m1.expected_delay_min == 25
