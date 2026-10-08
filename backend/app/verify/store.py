"""In-memory event store: the live list of disruptions (SPEC.md §4, §10).

Events keep ALL their evidence, including items timestamped later than the clock. Every read
re-scores at `now` with `score.evaluate`, so moving the demo clock replays the scenario with no
extra bookkeeping.

Contract with the routing side (Person A):
    active_events(now) -> list[Event]   # confirmed + possible events at `now`
"""
from __future__ import annotations

import threading
import uuid
from dataclasses import dataclass, field, replace
from datetime import datetime, timedelta
from typing import Literal

from ..clock import clock, fmt_hhmm, parse_hhmm
from ..data_loader import load_seed
from ..schemas import Affected, DisruptionType, Event, EventStatus, Severity
from . import policy
from .evidence import RawEvidence
from .score import ScoreResult, evaluate
from .seed import seed_events

ROUTING_STATUSES: set[EventStatus] = {"confirmed", "possible"}

# scripted = every seed item arrives at its scheduled time as the clock moves.
# manual   = only history from before the scenario start is loaded; the presenter injects the rest.
DemoMode = Literal["scripted", "manual"]

# Minutes of extra travel time a confirmed event adds, used by routing (SPEC §4.6).
DELAY_BY_SEVERITY = {"low": 5, "medium": 15, "high": 25}
DELAY_BY_TYPE = {"waterlogging": 10, "crowding": 5}

# Types that may merge into each other on the same line/stop (SPEC §4.3).
COMPATIBLE = {frozenset({"delay", "closure"})}
MERGE_WINDOW_MIN = 30


@dataclass
class StoredEvent:
    event_id: str
    type: DisruptionType
    severity: Severity
    affected: Affected
    evidence: list[RawEvidence] = field(default_factory=list)


def _overlaps(a: Affected, b: Affected) -> bool:
    return bool(set(a.line_ids) & set(b.line_ids)
                or set(a.stop_ids) & set(b.stop_ids)
                or set(a.transfer_ids) & set(b.transfer_ids))


def _compatible(a: str, b: str) -> bool:
    return a == b or frozenset({a, b}) in COMPATIBLE


def expected_delay(ev: StoredEvent) -> int:
    if ev.type == "delay":
        return DELAY_BY_SEVERITY[ev.severity]
    return DELAY_BY_TYPE.get(ev.type, 0)


def _hhmm(value: datetime | None) -> str:
    return fmt_hhmm(value) if value else ""


class EventStore:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._events: dict[str, StoredEvent] = {}
        self.reporters: dict[str, dict] = {}
        self.weather_alerts: list[RawEvidence] = []
        self.mode: DemoMode = "scripted"
        self.injected: list[dict] = []   # [{"ref_id", "at"}] in injection order

    # ---- loading ---------------------------------------------------------------------------
    def reset(self, mode: DemoMode = "scripted") -> None:
        """Reload the demo seed (reports, news, official notices, reporters).

        In manual mode only evidence from before the scenario start is kept (the stale morning
        reports and the afternoon rain alert); everything else waits to be injected.
        """
        seed = load_seed()
        start = parse_hhmm(seed.scenario["start"])
        with self._lock:
            self.mode = mode
            self.injected = []
            self.reporters = {k: dict(v) for k, v in seed.reporters.items()}
            self._events = {}
            self.weather_alerts = []
            for se in seed_events(seed).values():
                evidence = list(se.evidence) if mode == "scripted" else [e for e in se.evidence if e.at < start]
                self._events[se.event_id] = StoredEvent(
                    event_id=se.event_id, type=se.type, severity=se.severity,
                    affected=se.affected.model_copy(deep=True), evidence=evidence,
                )
                if se.type == "waterlogging":
                    self.weather_alerts = [e for e in se.evidence if e.source_type == "weather"]

    def inject(self, ref_ids: list[str], at: datetime) -> list[dict]:
        """Re-send seed items (reports R01–R30, news N.., official O..) as if they arrived at `at`.

        Each copy joins the same event as the original. Returns [{"ref_id", "event_ids"}].
        Raises ValueError for an id that isn't a seed item tied to an event.
        """
        by_ref: dict[str, list[tuple[str, RawEvidence]]] = {}
        for se in seed_events(load_seed()).values():
            for e in se.evidence:
                by_ref.setdefault(e.ref_id, []).append((se.event_id, e))
        unknown = [r for r in ref_ids if r not in by_ref]
        if unknown:
            raise ValueError(f"Not a seed item tied to a disruption: {', '.join(unknown)}")
        out = []
        stamp = fmt_hhmm(at).replace(":", "")
        with self._lock:
            for ref in ref_ids:
                event_ids = []
                for event_id, original in by_ref[ref]:
                    ev = self._events[event_id]
                    copy = replace(original, at=at, ref_id=f"{ref}@{stamp}")
                    if copy.ref_id not in {e.ref_id for e in ev.evidence}:
                        ev.evidence.append(copy)
                        ev.evidence.sort(key=lambda e: e.at)
                    event_ids.append(event_id)
                self.injected.append({"ref_id": ref, "at": fmt_hhmm(at)})
                out.append({"ref_id": ref, "event_ids": event_ids})
        return out

    # ---- reads -----------------------------------------------------------------------------
    def _score(self, ev: StoredEvent, now: datetime) -> ScoreResult:
        return evaluate(ev.type, ev.evidence, self.reporters, now)

    def _to_event(self, ev: StoredEvent, r: ScoreResult) -> Event:
        return Event(
            event_id=ev.event_id,
            type=ev.type,
            severity=ev.severity,
            affected=ev.affected,
            first_seen=_hhmm(r.first_seen),
            last_seen=_hhmm(r.last_seen),
            confidence=r.confidence,
            status=r.status,
            expires_at=_hhmm(r.expires_at) or "until announced end",
            evidence=[w.to_schema() for w in r.evidence],
            flags=r.flags,
            expected_delay_min=expected_delay(ev),
        )

    def events(self, now: datetime, status: str | None = None, line_id: str | None = None,
               stop_id: str | None = None) -> list[Event]:
        """Every event that has been reported by `now`, newest first."""
        out: list[tuple[datetime, Event]] = []
        with self._lock:
            items = list(self._events.values())
        for ev in items:
            r = self._score(ev, now)
            if r.last_seen is None:          # nothing reported yet at this time
                continue
            if status and r.status != status:
                continue
            if line_id and line_id not in ev.affected.line_ids:
                continue
            if stop_id and stop_id not in ev.affected.stop_ids:
                continue
            out.append((r.last_seen, self._to_event(ev, r)))
        out.sort(key=lambda x: x[0], reverse=True)
        return [e for _, e in out]

    def detail(self, event_id: str, now: datetime) -> dict | None:
        with self._lock:
            ev = self._events.get(event_id)
        if ev is None:
            return None
        r = self._score(ev, now)
        if r.last_seen is None:
            return None
        return {
            "event": self._to_event(ev, r),
            "breakdown": {
                "support": r.support, "decay": r.decay, "contradiction": r.contradiction,
                "summary": r.explain(),
                "evidence": [
                    {"ref_id": w.raw.ref_id, "source_type": w.source_type, "reporter_id": w.raw.reporter_id,
                     "at": fmt_hhmm(w.raw.at), "text": w.raw.text, "weight": round(w.weight, 3),
                     "contradicts": w.raw.contradicts, "note": w.note, "covers": list(w.covers)}
                    for w in r.evidence
                ],
            },
        }

    # ---- writes ----------------------------------------------------------------------------
    def add_report(self, *, report_id: str | None, reporter_id: str, text: str, at: datetime,
                   type: DisruptionType, severity: Severity, affected: Affected) -> tuple[str, bool]:
        """Attach a structured crowd report to a matching event, or start a new one.

        Returns (event_id, created). Matching here is the simple rule from SPEC §4.3 (overlapping
        line/stop/transfer + compatible type + within 30 min); B2 adds text similarity.
        """
        contradicts = type in policy.NON_DISRUPTION_TYPES
        raw = RawEvidence(source_type="crowd", ref_id=report_id or f"r_{uuid.uuid4().hex[:8]}", at=at,
                          reporter_id=reporter_id, text=text, contradicts=contradicts)
        with self._lock:
            if reporter_id not in self.reporters:
                # Unknown reporter = brand-new account (anti-gaming weight 0.05).
                self.reporters[reporter_id] = {"account_age_days": 0, "reputation": policy.DEFAULT_REPUTATION}
            window = timedelta(minutes=MERGE_WINDOW_MIN)
            best: StoredEvent | None = None
            best_gap: timedelta | None = None
            for ev in self._events.values():
                if not _overlaps(ev.affected, affected):
                    continue
                if not contradicts and not _compatible(ev.type, type):
                    continue
                times = [e.at for e in ev.evidence if e.at <= at and e.source_type != "weather"]
                if not times:
                    continue
                gap = at - max(times)
                if gap <= window and (best_gap is None or gap < best_gap):
                    best, best_gap = ev, gap
            if best is not None:
                best.evidence.append(raw)
                best.evidence.sort(key=lambda e: e.at)
                for key in ("line_ids", "stop_ids", "transfer_ids"):
                    merged = getattr(best.affected, key)
                    merged.extend(x for x in getattr(affected, key) if x not in merged)
                return best.event_id, False
            if contradicts:
                raise ValueError("A 'running normally' report needs an existing disruption to contradict")
            event_id = f"ev_{uuid.uuid4().hex[:8]}"
            evidence = [raw] + (list(self.weather_alerts) if type == "waterlogging" else [])
            self._events[event_id] = StoredEvent(event_id=event_id, type=type, severity=severity,
                                                 affected=affected.model_copy(deep=True), evidence=evidence)
            return event_id, True


store = EventStore()
store.reset()


def active_events(now: datetime | None = None) -> list[Event]:
    """Confirmed + possible events at `now` (default: the demo clock). Used by routing."""
    return [e for e in store.events(now or clock.now()) if e.status in ROUTING_STATUSES]
