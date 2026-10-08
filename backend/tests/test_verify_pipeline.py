"""Unit tests for the verification pipeline components: validate, expire, merge, and events API."""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas import Affected, RawReport, StructuredReport
from app.verify.engine import get_verification_pipeline
from app.verify.expire import calculate_expiry_time, get_event_lifetime, is_event_expired
from app.verify.merge import can_merge_with_event, has_affected_overlap, is_compatible_type
from app.verify.validate import validate_structured_evidence


def test_validate_unknown_line_rejected():
    aff = Affected(line_ids=["NON_EXISTENT_LINE"], stop_ids=[], transfer_ids=[])
    is_valid, err = validate_structured_evidence(affected=aff)
    assert not is_valid
    assert "Unknown line_id" in err


def test_validate_unknown_stop_rejected():
    aff = Affected(line_ids=[], stop_ids=["unknown_stop_xyz"], transfer_ids=[])
    is_valid, err = validate_structured_evidence(affected=aff)
    assert not is_valid
    assert "Unknown stop_id" in err


def test_validate_stop_not_served_by_line_rejected():
    # 'kurla_hb' is on HARBOUR, not METRO1
    aff = Affected(line_ids=["METRO1"], stop_ids=["kurla_hb"], transfer_ids=[])
    is_valid, err = validate_structured_evidence(affected=aff)
    assert not is_valid
    assert "not served by any" in err


def test_validate_gps_too_far_rejected():
    # CSMT station is around (18.940, 72.835). GPS at (19.200, 72.800) is >20km away.
    aff = Affected(line_ids=[], stop_ids=["csmt"], transfer_ids=[])
    is_valid, err = validate_structured_evidence(
        affected=aff,
        lat=19.200,
        lon=72.800,
    )
    assert not is_valid
    assert "away from nearest affected stop" in err


def test_validate_evidence_span_not_in_raw_text_rejected():
    aff = Affected(line_ids=["METRO1"], stop_ids=["saki_naka"], transfer_ids=[])
    is_valid, err = validate_structured_evidence(
        affected=aff,
        raw_text="Metro is late at Saki Naka",
        evidence_span="Complete shutdown of all trains across the city",
    )
    assert not is_valid
    assert "not a substring" in err


def test_validate_started_at_after_reported_at_rejected():
    aff = Affected(line_ids=["METRO1"], stop_ids=["saki_naka"], transfer_ids=[])
    is_valid, err = validate_structured_evidence(
        affected=aff,
        reported_at="17:00",
        started_at="17:15",
    )
    assert not is_valid
    assert "later than reported_at" in err


def test_validate_valid_evidence_passes():
    aff = Affected(line_ids=["METRO1"], stop_ids=["saki_naka"], transfer_ids=[])
    is_valid, err = validate_structured_evidence(
        affected=aff,
        raw_text="Metro 1 Saki Naka pe ruki hui hai",
        evidence_span="Saki Naka pe ruki",
        lat=19.1035,
        lon=72.8880,
        reported_at="17:05",
        started_at="17:00",
    )
    assert is_valid
    assert err is None


def test_event_lifetimes_match_spec():
    assert get_event_lifetime("delay") == 45
    assert get_event_lifetime("closure") == 240
    assert get_event_lifetime("lift_out") == 1440
    assert get_event_lifetime("diversion") == 120
    assert get_event_lifetime("crowding") == 30
    assert get_event_lifetime("waterlogging") == 120


def test_expiry_calculation():
    # 09:10 + 45 min = 09:55
    assert calculate_expiry_time("09:10", "delay") == "09:55"
    assert is_event_expired("09:10", "10:00", "delay")
    assert not is_event_expired("09:10", "09:50", "delay")


def test_merge_affected_overlap():
    aff1 = Affected(line_ids=["METRO1"], stop_ids=["saki_naka"])
    aff2 = Affected(line_ids=["METRO1"], stop_ids=["ghatkopar"])
    assert has_affected_overlap(aff1, aff2)

    aff3 = Affected(line_ids=["WR_FAST"], stop_ids=["bandra_wr"])
    assert not has_affected_overlap(aff1, aff3)


def test_merge_compatible_type():
    assert is_compatible_type("delay", "delay")
    aff = Affected(line_ids=["WR_SLOW"])
    assert is_compatible_type("delay", "closure", aff, aff)
    assert not is_compatible_type("diversion", "lift_out", aff, aff)


def test_can_merge_with_event():
    aff1 = Affected(line_ids=["METRO1"], stop_ids=["saki_naka"])
    can_join = can_merge_with_event(
        item_type="delay",
        item_affected=aff1,
        item_time="17:07",
        item_text="Metro delay at Saki Naka",
        event_type="delay",
        event_affected=aff1,
        event_last_seen="17:05",
        event_texts=["Metro 1 Saki Naka train stopped"],
    )
    assert can_join


def test_events_api_get():
    client = TestClient(app)
    resp = client.get("/events")
    assert resp.status_code == 200
    events = resp.json()
    assert isinstance(events, list)
    assert len(events) > 0


def test_reports_api_post():
    client = TestClient(app)
    body = {
        "report_id": "R_TEST_01",
        "reporter_id": "u01",
        "text": "Metro 1 Saki Naka train stopped",
        "lat": 19.1035,
        "lon": 72.8880,
        "reported_at": "17:05",
        "lang": "en",
    }
    resp = client.post("/reports", json=body)
    assert resp.status_code == 200
    data = resp.json()
    assert data["report_id"] == "R_TEST_01"
    assert data["status"] in ["confirmed", "possible", "ignored", "coordinated"]
