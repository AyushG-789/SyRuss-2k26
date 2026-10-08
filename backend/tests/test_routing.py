from app.data_loader import load_seed
from app.routing.baseline import plan_baseline
from app.routing.scorer import ScoredCandidate, calculate_metrics_and_scores
from app.schemas import Leg, Place, Traveller


def test_tr3_known_mumbai_route():
    seed = load_seed()
    tr3 = Traveller.model_validate(seed.travellers["TR3"])

    res = plan_baseline(tr3)
    assert len(res.cards) == 3

    labels = {c.label for c in res.cards}
    assert labels == {"fastest", "optimal", "cheapest"}

    # TR3 priority is "fastest" -> fastest card must be recommended
    fast_card = next(c for c in res.cards if c.label == "fastest")
    assert fast_card.recommended is True

    # Validate cards have legs and realistic durations
    for card in res.cards:
        assert len(card.legs) >= 1
        assert 30 <= card.duration_min <= 120
        assert card.cost_inr > 0
        assert 0.0 <= card.score <= 10.0
        assert card.reliability == 1.0
        assert card.reliability_colour == "green"


def test_tr2_cheapest_priority_recommendation():
    seed = load_seed()
    # A budget traveller who asks for the cheapest option gets it recommended.
    tr2 = Traveller.model_validate(dict(seed.travellers["TR2"], priority="cheapest"))

    res = plan_baseline(tr2)
    assert len(res.cards) >= 1

    cheap_card = next((c for c in res.cards if c.label == "cheapest"), None)
    if cheap_card:
        assert cheap_card.recommended is True


def test_hard_constraint_filtering_budget():
    seed = load_seed()
    tr3_data = dict(seed.travellers["TR3"])
    # Set unrealistically low budget of Rs 5 (Thane to Churchgate local is Rs 20)
    tr3_data["max_budget_inr"] = 5
    tr_low_budget = Traveller.model_validate(tr3_data)

    res = plan_baseline(tr_low_budget)
    # Should have no surviving cards or only rejections due to budget
    assert len(res.cards) == 0 or all(c.cost_inr <= 5 for c in res.cards)
    assert any("budget" in r.reason.lower() for r in res.rejected)


def test_hard_constraint_filtering_hard_deadline():
    seed = load_seed()
    tr3_data = dict(seed.travellers["TR3"])
    # Departs 16:40, set impossible arrive_by 16:50 with hard_deadline
    tr3_data["leave_at"] = "16:40"
    tr3_data["arrive_by"] = "16:50"
    tr3_data["hard_deadline"] = True
    tr_deadline = Traveller.model_validate(tr3_data)

    res = plan_baseline(tr_deadline)
    # All paths that arrive after 16:50 must be rejected
    for card in res.cards:
        assert card.legs[-1].arrive <= "16:50"
    assert any("deadline" in r.reason.lower() for r in res.rejected)


def test_scorer_normalization_math():
    cands = [
        ScoredCandidate(
            plan_id="c1",
            legs=[],
            duration_min=50,
            cost_inr=100,
            transfers=1,
            walk_min=10,
            reliability=1.0,
        ),
        ScoredCandidate(
            plan_id="c2",
            legs=[],
            duration_min=80,
            cost_inr=20,
            transfers=2,
            walk_min=25,
            reliability=1.0,
        ),
    ]

    s_fast, s_cheap, _ = calculate_metrics_and_scores(cands, "fastest")
    # c1 is much faster, c2 is much cheaper
    assert s_fast["c1"] > s_fast["c2"]
    assert s_cheap["c2"] > s_cheap["c1"]
