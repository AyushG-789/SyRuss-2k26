"""Ground-truth evaluation test verifying all 30 reports and all 9 categories against data/reports_seed.json. SPEC.md §4.8."""
import pytest

from app.data_loader import load_seed
from app.verify.engine import get_verification_pipeline


@pytest.fixture(scope="module")
def seed_pipeline():
    pipe = get_verification_pipeline()
    # Replay timeline up to 17:45 so all scenario reports are processed
    pipe.replay_timeline(until_hhmm="17:45")
    return pipe


def test_all_30_seed_reports_match_ground_truth():
    seed = load_seed()
    pipe = get_verification_pipeline()

    # Pass 1: Replay to check_at 17:35 for R01-R29
    pipe.replay_timeline(until_hhmm="17:35")

    for report_id, report in seed.reports.items():
        if report_id in ["R14", "R30"]:
            continue  # These arrive after 17:35 in the scenario timeline

        expected = report.get("expected", {})
        cat = expected.get("category")
        exp_status = expected.get("status")
        exp_event = expected.get("event")

        if cat == "noise":
            assert report_id in pipe.noise_reports, f"{report_id} should be classified as noise"
        else:
            result = pipe.get_report_result(report_id)
            assert result is not None, f"No verification result for {report_id}"
            assert result.event_id == exp_event, f"{report_id} event mismatch: {result.event_id} != {exp_event}"
            assert result.status == exp_status, f"{report_id} status mismatch: {result.status} != {exp_status}"
            if "flags" in expected:
                for flag in expected["flags"]:
                    assert flag in result.flags, f"{report_id} missing expected flag: {flag}"

    # Pass 2: Replay to 17:45 to verify R14 and R30
    pipe.replay_timeline(until_hhmm="17:45")

    # R14 is noise at 17:40
    assert "R14" in pipe.noise_reports, "R14 should be classified as noise"

    # R30 is crowd resolution at 17:45
    r30_res = pipe.get_report_result("R30")
    assert r30_res is not None, "R30 should have a result"
    assert r30_res.event_id == "E_M1_SAKINAKA"
    assert r30_res.status == "confirmed"


def test_category_stale(seed_pipeline):
    """Category 1: Stale reports R01, R02, R03 from earlier the same day must be expired."""
    for rid in ["R01", "R02", "R03"]:
        res = seed_pipeline.get_report_result(rid)
        assert res is not None
        assert res.status == "expired", f"{rid} expected 'expired', got '{res.status}'"


def test_category_fake_burst(seed_pipeline):
    """Category 2: Coordinated fake burst R04-R08 from new accounts collapses to coordinated status."""
    for rid in ["R04", "R05", "R06", "R07", "R08"]:
        res = seed_pipeline.get_report_result(rid)
        assert res is not None
        assert res.status == "coordinated", f"{rid} expected 'coordinated', got '{res.status}'"
        assert "coordinated_burst" in res.flags

    ev = seed_pipeline.get_event("E_M1_FAKE")
    assert ev is not None
    assert ev.confidence == 0.05
    assert ev.status == "coordinated"


def test_category_noise(seed_pipeline):
    """Category 3: Non-disruption reports R09-R14 are filtered out as noise."""
    for rid in ["R09", "R10", "R11", "R12", "R13", "R14"]:
        assert rid in seed_pipeline.noise_reports, f"{rid} should be in noise_reports"


def test_category_true_cluster(seed_pipeline):
    """Category 4: Genuine disruption clusters achieve confirmed status."""
    # Metro 1 delay (R15, R16, R17 + N01)
    for rid in ["R15", "R16", "R17"]:
        res = seed_pipeline.get_report_result(rid)
        assert res is not None
        assert res.status == "confirmed", f"{rid} expected 'confirmed', got '{res.status}'"

    ev_m1 = seed_pipeline.get_event("E_M1_SAKINAKA")
    assert ev_m1 is not None
    assert ev_m1.confidence >= 0.70
    assert ev_m1.status == "confirmed"

    # Dadar FOB closure (R18, R19 + O01)
    for rid in ["R18", "R19"]:
        res = seed_pipeline.get_report_result(rid)
        assert res is not None
        assert res.status == "confirmed", f"{rid} expected 'confirmed', got '{res.status}'"

    ev_fob = seed_pipeline.get_event("E_DADAR_FOB")
    assert ev_fob is not None
    assert ev_fob.confidence >= 0.70
    assert ev_fob.status == "confirmed"

    # Andheri slow delay (R20, R21, R22 + N02)
    for rid in ["R20", "R21", "R22"]:
        res = seed_pipeline.get_report_result(rid)
        assert res is not None
        assert res.status == "confirmed", f"{rid} expected 'confirmed', got '{res.status}'"

    ev_andheri = seed_pipeline.get_event("E_ANDHERI_DELAY")
    assert ev_andheri is not None
    assert ev_andheri.confidence >= 0.70
    assert ev_andheri.status == "confirmed"


def test_category_false_and_contradicted(seed_pipeline):
    """Category 5: False claims contradicted by official notices or unverified single reports are ignored."""
    # R23 Western Railway closure contradicted by O02
    r23 = seed_pipeline.get_report_result("R23")
    assert r23 is not None
    assert r23.status == "ignored"
    assert "contradicted" in r23.flags

    # R24 Harbour line closure contradicted by O03
    r24 = seed_pipeline.get_report_result("R24")
    assert r24 is not None
    assert r24.status == "ignored"
    assert "contradicted" in r24.flags

    # R25 Metro 3 unverified single report (reputation 0.3)
    r25 = seed_pipeline.get_report_result("R25")
    assert r25 is not None
    assert r25.status == "ignored"
    assert r25.confidence < 0.40


def test_category_accessibility(seed_pipeline):
    """Category 6: BKC lift out (R26, R27) reaches possible status with 2 reports."""
    for rid in ["R26", "R27"]:
        res = seed_pipeline.get_report_result(rid)
        assert res is not None
        assert res.status == "possible", f"{rid} expected 'possible', got '{res.status}'"

    ev = seed_pipeline.get_event("E_BKC_LIFT")
    assert ev is not None
    assert 0.40 <= ev.confidence < 0.70
    assert ev.status == "possible"


def test_category_weather_backed(seed_pipeline):
    """Category 7: Azad Maidan waterlogging (R28) combined with O04 rain alert reaches possible (0.40)."""
    r28 = seed_pipeline.get_report_result("R28")
    assert r28 is not None
    assert r28.status == "possible"
    assert r28.confidence == 0.40

    ev = seed_pipeline.get_event("E_AZAD_WATER")
    assert ev is not None
    assert ev.confidence == 0.40
    assert ev.status == "possible"


def test_category_same_user_repeat(seed_pipeline):
    """Category 8: Repeated reports by same user u02 (R15, R29) count once."""
    r29 = seed_pipeline.get_report_result("R29")
    assert r29 is not None
    assert r29.status == "confirmed"

    ev = seed_pipeline.get_event("E_M1_SAKINAKA")
    assert ev is not None
    # Check that both R15 and R29 were recorded in reports for this event
    internal_ev = seed_pipeline.events["E_M1_SAKINAKA"]
    u02_reports = [r for r in internal_ev.reports if r.reporter_id == "u02"]
    assert len(u02_reports) == 2  # R15 and R29 both ingested
    assert ev.confidence >= 0.70



def test_category_crowd_resolution(seed_pipeline):
    """Category 9: Crowd report R30 'running normally' does not cancel confirmed event supported by news."""
    r30 = seed_pipeline.get_report_result("R30")
    assert r30 is not None
    assert r30.status == "confirmed"

    ev = seed_pipeline.get_event("E_M1_SAKINAKA")
    assert ev is not None
    assert ev.status == "confirmed"
    assert ev.confidence >= 0.70
