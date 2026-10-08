from fastapi.testclient import TestClient

from app.data_loader import load_seed
from app.main import app

client = TestClient(app)


def test_post_plan_tr3_success():
    seed = load_seed()
    tr3_data = seed.travellers["TR3"]

    response = client.post("/plan", json={"traveller": tr3_data, "mode": "baseline"})
    assert response.status_code == 200

    data = response.json()
    assert "cards" in data
    assert "rejected" in data
    assert len(data["cards"]) == 3

    labels = [c["label"] for c in data["cards"]]
    assert "fastest" in labels
    assert "optimal" in labels
    assert "cheapest" in labels

    # Check fastest card structure
    fast_card = next(c for c in data["cards"] if c["label"] == "fastest")
    assert fast_card["recommended"] is True
    assert fast_card["duration_min"] > 0
    assert fast_card["cost_inr"] > 0
    assert len(fast_card["legs"]) > 0


def test_post_plan_custom_trip():
    custom_traveller = {
        "traveller_id": "CUSTOM_1",
        "name": "Custom Explorer",
        "origin": {"label": "Dadar Station", "lat": 19.0192, "lon": 72.8428, "poi_id": None},
        "destination": {"label": "Churchgate", "lat": 18.9355, "lon": 72.8272, "poi_id": None},
        "leave_at": "10:00",
        "arrive_by": "11:30",
        "hard_deadline": False,
        "max_budget_inr": 100,
        "max_walk_min": 15,
        "max_transfers": 2,
        "priority": "balanced",
        "modes_allowed": ["local", "metro", "bus", "walk"],
        "step_free": False,
        "heavy_luggage": False,
        "avoid_crowds": False,
        "language": "en",
    }

    response = client.post("/plan", json={"traveller": custom_traveller, "mode": "baseline"})
    assert response.status_code == 200

    data = response.json()
    assert len(data["cards"]) >= 1
    # Check that route starts at dadar and reaches churchgate
    first_card = data["cards"][0]
    assert first_card["legs"][0]["from_id"] in {"origin", "dadar_wr", "dadar_cr"}


def test_rejected_options_have_no_repeats():
    from app.routing.tidy import tidy_rejected
    from app.schemas import RejectedOption

    raw = [RejectedOption(summary=s, reason="Walking time 26 min exceeds max 15 min") for s in
           ["Via WR_SLOW -> METRO3", "Via WR_SLOW -> WR_SLOW -> METRO3", "Via WR_SLOW -> METRO3 -> METRO3",
            "Via Walk -> WR_SLOW -> METRO3", "Via WR_FAST -> METRO3"]]
    assert [r.summary for r in tidy_rejected(raw)] == [
        "Via WR_SLOW -> METRO3", "Via Walk -> WR_SLOW -> METRO3", "Via WR_FAST -> METRO3"]

    seed = load_seed()
    rejected = client.post("/plan", json={"traveller": seed.travellers["TR3"]}).json()["rejected"]
    summaries = [r["summary"] for r in rejected]
    assert len(summaries) == len(set(summaries)) <= 5
