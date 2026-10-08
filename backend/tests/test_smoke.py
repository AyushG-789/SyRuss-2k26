from fastapi.testclient import TestClient

from app.clock import SimClock, parse_hhmm
from app.data_loader import load_seed
from app.main import app
from app.schemas import Traveller

client = TestClient(app)


def test_health_reports_seed_counts():
    body = client.get("/health").json()
    assert body["status"] == "ok"
    assert body["data"]["reports"] == 30
    assert body["data"]["travellers"] == 5


def test_admin_clock_set_and_advance():
    assert client.post("/admin/clock", json={"set": "17:00", "speed": 0}).json()["now"] == "17:00"
    assert client.post("/admin/clock", json={"advance_min": 12}).json()["now"] == "17:12"
    assert client.post("/admin/clock", json={"speed": -1}).status_code == 422


def test_sim_clock_paused_does_not_move():
    c = SimClock(parse_hhmm("16:30"))
    assert c.now() == parse_hhmm("16:30")
    c.advance(45)
    assert c.now() == parse_hhmm("17:15")


def test_seed_travellers_match_schema():
    for t in load_seed().travellers.values():
        Traveller.model_validate(t)


def test_seed_indexes_lines_by_stop():
    seed = load_seed()
    assert "METRO1" in seed.lines_by_stop["saki_naka"]
    assert set(seed.lines_by_stop["csmt"]) >= {"CR_SLOW", "HARBOUR"}
