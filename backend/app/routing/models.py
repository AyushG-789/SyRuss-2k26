"""Typed models for network data: stations, lines, transfers, and fares. SPEC.md §2 and §5."""
from __future__ import annotations

from pydantic import BaseModel, Field

from app.schemas import Mode


class Station(BaseModel):
    id: str
    name: str
    mode: Mode
    lat: float
    lon: float
    step_free: bool = False
    aliases: list[str] = Field(default_factory=list)
    coord_source: str | None = None
    lifts: bool | None = None


class Line(BaseModel):
    id: str
    name: str
    operator: str
    mode: Mode
    color: str = "#888888"
    verify: bool = False
    stations: list[str]
    run_minutes: list[int]
    headway_min: dict[str, int]


class Transfer(BaseModel):
    id: str
    a: str
    b: str
    walk_min: int
    step_free: bool = False
    via: str | None = None


class FareSlabConfig(BaseModel):
    applies_to_modes: list[Mode] = Field(default_factory=list)
    applies_to_lines: list[str] = Field(default_factory=list)
    type: str = "slab"
    slabs_km: list[float]
    fares_inr: list[int]
    verify: bool = False
    source: str = ""


class LastMileWalk(BaseModel):
    speed_kmh: float = 4.5
    step_free_speed_kmh: float = 3.0
    detour_factor: float = 1.3


class LastMileAuto(BaseModel):
    min_fare_inr: int = 26
    min_km: float = 1.5
    per_km_inr: float = 17.0
    speed_kmh: float = 18.0
    wait_min: int = 5
    detour_factor: float = 1.4
    not_allowed_south_of_lat: float = 19.04
    verify: bool = False
    source: str = ""


class LastMileTaxi(BaseModel):
    min_fare_inr: int = 31
    min_km: float = 1.5
    per_km_inr: float = 21.0
    speed_kmh: float = 18.0
    wait_min: int = 5
    detour_factor: float = 1.4
    verify: bool = False
    source: str = ""


class LastMileCab(BaseModel):
    base_inr: int = 50
    per_km_inr: float = 14.0
    per_min_inr: float = 1.5
    surge: float = 1.0
    speed_kmh: float = 18.0
    wait_min: int = 6
    detour_factor: float = 1.4
    verify: bool = False
    source: str = ""


class FareConfig(BaseModel):
    transit: dict[str, FareSlabConfig]
    ticketing: dict[str, bool] = Field(default_factory=lambda: {"same_system_through_ticket": True})
    walk: LastMileWalk = Field(default_factory=LastMileWalk)
    auto: LastMileAuto = Field(default_factory=LastMileAuto)
    taxi: LastMileTaxi = Field(default_factory=LastMileTaxi)
    cab: LastMileCab = Field(default_factory=LastMileCab)


def parse_fare_config(raw: dict) -> FareConfig:
    transit = {}
    for key, val in raw.get("transit", {}).items():
        transit[key] = FareSlabConfig.model_validate(val)
    last_mile = raw.get("last_mile", {})
    return FareConfig(
        transit=transit,
        ticketing=raw.get("ticketing", {"same_system_through_ticket": True}),
        walk=LastMileWalk.model_validate(last_mile.get("walk", {})),
        auto=LastMileAuto.model_validate(last_mile.get("auto", {})),
        taxi=LastMileTaxi.model_validate(last_mile.get("taxi", {})),
        cab=LastMileCab.model_validate(last_mile.get("cab", {})),
    )
