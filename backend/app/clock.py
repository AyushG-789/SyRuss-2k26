"""Simulated clock. Every module asks this for the current time — never datetime.now().

The demo moves time with POST /admin/clock (set / advance / play at a speed), so reports arrive,
confidence rises and events expire on screen. SPEC.md §0 rule 4 and §10.

The clock is three numbers: the demo time at an anchor, the real time of that anchor, and the speed.
On a single server (local) they live here. On Vercel the backend runs as several short-lived
copies, each with its own memory, so a clock kept only in memory jumps around between requests.
The browser therefore keeps the three numbers and sends them with every request in the
`X-Demo-Clock` header; for that request the clock uses them instead (see `request_clock`).
Real time is wall-clock seconds (time.time), so every server copy computes the same "now".
"""
from __future__ import annotations

import time
from contextvars import ContextVar
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from .config import settings

HEADER = "x-demo-clock"


def parse_hhmm(value: str, on: date | None = None) -> datetime:
    """'17:05' -> datetime on the demo date."""
    day = on or date.fromisoformat(settings.demo_date)
    hours, minutes = (int(x) for x in value.split(":"))
    return datetime(day.year, day.month, day.day) + timedelta(hours=hours, minutes=minutes)


def fmt_hhmm(value: datetime) -> str:
    return value.strftime("%H:%M")


@dataclass(frozen=True)
class ClockState:
    sim_at_anchor: datetime   # demo time at the anchor
    real_anchor: float        # wall-clock seconds (time.time) at the anchor
    speed: float              # simulated seconds per real second; 0 = paused

    def now(self) -> datetime:
        return self.sim_at_anchor + timedelta(seconds=(time.time() - self.real_anchor) * self.speed)

    def encode(self) -> str:
        """'2026-10-20T16:30:00|1791540000.123|60' — what the browser stores and sends back."""
        return f"{self.sim_at_anchor.isoformat(timespec='seconds')}|{self.real_anchor:.3f}|{self.speed:g}"

    @staticmethod
    def decode(raw: str) -> ClockState | None:
        try:
            sim, real, speed = raw.split("|")
            state = ClockState(datetime.fromisoformat(sim), float(real), float(speed))
        except (ValueError, TypeError):
            return None
        return state if state.speed >= 0 else None


# The clock a request brought with it (None = use this server's own clock).
_request_state: ContextVar[ClockState | None] = ContextVar("demo_clock", default=None)


class SimClock:
    def __init__(self, start: datetime) -> None:
        self._state = ClockState(start, time.time(), 0.0)

    # -- the state in force: the request's own, else this server's
    def state(self) -> ClockState:
        return _request_state.get() or self._state

    def _put(self, state: ClockState) -> None:
        self._state = state
        if _request_state.get() is not None:
            _request_state.set(state)   # later reads in this request see the change too

    @property
    def speed(self) -> float:
        return self.state().speed

    def now(self) -> datetime:
        return self.state().now()

    def set(self, when: datetime) -> None:
        self._put(ClockState(when, time.time(), self.speed))

    def advance(self, minutes: float) -> None:
        self._put(ClockState(self.now() + timedelta(minutes=minutes), time.time(), self.speed))

    def set_speed(self, speed: float) -> None:
        if speed < 0:
            raise ValueError("speed must be >= 0")
        self._put(ClockState(self.now(), time.time(), speed))


def request_clock(raw: str | None):
    """Use the browser's clock for the rest of this request (FastAPI middleware calls this)."""
    state = ClockState.decode(raw) if raw else None
    return _request_state.set(state)


def reset_request_clock(token) -> None:
    _request_state.reset(token)


clock = SimClock(parse_hhmm("16:30"))
