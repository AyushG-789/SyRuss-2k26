from app.verify.confidence import (
    EvidenceItem,
    confidence,
    decay,
    status_for_confidence,
)


def test_official_evidence_is_confirmed():
    evidence = [
        EvidenceItem(
            source_type="official",
            weight=0.80,
            age_minutes=5,
        )
    ]

    value = confidence(evidence, "closure")

    assert value >= 0.70
    assert status_for_confidence(value) == "confirmed"


def test_crowd_only_evidence_can_be_possible():
    evidence = [
        EvidenceItem(
            source_type="crowd",
            weight=0.25,
            age_minutes=0,
        ),
        EvidenceItem(
            source_type="crowd",
            weight=0.25,
            age_minutes=0,
        ),
        EvidenceItem(
            source_type="crowd",
            weight=0.25,
            age_minutes=0,
        ),
    ]

    value = confidence(evidence, "delay")

    assert 0.40 <= value < 0.70
    assert status_for_confidence(value) == "possible"


def test_old_evidence_decays():
    fresh = decay(0, "delay")
    old = decay(120, "delay")

    assert fresh == 1.0
    assert old < fresh


def test_strong_official_contradiction_reduces_confidence():
    evidence = [
        EvidenceItem(
            source_type="crowd",
            weight=0.25,
            age_minutes=0,
        ),
        EvidenceItem(
            source_type="official",
            weight=0.80,
            age_minutes=0,
            supporting=False,
        ),
    ]

    value = confidence(evidence, "closure")

    assert value == 0.0
    assert status_for_confidence(value) == "ignored"


def test_status_thresholds():
    assert status_for_confidence(0.70) == "confirmed"
    assert status_for_confidence(0.69) == "possible"
    assert status_for_confidence(0.40) == "possible"
    assert status_for_confidence(0.39) == "ignored"