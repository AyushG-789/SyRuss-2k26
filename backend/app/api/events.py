"""Verification and disruption events endpoints. SPEC.md §10."""
from __future__ import annotations

from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.clock import clock, fmt_hhmm
from app.schemas import Event, RawReport, StructuredReport
from app.verify.engine import get_verification_pipeline

router = APIRouter(tags=["events"])


class ReportIngestResponse(BaseModel):
    report_id: str
    structured: StructuredReport | None = None
    event_id: str | None = None
    status: str | None = None
    confidence: float = 0.0
    flags: list[str] = []


@router.get("/events", response_model=list[Event])
def get_events(
    status: str | None = Query(None, description="Filter by event status"),
    line_id: str | None = Query(None, description="Filter by affected line_id"),
) -> list[Event]:
    """Retrieve disruption events, optionally filtered by status or line."""
    pipeline = get_verification_pipeline()
    current_time = fmt_hhmm(clock.now())
    return pipeline.get_events(status=status, line_id=line_id, as_of=current_time)


@router.post("/reports", response_model=ReportIngestResponse)
def submit_report(report: RawReport) -> ReportIngestResponse:
    """Submit a crowd report for validation and verification."""
    pipeline = get_verification_pipeline()
    current_time = fmt_hhmm(clock.now())
    res = pipeline.ingest_report(report, as_of=current_time)
    return ReportIngestResponse(
        report_id=report.report_id,
        event_id=res.event_id,
        status=res.status,
        confidence=res.confidence,
        flags=list(res.flags),
    )
