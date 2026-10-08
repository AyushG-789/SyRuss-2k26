from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class Reporter:
    reporter_id: str
    account_age_days: int
    reputation: float


@dataclass(frozen=True)
class Report:
    report_id: str
    reporter_id: str
    reported_at: str
    lat: float | None
    lon: float | None
    lang: str
    text: str
    expected: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class Evidence:
    evidence_id: str
    source_type: str
    published_at: str
    text: str
    event_id: str | None = None
    evidence_type: str | None = None
    affected: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class VerificationResult:
    event_id: str | None
    status: str
    confidence: float
    evidence_count: int
    crowd_weight: float
    flags: tuple[str, ...] = ()
    supporting_evidence: tuple[str, ...] = ()
    contradicting_evidence: tuple[str, ...] = ()