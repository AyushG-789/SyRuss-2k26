"""Turn the seed files into per-event evidence using their ground-truth labels.

Until extraction (B7) and merging (B2) exist, this "oracle" grouping lets us test scoring on its
own: every report / news item / official notice already says which event it belongs to in its
`expected` block. Items dated on another day (not HH:MM) are skipped — they're about other days.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from ..clock import parse_hhmm
from ..data_loader import SeedData, load_seed
from ..schemas import Affected, DisruptionType, Severity
from .evidence import RawEvidence

HHMM = re.compile(r"^\d{2}:\d{2}$")
NOT_SUPPORT = {"running_normally", "not_a_disruption"}


@dataclass
class SeedEvent:
    event_id: str
    type: DisruptionType | None = None
    severity: Severity = "medium"
    expected_status: str | None = None
    affected: Affected = field(default_factory=Affected)
    evidence: list[RawEvidence] = field(default_factory=list)


def _add_affected(ev: SeedEvent, affected: dict | None) -> None:
    if not affected:
        return
    for key in ("line_ids", "stop_ids", "transfer_ids"):
        merged = getattr(ev.affected, key)
        merged.extend(x for x in affected.get(key, []) if x not in merged)


def _event(events: dict[str, SeedEvent], event_id: str) -> SeedEvent:
    return events.setdefault(event_id, SeedEvent(event_id=event_id))


def seed_events(seed: SeedData | None = None) -> dict[str, SeedEvent]:
    seed = seed or load_seed()
    events: dict[str, SeedEvent] = {}

    for r in seed.reports.values():
        exp = r["expected"]
        if not exp.get("event"):
            continue  # noise: not a disruption
        ev = _event(events, exp["event"])
        contradicts = exp.get("type") in NOT_SUPPORT
        if not contradicts:
            if ev.type is None:
                ev.type = exp["type"]
                ev.severity = exp.get("severity", "medium")
            ev.expected_status = ev.expected_status or exp.get("status")
            _add_affected(ev, exp.get("affected"))
        ev.evidence.append(RawEvidence(
            source_type="crowd", ref_id=r["report_id"], at=parse_hhmm(r["reported_at"]),
            reporter_id=r["reporter_id"], text=r["text"], contradicts=contradicts,
        ))

    for n in seed.news.values():
        exp = n["expected"]
        if not exp.get("event") or not HHMM.match(n["published_at"]):
            continue
        _event(events, exp["event"]).evidence.append(RawEvidence(
            source_type="news", ref_id=n["news_id"], at=parse_hhmm(n["published_at"]),
            text=n["title"], contradicts=exp.get("type") in NOT_SUPPORT,
        ))

    weather_alerts: list[RawEvidence] = []
    for a in seed.official.values():
        exp = a["expected"]
        if not HHMM.match(a["published_at"]):
            continue
        at = parse_hhmm(a["published_at"])
        if a["source_type"] == "weather":
            weather_alerts.append(RawEvidence(source_type="weather", ref_id=a["alert_id"], at=at, text=a["text"]))
            continue
        if exp.get("event"):
            _event(events, exp["event"]).evidence.append(RawEvidence(
                source_type="official", ref_id=a["alert_id"], at=at, text=a["text"],
                contradicts=exp.get("type") in NOT_SUPPORT,
            ))
        for other in exp.get("also_supports", []):
            _event(events, other).evidence.append(RawEvidence(
                source_type="official", ref_id=a["alert_id"], at=at, text=a["text"], contradicts=False,
            ))

    # An active rain alert is a prior for every waterlogging event (score.py ignores it elsewhere).
    for ev in events.values():
        if ev.type == "waterlogging":
            ev.evidence.extend(weather_alerts)
        ev.evidence.sort(key=lambda e: e.at)
    return events
