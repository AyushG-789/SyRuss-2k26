"""Deterministic validation of structured evidence against network data. SPEC.md §4.2."""
from __future__ import annotations

from typing import Any, Mapping

from app.data_loader import load_seed
from app.routing.fares import haversine_km
from app.schemas import Affected, RawReport, StructuredReport


def normalize_text(text: str) -> str:
    """Normalize text for substring comparison (lowercase, collapsed whitespace)."""
    return " ".join(text.lower().split())


def _parse_hhmm(value: str) -> int:
    """Convert HH:MM into minutes since midnight."""
    h, m = value.split(":")
    return int(h) * 60 + int(m)


def validate_structured_evidence(
    affected: Affected | dict[str, Any] | None,
    raw_text: str | None = None,
    evidence_span: str | None = None,
    lat: float | None = None,
    lon: float | None = None,
    started_at: str | None = None,
    reported_at: str | None = None,
    stations: Mapping[str, Any] | None = None,
    lines: Mapping[str, Any] | None = None,
    transfers: Mapping[str, Any] | None = None,
    stops_by_line: Mapping[str, list[str]] | None = None,
) -> tuple[bool, str | None]:
    """
    Validate structured evidence per SPEC §4.2.

    Rejection conditions:
    1. Every line_id / stop_id / transfer_id must exist in the network data.
    2. Each stop_id must be served by at least one line_id given (if both given).
    3. If GPS is present: nearest affected stop within 2 km of the GPS point.
    4. evidence_span is a substring of the raw text (case-insensitive, whitespace-normalised).
    5. started_at <= reported_at.

    Returns:
        (True, None) if all checks pass.
        (False, error_reason) if any check fails.
    """
    if stations is None or lines is None or transfers is None or stops_by_line is None:
        seed = load_seed()
        stations = stations or seed.stations
        lines = lines or seed.lines
        transfers = transfers or seed.transfers
        stops_by_line = stops_by_line or seed.stops_by_line

    # Extract lists of affected IDs
    if affected is None:
        line_ids: list[str] = []
        stop_ids: list[str] = []
        transfer_ids: list[str] = []
    elif isinstance(affected, Affected):
        line_ids = list(affected.line_ids)
        stop_ids = list(affected.stop_ids)
        transfer_ids = list(affected.transfer_ids)
    elif isinstance(affected, dict):
        line_ids = list(affected.get("line_ids", []))
        stop_ids = list(affected.get("stop_ids", []))
        transfer_ids = list(affected.get("transfer_ids", []))
    else:
        line_ids = getattr(affected, "line_ids", [])
        stop_ids = getattr(affected, "stop_ids", [])
        transfer_ids = getattr(affected, "transfer_ids", [])

    # Rule 1: Every line_id / stop_id / transfer_id must exist
    for lid in line_ids:
        if lid not in lines:
            return False, f"Unknown line_id: '{lid}'"
    for sid in stop_ids:
        if sid not in stations:
            return False, f"Unknown stop_id: '{sid}'"
    for tid in transfer_ids:
        if tid not in transfers:
            return False, f"Unknown transfer_id: '{tid}'"

    # Rule 2: Each stop_id is served by at least one line_id given (if both are given)
    if line_ids and stop_ids:
        for sid in stop_ids:
            served = any(sid in stops_by_line.get(lid, []) for lid in line_ids)
            if not served:
                return False, f"Stop '{sid}' is not served by any of the specified lines: {line_ids}"

    # Rule 3: If GPS is present, nearest affected stop within 2 km of the GPS point
    if lat is not None and lon is not None:
        if stop_ids:
            stop_distances = [
                haversine_km(lat, lon, stations[sid]["lat"], stations[sid]["lon"])
                for sid in stop_ids
                if sid in stations
            ]
            if stop_distances and min(stop_distances) > 2.0:
                min_d = min(stop_distances)
                return False, f"GPS ({lat:.4f}, {lon:.4f}) is {min_d:.2f} km away from nearest affected stop (limit: 2.0 km)"
        elif line_ids:
            # When only line_ids are specified, check stations along those lines
            line_stop_distances = [
                haversine_km(lat, lon, stations[sid]["lat"], stations[sid]["lon"])
                for lid in line_ids
                for sid in stops_by_line.get(lid, [])
                if sid in stations
            ]
            if line_stop_distances and min(line_stop_distances) > 2.0:
                min_d = min(line_stop_distances)
                return False, f"GPS ({lat:.4f}, {lon:.4f}) is {min_d:.2f} km away from nearest station on line (limit: 2.0 km)"

    # Rule 4: evidence_span is a substring of the raw text (case-insensitive, whitespace-normalised)
    if evidence_span and raw_text:
        norm_span = normalize_text(evidence_span)
        norm_raw = normalize_text(raw_text)
        if norm_span and norm_span not in norm_raw:
            return False, f"evidence_span '{evidence_span}' is not a substring of raw text '{raw_text}'"

    # Rule 5: started_at <= reported_at
    if started_at and reported_at:
        try:
            started_min = _parse_hhmm(started_at)
            reported_min = _parse_hhmm(reported_at)
            if started_min > reported_min:
                return False, f"started_at '{started_at}' is later than reported_at '{reported_at}'"
        except ValueError:
            pass

    return True, None


def validate_report(
    structured_report: StructuredReport | dict[str, Any],
    raw_report: RawReport | Any | None = None,
) -> tuple[bool, str | None]:
    """Convenience wrapper for validating structured reports against raw reports."""
    if isinstance(structured_report, dict):
        affected = structured_report.get("affected")
        evidence_span = structured_report.get("evidence_span")
        started_at = structured_report.get("started_at")
    else:
        affected = structured_report.affected
        evidence_span = structured_report.evidence_span
        started_at = structured_report.started_at

    raw_text = None
    lat = None
    lon = None
    reported_at = None

    if raw_report is not None:
        if isinstance(raw_report, dict):
            raw_text = raw_report.get("text")
            lat = raw_report.get("lat")
            lon = raw_report.get("lon")
            reported_at = raw_report.get("reported_at")
        else:
            raw_text = getattr(raw_report, "text", None)
            lat = getattr(raw_report, "lat", None)
            lon = getattr(raw_report, "lon", None)
            reported_at = getattr(raw_report, "reported_at", None)

    return validate_structured_evidence(
        affected=affected,
        raw_text=raw_text,
        evidence_span=evidence_span,
        lat=lat,
        lon=lon,
        started_at=started_at,
        reported_at=reported_at,
    )
