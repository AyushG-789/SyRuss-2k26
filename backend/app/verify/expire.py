"""Deterministic event expiration per SPEC §4.7."""
from __future__ import annotations

import math

EVENT_LIFETIMES_MIN: dict[str, float] = {
    "delay": 45,
    "closure": 240,
    "lift_out": 1440,
    "diversion": 120,
    "crowding": 30,
    "waterlogging": 120,
    "mega_block": float("inf"),
}


def _parse_hhmm(value: str) -> int:
    """Convert HH:MM to minutes since midnight."""
    h, m = value.split(":")
    return int(h) * 60 + int(m)


def _fmt_hhmm(minutes: int) -> str:
    """Convert minutes since midnight back to HH:MM format."""
    wrapped = minutes % (24 * 60)
    return f"{wrapped // 60:02d}:{wrapped % 60:02d}"


def get_event_lifetime(event_type: str) -> float:
    """Return the maximum lifetime in minutes for an event type per SPEC §4.7."""
    return EVENT_LIFETIMES_MIN.get(event_type, 60.0)


def calculate_expiry_time(last_seen_hhmm: str, event_type: str) -> str:
    """
    Calculate the HH:MM expiry time from last_seen and event_type.
    New supporting evidence extends it per SPEC §4.7.
    """
    lifetime = get_event_lifetime(event_type)
    if math.isinf(lifetime):
        return "23:59"
    total_min = _parse_hhmm(last_seen_hhmm) + int(lifetime)
    return _fmt_hhmm(total_min)


def is_event_expired(last_seen_hhmm: str, current_hhmm: str, event_type: str) -> bool:
    """
    Check if an event is expired at current_hhmm relative to its last_seen timestamp.
    """
    lifetime = get_event_lifetime(event_type)
    if math.isinf(lifetime):
        return False
    diff = _parse_hhmm(current_hhmm) - _parse_hhmm(last_seen_hhmm)
    return diff > lifetime
