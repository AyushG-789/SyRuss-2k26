"""Simulated clock. Every module asks this for the current time — never datetime.now().

The demo moves time with POST /admin/clock (set / advance / play at a speed), so reports arrive,
confidence rises and events expire on screen. SPEC.md §0 rule 4 and §10.
"""
from __future__ import annotations

import time
from datetime import date, datetime, timedelta

from .config import settings


def parse_hhmm(value: str, on: date | None = None) -> datetime:
    """'17:05' -> datetime on the demo date."""
    day = on or date.fromisoformat(settings.demo_date)
    hours, minutes = (int(x) for x in value.split(":"))
    return datetime(day.year, day.month, day.day) + timedelta(hours=hours, minutes=minutes)


def fmt_hhmm(value: datetime) -> str:
    return value.strftime("%H:%M")


class SimClock:
    def __init__(self, start: datetime) -> None:
        self._sim_at_anchor = start
        self._real_anchor = time.monotonic()
        self.speed = 0.0  # simulated seconds per real second; 0 = paused

    def now(self) -> datetime:
        elapsed = (time.monotonic() - self._real_anchor) * self.speed
        return self._sim_at_anchor + timedelta(seconds=elapsed)

    def _reanchor(self, sim_now: datetime) -> None:
        self._sim_at_anchor = sim_now
        self._real_anchor = time.monotonic()

    def set(self, when: datetime) -> None:
        self._reanchor(when)

    def advance(self, minutes: float) -> None:
        self._reanchor(self.now() + timedelta(minutes=minutes))

    def set_speed(self, speed: float) -> None:
        if speed < 0:
            raise ValueError("speed must be >= 0")
        self._reanchor(self.now())
        self.speed = speed


clock = SimClock(parse_hhmm("16:30"))
