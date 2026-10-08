from __future__ import annotations

import math
from dataclasses import dataclass


SOURCE_TRUST = {
    "official": 0.80,
    "traffic": 0.70,
    "news": 0.60,
    "crowd": 0.25,
    "weather": 0.20,
}


TAU_MINUTES = {
    "delay": 60,
    "closure": 240,
    "lift_out": 1440,
    "diversion": 120,
    "crowding": 30,
    "waterlogging": 120,
    "mega_block": float("inf"),
}


@dataclass(frozen=True)
class EvidenceItem:
    source_type: str
    weight: float
    age_minutes: float
    supporting: bool = True


def source_trust(source_type: str) -> float:
    """Return the SPEC trust weight for an evidence source."""
    return SOURCE_TRUST.get(source_type, SOURCE_TRUST["crowd"])


def decay(age_minutes: float, event_type: str) -> float:
    """
    Evidence decay from SPEC §4.5.

    decay = exp(-age_min / tau_type)
    """
    tau = TAU_MINUTES.get(event_type, 60)

    if math.isinf(tau):
        return 1.0

    return math.exp(-max(0.0, age_minutes) / tau)


def support_score(evidence: list[EvidenceItem]) -> float:
    """
    Combine independent supporting evidence.

    support = 1 - product(1 - w_i)
    """
    result = 1.0

    for item in evidence:
        if item.supporting:
            result *= 1.0 - item.weight

    return 1.0 - result


def contradiction_score(
    evidence: list[EvidenceItem],
    strongest_support_trust: float,
) -> float:
    """
    Contradiction is counted only when the contradicting source
    has higher trust than the strongest supporting source.
    """
    contradiction = 0.0

    for item in evidence:
        if not item.supporting and item.weight > strongest_support_trust:
            contradiction = max(contradiction, item.weight)

    return contradiction


def confidence(
    evidence: list[EvidenceItem],
    event_type: str,
) -> float:
    """
    Calculate deterministic verification confidence.

    confidence = clamp(
        support * decay - contradiction,
        0,
        1,
    )
    """
    supporting = [item for item in evidence if item.supporting]

    if not supporting:
        return 0.0

    support = support_score(supporting)

    strongest_support = max(
        supporting,
        key=lambda item: source_trust(item.source_type),
    )

    average_decay = sum(
        decay(item.age_minutes, event_type)
        for item in supporting
    ) / len(supporting)

    contradiction = contradiction_score(
        evidence,
        source_trust(strongest_support.source_type),
    )

    value = support * average_decay - contradiction

    return max(0.0, min(1.0, value))


def status_for_confidence(value: float) -> str:
    """Map confidence to the SPEC §4.6 status thresholds."""
    if value >= 0.70:
        return "confirmed"

    if value >= 0.40:
        return "possible"

    return "ignored"