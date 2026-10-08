"""Demo controls (B4): scripted vs manual mode, inject, presets, timeline."""
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def fresh_demo():
    client.post("/admin/reset")
    yield
    client.post("/admin/reset")


def events():
    return {e["event_id"]: e for e in client.get("/events").json()}


def set_clock(hhmm):
    client.post("/admin/clock", json={"set": hhmm})


def inject(**body):
    res = client.post("/admin/inject", json=body)
    assert res.status_code == 200, res.text
    return res.json()


def test_reset_defaults_to_scripted_and_paused():
    state = client.post("/admin/reset").json()
    assert state == {**state, "now": "16:30", "speed": 0.0, "mode": "scripted"}


def test_manual_mode_starts_with_history_only():
    assert client.post("/admin/reset", json={"mode": "manual"}).json()["mode"] == "manual"
    set_clock("18:00")
    assert set(events()) == {"E_STALE_KURLA", "E_STALE_PRABHADEVI"}   # nothing happens on its own


def test_manual_fake_burst_is_flagged():
    client.post("/admin/reset", json={"mode": "manual"})
    set_clock("16:45")
    body = inject(preset="fake_burst")
    assert body["injected"][0]["event_ids"] == ["E_M1_FAKE"]
    fake = events()["E_M1_FAKE"]
    assert fake["status"] == "coordinated" and fake["first_seen"] == "16:45"


def test_manual_metro1_story_possible_then_confirmed():
    client.post("/admin/reset", json={"mode": "manual"})
    set_clock("17:00")
    inject(preset="m1_commuters")
    assert events()["E_M1_SAKINAKA"]["status"] == "possible"
    client.post("/admin/clock", json={"advance_min": 2})
    inject(preset="m1_news")
    m1 = events()["E_M1_SAKINAKA"]
    assert m1["status"] == "confirmed" and m1["confidence"] == pytest.approx(0.831, abs=0.001)


def test_official_running_normally_cancels_false_claim_when_injected():
    client.post("/admin/reset", json={"mode": "manual"})
    set_clock("17:20")
    inject(preset="wr_false")
    inject(preset="wr_official")
    wr = events()["E_WR_FALSE"]
    assert wr["status"] == "ignored" and "contradicted" in wr["flags"]
    # the same notice also supports the Andheri delay
    assert "E_ANDHERI_DELAY" in events()


def test_inject_in_scripted_mode_adds_a_fresh_copy():
    set_clock("17:40")
    inject(ref_ids=["R26"])            # BKC lift report again, now
    lift = events()["E_BKC_LIFT"]
    assert lift["last_seen"] == "17:40"


def test_inject_rejects_unknown_ids_and_presets():
    assert client.post("/admin/inject", json={"ref_ids": ["R99"]}).status_code == 422
    assert client.post("/admin/inject", json={"ref_ids": ["R09"]}).status_code == 422   # noise, no event
    assert client.post("/admin/inject", json={"preset": "nope"}).status_code == 404
    assert client.post("/admin/inject", json={}).status_code == 422


def test_presets_only_use_real_seed_ids():
    for p in client.get("/admin/presets").json():
        res = client.post("/admin/inject", json={"preset": p["id"]})
        assert res.status_code == 200, p["id"]


def test_timeline_tracks_the_clock_in_scripted_mode():
    set_clock("17:00")
    items = client.get("/admin/timeline").json()["items"]
    state = {i["ref"]: i["state"] for i in items if i["ref"]}
    assert state["R01"] == "history"        # 09:10, before the scenario starts
    assert state["R04"] == "done"           # 16:40
    assert state["N01"] == "upcoming"       # 17:12
    assert state["O05"] == "other_day"
    assert next(i for i in items if i["ref"] == "N01")["label"].startswith("Mumbai Live")


def test_timeline_in_manual_mode_shows_what_was_injected():
    client.post("/admin/reset", json={"mode": "manual"})
    set_clock("17:00")
    inject(ref_ids=["R15"])
    body = client.get("/admin/timeline").json()
    state = {i["ref"]: i["state"] for i in body["items"] if i["ref"]}
    assert state["R15"] == "done" and state["R16"] == "not_injected"
    assert body["injected"] == [{"ref_id": "R15", "at": "17:00"}]
