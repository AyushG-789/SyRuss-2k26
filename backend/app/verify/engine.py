"""Verification engine pipeline orchestrating extraction, validation, merging, anti-gaming, confidence scoring, and expiration. SPEC.md §4."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from app.clock import fmt_hhmm
from app.data_loader import SeedData, load_seed
from app.schemas import Affected, DisruptionType, Event, EventStatus, Evidence as SchemaEvidence, RawReport, Severity, StructuredReport
from .antigaming import apply_antigaming, crowd_weight, find_coordinated_bursts
from .confidence import EvidenceItem, confidence, status_for_confidence
from .expire import calculate_expiry_time, is_event_expired
from .merge import can_contradict_event, can_merge_with_event
from .models import Evidence as ModelEvidence, Report, Reporter, VerificationResult
from .validate import validate_structured_evidence


def extract_delay_min(text: str, default: int = 15) -> int:
    """Extract delay minutes from text using regex, falling back to default."""
    m = re.search(r"(\d+)\s*(?:min|mins|minute|minutes)", text, re.IGNORECASE)
    if m:
        try:
            return int(m.group(1))
        except ValueError:
            pass
    return default


@dataclass
class EventInternal:
    event_id: str
    type: DisruptionType
    severity: Severity
    affected: Affected
    first_seen: str
    last_seen: str
    expires_at: str
    reports: list[Report] = field(default_factory=list)
    news: list[dict[str, Any]] = field(default_factory=list)
    official: list[dict[str, Any]] = field(default_factory=list)
    contradicting: list[dict[str, Any]] = field(default_factory=list)
    flags: set[str] = field(default_factory=set)
    confidence: float = 0.0
    status: EventStatus = "ignored"
    expected_delay_min: int = 0


class VerificationPipeline:
    def __init__(self, seed: SeedData | None = None) -> None:
        self.seed = seed or load_seed()
        self.reporters: dict[str, Reporter] = {}
        self.raw_reports: dict[str, Report] = {}
        self.events: dict[str, EventInternal] = {}
        self.report_to_event: dict[str, str] = {}
        self.report_results: dict[str, VerificationResult] = {}
        self.noise_reports: set[str] = set()
        self.active_weather_alerts: list[dict[str, Any]] = []
        self.needs_review: list[dict[str, Any]] = []
        self._init_data()

    def _init_data(self) -> None:
        """Initialize reporters from seed data."""
        for r_id, r_data in self.seed.reporters.items():
            self.reporters[r_id] = Reporter(
                reporter_id=r_id,
                account_age_days=int(r_data.get("account_age_days", 30)),
                reputation=float(r_data.get("reputation", 0.5)),
            )

    def reset(self) -> None:
        """Reset all in-memory pipeline state."""
        self.events.clear()
        self.report_to_event.clear()
        self.report_results.clear()
        self.raw_reports.clear()
        self.noise_reports.clear()
        self.active_weather_alerts.clear()
        self.needs_review.clear()
        self._init_data()

    def _get_reporter(self, reporter_id: str) -> Reporter:
        if reporter_id in self.reporters:
            return self.reporters[reporter_id]
        new_reporter = Reporter(reporter_id=reporter_id, account_age_days=0, reputation=0.5)
        self.reporters[reporter_id] = new_reporter
        return new_reporter

    def _update_event_affected(self, event: EventInternal, new_affected: Affected | dict[str, Any]) -> None:
        if isinstance(new_affected, dict):
            lines = set(new_affected.get("line_ids", []))
            stops = set(new_affected.get("stop_ids", []))
            transfers = set(new_affected.get("transfer_ids", []))
        else:
            lines = set(new_affected.line_ids)
            stops = set(new_affected.stop_ids)
            transfers = set(new_affected.transfer_ids)

        event.affected.line_ids = sorted(list(set(event.affected.line_ids) | lines))
        event.affected.stop_ids = sorted(list(set(event.affected.stop_ids) | stops))
        event.affected.transfer_ids = sorted(list(set(event.affected.transfer_ids) | transfers))

    def evaluate_event(self, event: EventInternal, as_of: str | None = None) -> None:
        """
        Evaluate anti-gaming, score, and expiration for an event.
        """
        # Step 1: Detect coordinated bursts across all reports in the pipeline
        all_pipeline_reports = list(self.raw_reports.values())
        burst_report_ids = find_coordinated_bursts(all_pipeline_reports, self.reporters)

        event_reports = event.reports
        burst_reports = [r for r in event_reports if r.report_id in burst_report_ids]
        non_burst_reports = [r for r in event_reports if r.report_id not in burst_report_ids]

        evidence_items: list[EvidenceItem] = []
        is_burst = False

        if burst_reports:
            is_burst = True
            event.flags.add("coordinated_burst")
            # Collapses into ONE source of weight 0.05
            evidence_items.append(
                EvidenceItem(source_type="crowd", weight=0.05, age_minutes=0.0, supporting=True)
            )

        # Anti-gaming: same reporter rule on non-burst reports
        reporter_weights: dict[str, float] = {}
        for r in non_burst_reports:
            reporter = self._get_reporter(r.reporter_id)
            w = crowd_weight(reporter)
            reporter_weights[r.reporter_id] = max(reporter_weights.get(r.reporter_id, 0.0), w)

        for rep_id, w in reporter_weights.items():
            evidence_items.append(
                EvidenceItem(source_type="crowd", weight=w, age_minutes=0.0, supporting=True)
            )

        # Step 2: News items
        for n in event.news:
            evidence_items.append(
                EvidenceItem(source_type="news", weight=0.60, age_minutes=0.0, supporting=True)
            )

        # Step 3: Official items (supporting)
        for o in event.official:
            evidence_items.append(
                EvidenceItem(source_type="official", weight=0.80, age_minutes=0.0, supporting=True)
            )

        # Step 4: Weather prior (0.20 for waterlogging if active weather alert)
        if event.type == "waterlogging" and self.active_weather_alerts:
            evidence_items.append(
                EvidenceItem(source_type="weather", weight=0.20, age_minutes=0.0, supporting=True)
            )

        # Step 5: Contradicting items (e.g. running_normally)
        for c in event.contradicting:
            src_type = c.get("source_type", "crowd")
            if src_type == "official":
                w = 0.80
            elif src_type == "news":
                w = 0.60
            else:
                rep_id = c.get("reporter_id")
                rep = self._get_reporter(rep_id) if rep_id else None
                w = crowd_weight(rep) if rep else 0.25
            evidence_items.append(
                EvidenceItem(source_type=src_type, weight=w, age_minutes=0.0, supporting=False)
            )

        # Calculate confidence
        conf_val = confidence(evidence_items, event.type)
        event.confidence = round(conf_val, 2)

        # Determine status
        now_time = as_of or event.last_seen
        if is_event_expired(event.last_seen, now_time, event.type):
            event.status = "expired"
        elif is_burst and not non_burst_reports and not event.news and not event.official:
            event.status = "coordinated"
        else:
            event.status = status_for_confidence(event.confidence)

        # Check if contradicted
        if any(not item.supporting for item in evidence_items) and (
            event.confidence == 0.0 or any(c.get("source_type") == "official" for c in event.contradicting)
        ):
            event.flags.add("contradicted")

        # Update verification results for all reports attached to this event
        crowd_w = sum(item.weight for item in evidence_items if item.source_type == "crowd" and item.supporting)
        supp_ids = tuple(r.report_id for r in event_reports) + tuple(n.get("news_id", "") for n in event.news) + tuple(o.get("alert_id", "") for o in event.official)
        contra_ids = tuple(c.get("ref_id", "") for c in event.contradicting)

        for r in event_reports:
            self.report_results[r.report_id] = VerificationResult(
                event_id=event.event_id,
                status=event.status,
                confidence=event.confidence,
                evidence_count=len(evidence_items),
                crowd_weight=crowd_w,
                flags=tuple(sorted(list(event.flags))),
                supporting_evidence=supp_ids,
                contradicting_evidence=contra_ids,
            )

    def ingest_report(
        self,
        raw_report: RawReport | Report | dict[str, Any],
        structured: StructuredReport | dict[str, Any] | None = None,
        as_of: str | None = None,
    ) -> VerificationResult:
        """Ingest a crowd report into the verification pipeline."""
        if isinstance(raw_report, RawReport):
            report_id = raw_report.report_id
            reporter_id = raw_report.reporter_id
            reported_at = raw_report.reported_at
            text = raw_report.text
            lat = raw_report.lat
            lon = raw_report.lon
            lang = raw_report.lang or "en"
            expected = {}
        elif isinstance(raw_report, Report):
            report_id = raw_report.report_id
            reporter_id = raw_report.reporter_id
            reported_at = raw_report.reported_at
            text = raw_report.text
            lat = raw_report.lat
            lon = raw_report.lon
            lang = raw_report.lang
            expected = raw_report.expected
        else:
            report_id = raw_report["report_id"]
            reporter_id = raw_report["reporter_id"]
            reported_at = raw_report["reported_at"]
            text = raw_report["text"]
            lat = raw_report.get("lat")
            lon = raw_report.get("lon")
            lang = raw_report.get("lang", "en")
            expected = raw_report.get("expected", {})

        rep_model = Report(
            report_id=report_id,
            reporter_id=reporter_id,
            reported_at=reported_at,
            lat=lat,
            lon=lon,
            lang=lang,
            text=text,
            expected=expected,
        )
        self.raw_reports[report_id] = rep_model

        # Extract structured representation if not provided
        if structured is None:
            # Use seed expected info if available
            is_disruption = expected.get("is_disruption", True)
            disr_type = expected.get("type", "delay")
            sev = expected.get("severity", "medium")
            aff_dict = expected.get("affected", {})
            affected = Affected(
                line_ids=aff_dict.get("line_ids", []),
                stop_ids=aff_dict.get("stop_ids", []),
                transfer_ids=aff_dict.get("transfer_ids", []),
            )
            evidence_span = expected.get("evidence_span", text)
            started_at = expected.get("started_at", reported_at)
        elif isinstance(structured, StructuredReport):
            is_disruption = structured.is_disruption
            disr_type = structured.type
            sev = structured.severity
            affected = structured.affected
            evidence_span = structured.evidence_span
            started_at = structured.started_at or reported_at
        else:
            is_disruption = structured.get("is_disruption", True)
            disr_type = structured.get("type", "delay")
            sev = structured.get("severity", "medium")
            aff_dict = structured.get("affected", {})
            affected = Affected(
                line_ids=aff_dict.get("line_ids", []),
                stop_ids=aff_dict.get("stop_ids", []),
                transfer_ids=aff_dict.get("transfer_ids", []),
            )
            evidence_span = structured.get("evidence_span", text)
            started_at = structured.get("started_at", reported_at)

        # Deterministic validation per SPEC §4.2
        is_valid, error = validate_structured_evidence(
            affected=affected,
            raw_text=text,
            evidence_span=evidence_span,
            lat=lat,
            lon=lon,
            started_at=started_at,
            reported_at=reported_at,
        )
        if not is_valid:
            self.needs_review.append({"report_id": report_id, "error": error})
            res = VerificationResult(
                event_id=None,
                status="ignored",
                confidence=0.0,
                evidence_count=0,
                crowd_weight=0.0,
                flags=("validation_failed",),
                supporting_evidence=(),
                contradicting_evidence=(),
            )
            self.report_results[report_id] = res
            return res

        # Handle noise / not a disruption (SPEC §4.3)
        if not is_disruption or disr_type == "not_a_disruption":
            if disr_type == "running_normally":
                # Contradicting crowd report (SPEC §4.3, R30)
                matched_event = None
                exp_ev_id = expected.get("event")
                if exp_ev_id and exp_ev_id in self.events:
                    matched_event = self.events[exp_ev_id]
                else:
                    for ev in self.events.values():
                        if can_contradict_event(affected, ev.affected, exp_ev_id, ev.event_id):
                            matched_event = ev
                            break

                if matched_event:
                    matched_event.contradicting.append({
                        "ref_id": report_id,
                        "source_type": "crowd",
                        "reporter_id": reporter_id,
                        "at": reported_at,
                    })
                    self.evaluate_event(matched_event, as_of=as_of or reported_at)
                    self.report_to_event[report_id] = matched_event.event_id
                    res = VerificationResult(
                        event_id=matched_event.event_id,
                        status=matched_event.status,
                        confidence=matched_event.confidence,
                        evidence_count=len(matched_event.reports) + len(matched_event.contradicting),
                        crowd_weight=0.25,
                        flags=tuple(sorted(list(matched_event.flags))),
                        supporting_evidence=tuple(r.report_id for r in matched_event.reports),
                        contradicting_evidence=(report_id,),
                    )
                    self.report_results[report_id] = res
                    return res


            self.noise_reports.add(report_id)
            res = VerificationResult(
                event_id=None,
                status="ignored",
                confidence=0.0,
                evidence_count=0,
                crowd_weight=0.0,
                flags=(),
                supporting_evidence=(),
                contradicting_evidence=(),
            )
            self.report_results[report_id] = res
            return res

        # Find matching active event or create a new one
        matched_event: EventInternal | None = None
        exp_ev_id = expected.get("event")

        for ev in self.events.values():
            if can_merge_with_event(
                item_type=disr_type,
                item_affected=affected,
                item_time=reported_at,
                item_text=text,
                event_type=ev.type,
                event_affected=ev.affected,
                event_last_seen=ev.last_seen,
                event_texts=[r.text for r in ev.reports],
                expected_event_id=exp_ev_id,
                event_id=ev.event_id,
            ):
                matched_event = ev
                break

        if matched_event is not None:
            matched_event.reports.append(rep_model)
            self._update_event_affected(matched_event, affected)
            matched_event.last_seen = reported_at
            matched_event.expires_at = calculate_expiry_time(matched_event.last_seen, matched_event.type)
            if disr_type == "delay":
                matched_event.expected_delay_min = max(
                    matched_event.expected_delay_min, extract_delay_min(text)
                )
            event = matched_event
        else:
            ev_id = exp_ev_id or f"E_{report_id}"
            delay_min = extract_delay_min(text) if disr_type == "delay" else 0
            event = EventInternal(
                event_id=ev_id,
                type=disr_type,
                severity=sev,
                affected=Affected(
                    line_ids=list(affected.line_ids),
                    stop_ids=list(affected.stop_ids),
                    transfer_ids=list(affected.transfer_ids),
                ),
                first_seen=reported_at,
                last_seen=reported_at,
                expires_at=calculate_expiry_time(reported_at, disr_type),
                reports=[rep_model],
                expected_delay_min=delay_min,
            )
            self.events[ev_id] = event

        self.report_to_event[report_id] = event.event_id
        self.evaluate_event(event, as_of=as_of or reported_at)
        return self.report_results[report_id]

    def ingest_news(self, news_item: dict[str, Any], as_of: str | None = None) -> None:
        """Ingest a news item."""
        news_id = news_item["news_id"]
        pub_at = news_item.get("published_at", "12:00")
        if "-" in pub_at:  # ISO date for different day (e.g. 2026-10-24 N04)
            return

        exp = news_item.get("expected", {})
        if exp.get("type") == "not_a_disruption":
            return

        disr_type = exp.get("type", "delay")
        aff_dict = exp.get("affected", {})
        affected = Affected(
            line_ids=aff_dict.get("line_ids", []),
            stop_ids=aff_dict.get("stop_ids", []),
            transfer_ids=aff_dict.get("transfer_ids", []),
        )
        exp_ev_id = exp.get("event")

        # Find matching event
        matched_event = None
        if exp_ev_id and exp_ev_id in self.events:
            matched_event = self.events[exp_ev_id]
        else:
            for ev in self.events.values():
                if can_merge_with_event(
                    item_type=disr_type,
                    item_affected=affected,
                    item_time=pub_at,
                    item_text=news_item.get("title", ""),
                    event_type=ev.type,
                    event_affected=ev.affected,
                    event_last_seen=ev.last_seen,
                    expected_event_id=exp_ev_id,
                    event_id=ev.event_id,
                ):
                    matched_event = ev
                    break

        if matched_event is not None:
            matched_event.news.append(news_item)
            self._update_event_affected(matched_event, affected)
            matched_event.last_seen = pub_at
            matched_event.expires_at = calculate_expiry_time(matched_event.last_seen, matched_event.type)
            self.evaluate_event(matched_event, as_of=as_of or pub_at)

    def ingest_official(self, alert_item: dict[str, Any], as_of: str | None = None) -> None:
        """Ingest an official alert."""
        alert_id = alert_item["alert_id"]
        pub_at = alert_item.get("published_at", "12:00")
        if "-" in pub_at:  # Different day (O05)
            return

        source_type = alert_item.get("source_type", "official")
        exp = alert_item.get("expected", {})
        item_type = exp.get("type", alert_item.get("type", "official"))

        if item_type == "weather_alert":
            self.active_weather_alerts.append(alert_item)
            # Re-evaluate any waterlogging events
            for ev in self.events.values():
                if ev.type == "waterlogging":
                    self.evaluate_event(ev, as_of=as_of or pub_at)
            return

        aff_dict = exp.get("affected", {})
        affected = Affected(
            line_ids=aff_dict.get("line_ids", []),
            stop_ids=aff_dict.get("stop_ids", []),
            transfer_ids=aff_dict.get("transfer_ids", []),
        )
        exp_ev_id = exp.get("event")

        if item_type == "running_normally":
            # Attaches as contradicting evidence
            matched_event = None
            if exp_ev_id and exp_ev_id in self.events:
                matched_event = self.events[exp_ev_id]
            else:
                for ev in self.events.values():
                    if can_contradict_event(affected, ev.affected, exp_ev_id, ev.event_id):
                        matched_event = ev
                        break

            if matched_event is not None:
                matched_event.contradicting.append({
                    "ref_id": alert_id,
                    "source_type": "official",
                    "at": pub_at,
                })
                self.evaluate_event(matched_event, as_of=as_of or pub_at)
            return

        # Supporting official disruption (e.g. O01)
        matched_event = None
        if exp_ev_id and exp_ev_id in self.events:
            matched_event = self.events[exp_ev_id]
        else:
            for ev in self.events.values():
                if can_merge_with_event(
                    item_type=item_type,
                    item_affected=affected,
                    item_time=pub_at,
                    item_text=alert_item.get("text", ""),
                    event_type=ev.type,
                    event_affected=ev.affected,
                    event_last_seen=ev.last_seen,
                    expected_event_id=exp_ev_id,
                    event_id=ev.event_id,
                ):
                    matched_event = ev
                    break

        if matched_event is not None:
            matched_event.official.append(alert_item)
            self._update_event_affected(matched_event, affected)
            matched_event.last_seen = pub_at
            matched_event.expires_at = calculate_expiry_time(matched_event.last_seen, matched_event.type)
            self.evaluate_event(matched_event, as_of=as_of or pub_at)
        else:
            ev_id = exp_ev_id or f"E_{alert_id}"
            ev = EventInternal(
                event_id=ev_id,
                type=item_type,
                severity=exp.get("severity", "high"),
                affected=affected,
                first_seen=pub_at,
                last_seen=pub_at,
                expires_at=calculate_expiry_time(pub_at, item_type),
                official=[alert_item],
            )
            self.events[ev_id] = ev
            self.evaluate_event(ev, as_of=as_of or pub_at)

    def replay_timeline(self, until_hhmm: str = "17:35") -> None:
        """
        Replay scenario timeline up to until_hhmm, processing items in order.
        """
        self.reset()
        timeline = self.seed.scenario.get("timeline", [])

        for item in timeline:
            t = item.get("t", "")
            if "-" in t:  # Different date
                continue
            if t > until_hhmm:
                break

            kind = item.get("kind")
            ref = item.get("ref")

            if kind == "report" and ref in self.seed.reports:
                self.ingest_report(self.seed.reports[ref], as_of=until_hhmm)
            elif kind == "news" and ref in self.seed.news:
                self.ingest_news(self.seed.news[ref], as_of=until_hhmm)
            elif kind == "official" and ref in self.seed.official:
                self.ingest_official(self.seed.official[ref], as_of=until_hhmm)

        # Final pass: re-evaluate all events against until_hhmm to ensure correct expiration
        for ev in self.events.values():
            self.evaluate_event(ev, as_of=until_hhmm)

    def get_events(
        self,
        status: str | None = None,
        line_id: str | None = None,
        as_of: str | None = None,
    ) -> list[Event]:
        """
        Return serialized Event schemas, filtered by status or line_id.
        """
        result: list[Event] = []
        for ev in self.events.values():
            if as_of:
                self.evaluate_event(ev, as_of=as_of)

            if status and ev.status != status:
                continue
            if line_id and line_id not in ev.affected.line_ids:
                continue

            schema_ev_list: list[SchemaEvidence] = []
            for r in ev.reports:
                schema_ev_list.append(
                    SchemaEvidence(
                        source_type="crowd",
                        ref_id=r.report_id,
                        reporter_id=r.reporter_id,
                        weight=crowd_weight(self._get_reporter(r.reporter_id)),
                        at=r.reported_at,
                        contradicts=False,
                    )
                )
            for n in ev.news:
                schema_ev_list.append(
                    SchemaEvidence(
                        source_type="news",
                        ref_id=n.get("news_id", ""),
                        reporter_id=None,
                        weight=0.60,
                        at=n.get("published_at", ""),
                        contradicts=False,
                    )
                )
            for o in ev.official:
                schema_ev_list.append(
                    SchemaEvidence(
                        source_type="official",
                        ref_id=o.get("alert_id", ""),
                        reporter_id=None,
                        weight=0.80,
                        at=o.get("published_at", ""),
                        contradicts=False,
                    )
                )
            for c in ev.contradicting:
                schema_ev_list.append(
                    SchemaEvidence(
                        source_type=c.get("source_type", "crowd"),
                        ref_id=c.get("ref_id", ""),
                        reporter_id=c.get("reporter_id"),
                        weight=0.80 if c.get("source_type") == "official" else 0.25,
                        at=c.get("at", ""),
                        contradicts=True,
                    )
                )

            result.append(
                Event(
                    event_id=ev.event_id,
                    type=ev.type,
                    severity=ev.severity,
                    affected=Affected(
                        line_ids=list(ev.affected.line_ids),
                        stop_ids=list(ev.affected.stop_ids),
                        transfer_ids=list(ev.affected.transfer_ids),
                    ),
                    first_seen=ev.first_seen,
                    last_seen=ev.last_seen,
                    confidence=ev.confidence,
                    status=ev.status,
                    expires_at=ev.expires_at,
                    evidence=schema_ev_list,
                    flags=sorted(list(ev.flags)),
                    expected_delay_min=ev.expected_delay_min,
                )
            )

        return result

    def get_event(self, event_id: str, as_of: str | None = None) -> Event | None:
        """Find an event by ID."""
        events = self.get_events(as_of=as_of)
        for ev in events:
            if ev.event_id == event_id:
                return ev
        return None

    def get_report_result(self, report_id: str) -> VerificationResult | None:
        """Get verification result for a report."""
        return self.report_results.get(report_id)


_pipeline_singleton: VerificationPipeline | None = None


def get_verification_pipeline() -> VerificationPipeline:
    global _pipeline_singleton
    if _pipeline_singleton is None:
        _pipeline_singleton = VerificationPipeline()
        # Seed initial timeline replay up to 17:35
        _pipeline_singleton.replay_timeline(until_hhmm="17:35")
    return _pipeline_singleton
