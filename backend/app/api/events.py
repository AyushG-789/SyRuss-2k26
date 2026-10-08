"""Read the live disruption list (SPEC.md §10). Results depend on the demo clock."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..clock import clock
from ..schemas import Event, EventStatus
from ..verify import policy
from ..verify.store import store

router = APIRouter(tags=["events"])


@router.get("/events", response_model=list[Event])
def list_events(status: EventStatus | None = None, line_id: str | None = None,
                stop_id: str | None = None) -> list[Event]:
    """Every disruption reported so far on the demo clock, newest first, with live confidence."""
    return store.events(clock.now(), status=status, line_id=line_id, stop_id=stop_id)


@router.get("/events/{event_id}")
def get_event(event_id: str) -> dict:
    """One event plus how its confidence was worked out (each piece of evidence and its weight)."""
    detail = store.detail(event_id, clock.now())
    if detail is None:
        raise HTTPException(status_code=404, detail=f"No event {event_id!r} at this time")
    return detail


@router.get("/verify/policy")
def get_policy() -> dict:
    """All Pakka Check weights, thresholds and lifetimes (for the transparency page)."""
    return policy.as_dict()
