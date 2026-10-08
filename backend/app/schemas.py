"""Shared Pydantic models. Field names and enums MUST match SPEC.md §3 exactly."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Mode = Literal["local", "metro", "bus", "walk", "auto", "taxi", "cab", "ferry"]
DisruptionType = Literal[
    "delay", "closure", "lift_out", "diversion", "crowding",
    "waterlogging", "mega_block", "running_normally", "not_a_disruption",
]
Severity = Literal["low", "medium", "high"]
SourceType = Literal["crowd", "news", "official", "weather"]
EventStatus = Literal["confirmed", "possible", "ignored", "expired", "coordinated"]
Lang = Literal["en", "hi", "mr", "hi-en", "mr-en"]
Priority = Literal["fastest", "cheapest", "fewest_transfers", "most_reliable", "balanced"]


class Affected(BaseModel):
    line_ids: list[str] = []
    stop_ids: list[str] = []
    transfer_ids: list[str] = []


class RawReport(BaseModel):
    report_id: str
    reporter_id: str
    text: str
    lat: float | None = None
    lon: float | None = None
    reported_at: str
    lang: Lang | None = None


class StructuredReport(BaseModel):
    report_id: str
    is_disruption: bool
    affected: Affected
    type: DisruptionType
    severity: Severity
    started_at: str | None = None
    evidence_span: str
    source_type: SourceType = "crowd"


class Evidence(BaseModel):
    source_type: SourceType
    ref_id: str
    reporter_id: str | None = None
    weight: float
    at: str
    contradicts: bool = False
    covers: list[str] = []          # ref_ids folded into this one (repeat reporter / coordinated burst)


class Event(BaseModel):
    event_id: str
    type: DisruptionType
    severity: Severity
    affected: Affected
    first_seen: str
    last_seen: str
    confidence: float = Field(ge=0, le=1)
    status: EventStatus
    expires_at: str
    evidence: list[Evidence] = []
    flags: list[str] = []
    expected_delay_min: int = 0


class Place(BaseModel):
    label: str
    lat: float
    lon: float
    poi_id: str | None = None


class ItineraryStop(BaseModel):
    poi_id: str
    visit_min: int | None = None
    must_visit: bool = True
    fixed_time: str | None = None


class Itinerary(BaseModel):
    day_start: str
    day_end: str
    stops: list[ItineraryStop] = Field(max_length=5)


class Traveller(BaseModel):
    traveller_id: str
    name: str
    origin: Place
    destination: Place | None = None
    leave_at: str | None = None
    arrive_by: str | None = None
    hard_deadline: bool = False
    max_budget_inr: int | None = None
    max_walk_min: int | None = None
    max_transfers: int | None = None
    priority: Priority = "balanced"
    modes_allowed: list[Mode]
    step_free: bool = False
    heavy_luggage: bool = False
    avoid_crowds: bool = False
    language: Literal["en", "hi", "mr"] = "en"
    itinerary: Itinerary | None = None


class Leg(BaseModel):
    mode: Mode
    line_id: str | None = None
    from_id: str
    to_id: str
    depart: str
    arrive: str
    duration_min: int
    cost_inr: int
    walk_m: int = 0
    step_free: bool
    event_ids: list[str] = []
    risk: float = 0.0


class RouteCard(BaseModel):
    plan_id: str
    label: Literal["fastest", "optimal", "cheapest"]
    recommended: bool
    legs: list[Leg]
    duration_min: int
    cost_inr: int
    transfers: int
    walk_min: int
    reliability: float = Field(ge=0, le=1)
    reliability_colour: Literal["green", "yellow", "red"]
    score: float = Field(ge=0, le=10)
    reason: str = ""
    facts: dict = {}
