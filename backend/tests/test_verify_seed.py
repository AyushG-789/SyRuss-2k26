"""Pakka Check on the real seed data: every event must get its expected status (SPEC.md §4.8)."""
import pytest

from app.clock import parse_hhmm
from app.data_loader import load_seed
from app.verify.score import evaluate
from app.verify.seed import seed_events

SEED = load_seed()
EVENTS = seed_events(SEED)
CHECK_AT = SEED.scenario["_meta"]["check_at"]


def score(event_id: str, at: str):
    ev = EVENTS[event_id]
    return evaluate(ev.type, ev.evidence, SEED.reporters, parse_hhmm(at))


def test_every_ground_truth_event_is_built():
    assert set(EVENTS) == {g["event"] for g in SEED.scenario["ground_truth"]}


@pytest.mark.parametrize("event_id", sorted(EVENTS))
def test_expected_status_at_check_time(event_id):
    assert score(event_id, CHECK_AT).status == EVENTS[event_id].expected_status


def test_fake_metro1_burst_never_reroutes():
    for t in ("16:44", "16:50", "17:30"):
        r = score("E_M1_FAKE", t)
        assert r.status == "coordinated" and r.confidence < 0.1


def test_real_metro1_goes_possible_then_confirmed_when_news_lands():
    assert score("E_M1_SAKINAKA", "17:08").status == "possible"     # 3 commuters
    assert score("E_M1_SAKINAKA", "17:11").status == "possible"
    assert score("E_M1_SAKINAKA", "17:12").status == "confirmed"    # + news N01
    assert score("E_M1_SAKINAKA", "17:12").confidence == pytest.approx(0.831, abs=0.001)


def test_dadar_fob_confirmed_once_official_notice_arrives():
    assert score("E_DADAR_FOB", "17:14").status in {"ignored", "possible"}
    assert score("E_DADAR_FOB", "17:15").status == "confirmed"


def test_crowd_all_clear_does_not_cancel_metro1_event():
    assert score("E_M1_SAKINAKA", "17:46").contradiction == 0.0


def test_stale_morning_reports_are_expired_at_scenario_start():
    start = SEED.scenario["start"]
    assert score("E_STALE_KURLA", start).status == "expired"
    assert score("E_STALE_PRABHADEVI", start).status == "expired"


def test_wr_false_claim_is_flagged_contradicted():
    assert "contradicted" in score("E_WR_FALSE", CHECK_AT).flags


def test_other_day_items_are_skipped():
    refs = {e.ref_id for ev in EVENTS.values() for e in ev.evidence}
    assert "N04" not in refs and "O05" not in refs
