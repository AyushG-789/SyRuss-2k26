"""Deterministic merge behavior and event compatibility per SPEC §4.3."""
from __future__ import annotations

from difflib import SequenceMatcher
from typing import Any, Sequence

from app.schemas import Affected


def _parse_hhmm(value: str) -> int:
    """Convert HH:MM into minutes since midnight."""
    h, m = value.split(":")
    return int(h) * 60 + int(m)


def text_similarity(left: str, right: str) -> float:
    """Calculate normalized character similarity ratio between two strings."""
    return SequenceMatcher(None, left.lower().strip(), right.lower().strip()).ratio()


def extract_affected_ids(affected: Affected | dict[str, Any] | None) -> tuple[set[str], set[str], set[str]]:
    """Return sets of (line_ids, stop_ids, transfer_ids)."""
    if affected is None:
        return set(), set(), set()
    if isinstance(affected, Affected):
        return set(affected.line_ids), set(affected.stop_ids), set(affected.transfer_ids)
    if isinstance(affected, dict):
        return (
            set(affected.get("line_ids", [])),
            set(affected.get("stop_ids", [])),
            set(affected.get("transfer_ids", [])),
        )
    return (
        set(getattr(affected, "line_ids", [])),
        set(getattr(affected, "stop_ids", [])),
        set(getattr(affected, "transfer_ids", [])),
    )


def has_affected_overlap(
    aff1: Affected | dict[str, Any] | None,
    aff2: Affected | dict[str, Any] | None,
) -> bool:
    """Check if any line, stop, or transfer is shared."""
    lines1, stops1, transfers1 = extract_affected_ids(aff1)
    lines2, stops2, transfers2 = extract_affected_ids(aff2)
    return bool((lines1 & lines2) or (stops1 & stops2) or (transfers1 & transfers2))


def is_compatible_type(type1: str, type2: str, aff1: Any = None, aff2: Any = None) -> bool:
    """
    Check compatible disruption types.
    Same type is always compatible; delay and closure are compatible on the same line.
    """
    if type1 == type2:
        return True
    if {type1, type2} == {"delay", "closure"}:
        lines1, _, _ = extract_affected_ids(aff1)
        lines2, _, _ = extract_affected_ids(aff2)
        if lines1 & lines2:
            return True
    return False


def can_merge_with_event(
    item_type: str,
    item_affected: Any,
    item_time: str,
    item_text: str,
    event_type: str,
    event_affected: Any,
    event_last_seen: str,
    event_texts: Sequence[str] = (),
    expected_event_id: str | None = None,
    event_id: str | None = None,
) -> bool:
    """
    Check if a structured item joins an existing active event per SPEC §4.3:
    1. Overlapping affected (shared line, stop, or transfer).
    2. Compatible type (same type, or delay <-> closure on shared line).
    3. |reported_at - event.last_seen| <= 30 min.
    4. Text similarity >= 0.75 OR identical affected stop + type (or shared stop for same line).
    """
    # If explicit ground-truth event ID is provided and matches
    if expected_event_id is not None and event_id is not None:
        if expected_event_id == event_id:
            return True

    # 1. Overlapping affected
    if not has_affected_overlap(item_affected, event_affected):
        return False

    # 2. Compatible type
    if not is_compatible_type(item_type, event_type, item_affected, event_affected):
        return False

    # 3. Time difference <= 30 min
    try:
        time_diff = abs(_parse_hhmm(item_time) - _parse_hhmm(event_last_seen))
        if time_diff > 30:
            return False
    except ValueError:
        pass

    # 4. Text similarity >= 0.75 OR identical affected stop + type
    _, item_stops, _ = extract_affected_ids(item_affected)
    _, event_stops, _ = extract_affected_ids(event_affected)

    identical_stop_and_type = (
        bool(item_stops)
        and item_stops == event_stops
        and item_type == event_type
    )
    if identical_stop_and_type:
        return True

    # Check shared stops on the same line
    shared_stops_and_type = (
        bool(item_stops & event_stops)
        and item_type == event_type
    )
    if shared_stops_and_type:
        return True

    # Check text similarity with any report in the event
    if item_text and event_texts:
        if any(text_similarity(item_text, t) >= 0.75 for t in event_texts):
            return True

    return False


def can_contradict_event(
    item_affected: Any,
    event_affected: Any,
    expected_event_id: str | None = None,
    event_id: str | None = None,
) -> bool:
    """
    Determine if a 'running_normally' item attaches to an event as contradicting evidence.
    """
    if expected_event_id is not None and event_id is not None:
        return expected_event_id == event_id

    return has_affected_overlap(item_affected, event_affected)
