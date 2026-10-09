"""Stations and hubs API: search, nearby exploration, and details."""
from __future__ import annotations

import re
from fastapi import APIRouter, HTTPException, Query

from app.data_loader import load_seed
from app.routing.fares import haversine_km
from app.schemas import StationSearchItem

router = APIRouter(prefix="/stations", tags=["stations"])


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


@router.get("/search", response_model=list[StationSearchItem])
def search_stations(
    q: str = Query(default=""),
    mode: str = Query(default="all"),
    limit: int = Query(default=20, ge=1, le=100),
) -> list[StationSearchItem]:
    """Search stations by name, code, line, or aliases. Empty q returns major hubs."""
    seed = load_seed()
    qn = _norm(q)
    results: list[tuple[int, StationSearchItem]] = []

    # Priority hubs for empty query
    major_hub_ids = [
        "andheri_wr", "andheri_m1", "dadar_wr", "dadar_cr", "dadar_m3",
        "csmt", "csmt_m3", "ghatkopar", "ghatkopar_m1", "bandra",
        "bkc_m3", "borivali", "thane", "churchgate", "mumbai_central"
    ]

    for sid, s in seed.stations.items():
        st_mode = s["mode"]
        if mode != "all":
            # Map "rail" -> "local"
            effective_mode = "local" if mode == "rail" else mode
            if effective_mode != st_mode:
                continue

        lines = seed.lines_by_stop.get(sid, [])
        aliases = s.get("aliases") or []
        item = StationSearchItem(
            id=sid,
            name=s["name"],
            mode=st_mode,
            lat=s["lat"],
            lon=s["lon"],
            step_free=s.get("step_free", False),
            aliases=aliases,
            lines=lines,
        )

        if not qn:
            # Rank major hubs first
            rank = major_hub_ids.index(sid) if sid in major_hub_ids else 999
            results.append((rank, item))
            continue

        name_norm = _norm(s["name"])
        id_norm = _norm(sid)
        alias_norms = [_norm(a) for a in aliases]
        line_norms = [_norm(l) for l in lines]

        # Scoring: lower score = better match
        score = 999
        if name_norm == qn:
            score = 0
        elif any(an == qn for an in alias_norms):
            score = 1
        elif name_norm.startswith(qn + " ") or name_norm.startswith(qn):
            score = 2
        elif any(an.startswith(qn + " ") or an.startswith(qn) for an in alias_norms):
            score = 3
        elif qn in name_norm:
            score = 4
        elif any(qn in an for an in alias_norms):
            score = 5
        elif id_norm == qn or id_norm.startswith(qn):
            score = 6
        elif any(qn in ln for ln in line_norms):
            score = 7

        if score < 999:
            results.append((score, item))

    results.sort(key=lambda t: (t[0], len(t[1].name)))
    return [item for _, item in results[:limit]]


@router.get("/nearby", response_model=list[StationSearchItem])
def nearby_stations(
    lat: float = Query(...),
    lon: float = Query(...),
    radius_km: float = Query(default=1.5, ge=0.1, le=50.0),
    mode: str = Query(default="all"),
    limit: int = Query(default=30, ge=1, le=100),
) -> list[StationSearchItem]:
    """Find stations within radius_km from (lat, lon), sorted by distance."""
    seed = load_seed()
    items: list[StationSearchItem] = []

    for sid, s in seed.stations.items():
        st_mode = s["mode"]
        if mode != "all":
            effective_mode = "local" if mode == "rail" else mode
            if effective_mode != st_mode:
                continue

        d_km = haversine_km(lat, lon, s["lat"], s["lon"])
        if d_km <= radius_km:
            lines = seed.lines_by_stop.get(sid, [])
            items.append(
                StationSearchItem(
                    id=sid,
                    name=s["name"],
                    mode=st_mode,
                    lat=s["lat"],
                    lon=s["lon"],
                    step_free=s.get("step_free", False),
                    aliases=s.get("aliases") or [],
                    lines=lines,
                    distance_km=round(d_km, 3),
                    distance_m=int(round(d_km * 1000)),
                )
            )

    items.sort(key=lambda x: x.distance_km or 0.0)
    return items[:limit]


@router.get("/{station_id}", response_model=StationSearchItem)
def get_station(station_id: str) -> StationSearchItem:
    """Get single station by id."""
    seed = load_seed()
    s = seed.stations.get(station_id)
    if not s:
        raise HTTPException(status_code=404, detail=f"Station '{station_id}' not found")
    return StationSearchItem(
        id=station_id,
        name=s["name"],
        mode=s["mode"],
        lat=s["lat"],
        lon=s["lon"],
        step_free=s.get("step_free", False),
        aliases=s.get("aliases") or [],
        lines=seed.lines_by_stop.get(station_id, []),
    )
