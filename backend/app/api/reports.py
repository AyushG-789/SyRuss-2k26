"""Submit a crowd report (SPEC.md §4.2, §10).

Until the LLM extractor (B7) exists, the caller sends the structured fields (type, severity,
affected ids) alongside the free text. Every id is checked against the network data.
"""
from __future__ import annotations

import re

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..clock import clock, fmt_hhmm, parse_hhmm
from ..data_loader import load_seed
from ..schemas import Affected, DisruptionType, EventStatus, Severity
from ..verify.store import store

router = APIRouter(tags=["reports"])
HHMM = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


class ReportIn(BaseModel):
    reporter_id: str = Field(min_length=1, max_length=64)
    text: str = Field(min_length=3, max_length=500)
    type: DisruptionType
    severity: Severity = "medium"
    affected: Affected
    reported_at: str | None = Field(default=None, description="HH:MM on the demo day; default = demo clock now")
    report_id: str | None = None


class ReportOut(BaseModel):
    report_id: str | None
    event_id: str
    created_event: bool
    status: EventStatus
    confidence: float
    reported_at: str


def validate_affected(affected: Affected) -> list[str]:
    seed = load_seed()
    errors = [f"unknown stop_id {s!r}" for s in affected.stop_ids if s not in seed.stations]
    errors += [f"unknown line_id {l!r}" for l in affected.line_ids if l not in seed.lines]
    errors += [f"unknown transfer_id {t!r}" for t in affected.transfer_ids if t not in seed.transfers]
    if affected.line_ids and affected.stop_ids and not errors:
        for sid in affected.stop_ids:
            if not set(seed.lines_by_stop.get(sid, [])) & set(affected.line_ids):
                errors.append(f"stop {sid!r} is not on line(s) {affected.line_ids}")
    if not (affected.stop_ids or affected.line_ids or affected.transfer_ids):
        errors.append("affected must name at least one stop, line or transfer")
    return errors


@router.post("/reports", response_model=ReportOut, status_code=201)
def submit_report(body: ReportIn) -> ReportOut:
    if body.type == "not_a_disruption":
        raise HTTPException(status_code=422, detail="Not a disruption — nothing to record")
    errors = validate_affected(body.affected)
    if body.reported_at is not None and not HHMM.match(body.reported_at):
        errors.append("reported_at must be HH:MM")
    if errors:
        raise HTTPException(status_code=422, detail=errors)

    now = clock.now()
    at = parse_hhmm(body.reported_at) if body.reported_at else now
    if at > now:
        raise HTTPException(status_code=422, detail="reported_at is later than the demo clock")
    try:
        event_id, created = store.add_report(
            report_id=body.report_id, reporter_id=body.reporter_id, text=body.text, at=at,
            type=body.type, severity=body.severity, affected=body.affected,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    detail = store.detail(event_id, now)
    assert detail is not None
    event = detail["event"]
    return ReportOut(report_id=body.report_id, event_id=event_id, created_event=created,
                     status=event.status, confidence=event.confidence, reported_at=fmt_hhmm(at))
