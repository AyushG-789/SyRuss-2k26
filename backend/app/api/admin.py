"""Demo controls: simulated clock. Inject/reset land here later (SPEC.md §10)."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..clock import clock, fmt_hhmm, parse_hhmm

router = APIRouter(prefix="/admin", tags=["admin"])


class ClockUpdate(BaseModel):
    set: str | None = None          # "HH:MM"
    advance_min: float | None = None
    speed: float | None = None      # simulated seconds per real second, 0 = pause


def _state() -> dict:
    now = clock.now()
    return {"now": fmt_hhmm(now), "iso": now.isoformat(timespec="seconds"), "speed": clock.speed}


@router.get("/clock")
def get_clock() -> dict:
    return _state()


@router.post("/clock")
def update_clock(body: ClockUpdate) -> dict:
    try:
        if body.set is not None:
            clock.set(parse_hhmm(body.set))
        if body.advance_min is not None:
            clock.advance(body.advance_min)
        if body.speed is not None:
            clock.set_speed(body.speed)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return _state()
