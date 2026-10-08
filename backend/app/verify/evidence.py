"""Internal evidence types for the verification engine.

`RawEvidence` is one piece of input (a crowd report, news item, official notice or weather alert)
already tied to an event. Anti-gaming turns raw evidence into `WeightedEvidence`; scoring combines
those into a confidence. The API-facing shape is `schemas.Evidence` (see `to_schema`).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from ..clock import fmt_hhmm
from ..schemas import Evidence, SourceType


@dataclass(frozen=True)
class RawEvidence:
    source_type: SourceType
    ref_id: str
    at: datetime
    reporter_id: str | None = None
    text: str = ""
    contradicts: bool = False   # True = says the problem is NOT happening ("running normally")


@dataclass(frozen=True)
class WeightedEvidence:
    raw: RawEvidence
    weight: float
    note: str = ""                                  # why this weight, e.g. "new account"
    covers: tuple[str, ...] = field(default=())     # ref_ids folded into this one (duplicates, bursts)
    burst: bool = False                             # True = stands for a coordinated burst

    @property
    def source_type(self) -> SourceType:
        return self.raw.source_type

    def to_schema(self) -> Evidence:
        return Evidence(
            source_type=self.raw.source_type,
            ref_id=self.raw.ref_id,
            reporter_id=self.raw.reporter_id,
            weight=round(self.weight, 3),
            at=fmt_hhmm(self.raw.at),
            contradicts=self.raw.contradicts,
            covers=list(self.covers),
        )
