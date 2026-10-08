"""Confidence scoring for one disruption event (SPEC.md §4.5–4.7).

    support       = 1 − Π(1 − wᵢ)              over supporting evidence (after anti-gaming)
    decay         = exp(−max(0, age − 15) / τ)  age = minutes since the last supporting evidence
    contradiction = max weight of "running normally" evidence from a source ranked HIGHER
                    than the strongest supporting source (official > news > crowd)
    confidence    = clamp(support × decay − contradiction, 0, 1)

Only evidence with `at <= now` is used, so replaying the demo clock gives the right answer at
every minute. Pure functions — no database, no LLM.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from ..schemas import DisruptionType, EventStatus
from . import antigaming, policy
from .evidence import RawEvidence, WeightedEvidence


@dataclass
class ScoreResult:
    confidence: float
    status: EventStatus
    support: float
    decay: float
    contradiction: float
    first_seen: datetime | None
    last_seen: datetime | None
    expires_at: datetime | None
    flags: list[str] = field(default_factory=list)
    evidence: list[WeightedEvidence] = field(default_factory=list)

    def explain(self) -> str:
        """One line for logs / the transparency page, e.g. '3 crowd + 1 news → 83% confirmed'."""
        counts: dict[str, int] = {}
        for w in self.evidence:
            if not w.raw.contradicts:
                key = f"burst of {len(w.covers)}" if w.burst else w.source_type
                counts[key] = counts.get(key, 0) + 1
        parts = " + ".join(f"{n} {src}" for src, n in counts.items()) or "no support"
        extra = f" ({', '.join(self.flags)})" if self.flags else ""
        return f"{parts} → {round(self.confidence * 100)}% {self.status}{extra}"


def status_for(confidence: float) -> EventStatus:
    if confidence >= policy.CONFIRMED_AT:
        return "confirmed"
    if confidence >= policy.POSSIBLE_AT:
        return "possible"
    return "ignored"


def decay_factor(event_type: DisruptionType, age_min: float) -> float:
    tau = policy.DECAY_TAU_MIN.get(event_type)
    if tau is None:
        return 1.0
    return math.exp(-max(0.0, age_min - policy.DECAY_GRACE_MIN) / tau)


def combine(weights: list[float]) -> float:
    """Independent sources: chance that at least one of them is right."""
    remaining = 1.0
    for w in weights:
        remaining *= 1.0 - w
    return 1.0 - remaining


def evaluate(
    event_type: DisruptionType,
    evidence: list[RawEvidence],
    reporters: antigaming.Reporters,
    now: datetime,
) -> ScoreResult:
    current = [e for e in evidence if e.at <= now]
    # Weather is only a prior for waterlogging; it never supports anything else.
    if event_type != "waterlogging":
        current = [e for e in current if e.source_type != "weather"]

    weighted, flags = antigaming.weigh(current, reporters)
    supporting = [w for w in weighted if not w.raw.contradicts]
    contradicting = [w for w in weighted if w.raw.contradicts]

    # first/last seen come from the raw items, so repeated reports keep an event fresh even
    # though they only count once. The weather prior alone never makes an event "seen".
    seen = [e.at for e in current if not e.contradicts and e.source_type != "weather"]
    first_seen = min(seen) if seen else None
    last_seen = max(seen) if seen else None

    support = combine([w.weight for w in supporting]) if seen else 0.0
    age_min = (now - last_seen).total_seconds() / 60 if last_seen else 0.0
    decay = decay_factor(event_type, age_min) if last_seen else 0.0

    strongest = max((policy.SOURCE_RANK[w.source_type] for w in supporting), default=-1)
    contradiction = max(
        (w.weight for w in contradicting if policy.SOURCE_RANK[w.source_type] > strongest),
        default=0.0,
    )
    if contradiction > 0:
        flags.append("contradicted")

    confidence = round(min(max(support * decay - contradiction, 0.0), 1.0), 3)

    lifetime = policy.LIFETIME_MIN.get(event_type)
    expires_at = last_seen + timedelta(minutes=lifetime) if (last_seen and lifetime is not None) else None

    status: EventStatus
    if not seen:
        status = "ignored"
    elif expires_at is not None and now > expires_at:
        status = "expired"
    elif "coordinated_burst" in flags and all(w.burst for w in supporting):
        status = "coordinated"   # nothing but the burst supports it
    else:
        status = status_for(confidence)

    return ScoreResult(
        confidence=confidence,
        status=status,
        support=round(support, 3),
        decay=round(decay, 3),
        contradiction=round(contradiction, 3),
        first_seen=first_seen,
        last_seen=last_seen,
        expires_at=expires_at,
        flags=flags,
        evidence=weighted,
    )
