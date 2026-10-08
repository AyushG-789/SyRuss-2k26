from __future__ import annotations

from collections import defaultdict
from dataclasses import replace
from datetime import datetime
from difflib import SequenceMatcher

from .models import Report, Reporter


def parse_hhmm(value: str) -> int:
    """Convert HH:MM into minutes since midnight."""
    hour, minute = value.split(":")
    return int(hour) * 60 + int(minute)


def crowd_weight(reporter: Reporter) -> float:
    """
    Calculate crowd evidence weight using SPEC §4.4.

    Base:
        0.25 * (0.5 + reputation)

    Rules:
        new account (< 1 day) OR reputation < 0.2 -> 0.05
        maximum weight -> 0.35
    """
    if reporter.account_age_days < 1 or reporter.reputation < 0.2:
        return 0.05

    return min(0.35, 0.25 * (0.5 + reporter.reputation))


def text_similarity(left: str, right: str) -> float:
    """Return normalized text similarity in the range 0..1."""
    return SequenceMatcher(None, left.lower().strip(), right.lower().strip()).ratio()


def apply_same_reporter_rule(
    reports: list[Report],
    reporters: dict[str, Reporter],
) -> dict[str, float]:
    """
    One reporter may submit many reports for the same event.

    Per SPEC §4.4, count only that reporter's highest weight for
    that event.
    """
    highest: dict[tuple[str, str], float] = {}

    for report in reports:
        event_id = report.expected.get("event")
        if not event_id:
            continue

        reporter = reporters.get(report.reporter_id)
        if reporter is None:
            continue

        weight = crowd_weight(reporter)
        key = (event_id, report.reporter_id)
        highest[key] = max(highest.get(key, 0.0), weight)

    return highest


def find_coordinated_bursts(
    reports: list[Report],
    reporters: dict[str, Reporter],
    *,
    window_minutes: int = 10,
    similarity_threshold: float = 0.85,
) -> set[str]:
    """
    Find coordinated fake bursts.

    SPEC §4.4:
      >= 3 reports from new accounts on one event,
      within 10 minutes,
      with text similarity >= 0.85.

    The returned report IDs are the reports belonging to a detected burst.
    """
    by_event: dict[str, list[Report]] = defaultdict(list)

    for report in reports:
        event_id = report.expected.get("event")
        if not event_id:
            continue

        reporter = reporters.get(report.reporter_id)
        if reporter is None:
            continue

        if reporter.account_age_days < 1:
            by_event[event_id].append(report)

    burst_ids: set[str] = set()

    for event_reports in by_event.values():
        event_reports.sort(key=lambda report: parse_hhmm(report.reported_at))

        for start_index, start_report in enumerate(event_reports):
            cluster = [start_report]
            start_time = parse_hhmm(start_report.reported_at)

            for candidate in event_reports[start_index + 1 :]:
                candidate_time = parse_hhmm(candidate.reported_at)

                if candidate_time - start_time > window_minutes:
                    break

                if text_similarity(start_report.text, candidate.text) >= similarity_threshold:
                    cluster.append(candidate)

            if len(cluster) >= 3:
                burst_ids.update(report.report_id for report in cluster)

    return burst_ids


def apply_antigaming(
    reports: list[Report],
    reporters: dict[str, Reporter],
) -> tuple[dict[str, float], set[str]]:
    """
    Apply all anti-gaming rules.

    Returns:
        reporter_event_weights:
            Highest crowd weight for each reporter/event pair.

        coordinated_burst_report_ids:
            Reports identified as part of a coordinated burst.
    """
    weights = apply_same_reporter_rule(reports, reporters)
    bursts = find_coordinated_bursts(reports, reporters)

    return weights, bursts