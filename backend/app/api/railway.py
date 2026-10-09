"""FastAPI endpoints for live Indian Railways data: running status, schedules, station boards, and disruptions."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query

from ..feeds.railway import (
    check_railway_service,
    get_exceptions_summary,
    get_railway_exceptions,
    get_station_live_board,
    get_train_live_status,
    get_train_schedule,
)

router = APIRouter(prefix="/railway", tags=["railway"])


@router.get("/status")
def get_status() -> dict[str, Any]:
    """Check connectivity and available capabilities for Indian Railways API."""
    return check_railway_service()


@router.get("/train/{train_number}/live")
def get_live_status(train_number: str) -> dict[str, Any]:
    """Get real-time running status, current delay, next halt, and live halt timings."""
    clean_num = train_number.strip().lstrip("#")
    if not clean_num.isdigit():
        raise HTTPException(status_code=400, detail="Train number must be numeric (e.g. 12951)")

    result = get_train_live_status(clean_num)
    if not result.get("ok"):
        status_code = result.get("status_code", 400)
        if status_code in (401, 403, 404, 429, 504):
            raise HTTPException(status_code=status_code, detail=result.get("error", "Failed to retrieve train status"))
        raise HTTPException(status_code=400, detail=result.get("error", "Train status unavailable"))
    return result


@router.get("/train/{train_number}/schedule")
def get_schedule(train_number: str) -> dict[str, Any]:
    """Get timetable, days of operation, stations, and halt timings for a train."""
    clean_num = train_number.strip().lstrip("#")
    if not clean_num.isdigit():
        raise HTTPException(status_code=400, detail="Train number must be numeric (e.g. 12951)")

    result = get_train_schedule(clean_num)
    if not result.get("ok"):
        status_code = result.get("status_code", 400)
        if status_code in (401, 403, 404, 429, 504):
            raise HTTPException(status_code=status_code, detail=result.get("error", "Failed to retrieve train schedule"))
        raise HTTPException(status_code=400, detail=result.get("error", "Train schedule unavailable"))
    return result


@router.get("/station/{station_code}/live")
def get_station_board(station_code: str) -> dict[str, Any]:
    """Get live departures and arrivals board with platforms and delays for a station."""
    clean_code = station_code.strip().upper()
    if not clean_code or len(clean_code) > 10:
        raise HTTPException(status_code=400, detail="Invalid station code (e.g. MMCT, CSMT, BVI, DDR)")

    result = get_station_live_board(clean_code)
    if not result.get("ok"):
        status_code = result.get("status_code", 400)
        if status_code in (401, 403, 404, 429, 504):
            raise HTTPException(status_code=status_code, detail=result.get("error", "Failed to retrieve station board"))
        raise HTTPException(status_code=400, detail=result.get("error", "Station board unavailable"))
    return result


@router.get("/disruptions")
def get_disruptions(
    type: str | None = Query(None, description="Filter: cancelled, diverted, rescheduled"),
    limit: int = Query(25, ge=1, le=100),
) -> dict[str, Any]:
    """Get active Indian Railway cancellations, diversions, and rescheduled trains."""
    result = get_railway_exceptions(exception_type=type, limit=limit)
    if not result.get("ok"):
        status_code = result.get("status_code", 500)
        if status_code in (401, 403, 429, 504):
            raise HTTPException(status_code=status_code, detail=result.get("error", "Failed to retrieve disruptions"))
        raise HTTPException(status_code=500, detail=result.get("error", "Disruptions unavailable"))
    return result


@router.get("/disruptions/summary")
def get_disruptions_summary() -> dict[str, Any]:
    """Get summary statistics of active railway disruptions."""
    result = get_exceptions_summary()
    if not result.get("ok"):
        status_code = result.get("status_code", 500)
        if status_code in (401, 403, 429, 504):
            raise HTTPException(status_code=status_code, detail=result.get("error", "Failed to retrieve summary"))
        raise HTTPException(status_code=500, detail=result.get("error", "Summary unavailable"))
    return result
