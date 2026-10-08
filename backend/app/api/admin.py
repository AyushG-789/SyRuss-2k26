"""Demo controls: simulated clock, reset, inject and the scenario timeline (SPEC.md §10, §13)."""
from __future__ import annotations

import re

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..clock import clock, fmt_hhmm, parse_hhmm
from ..data_loader import load_seed
from ..verify.store import DemoMode, store

router = APIRouter(prefix="/admin", tags=["admin"])
HHMM = re.compile(r"^\d{2}:\d{2}$")

# One-click buttons for the admin page. Each injects seed items at the current clock time.
PRESETS = [
    {"id": "fake_burst", "label": "Fake burst: 5 new accounts say “Metro 1 completely shut”",
     "refs": ["R04", "R05", "R06", "R07", "R08"], "expect": "Flagged as a suspicious burst — no reroute"},
    {"id": "m1_commuters", "label": "3 commuters: Metro 1 stuck at Saki Naka",
     "refs": ["R15", "R16", "R17"], "expect": "Possible (58%)"},
    {"id": "m1_news", "label": "News: Metro 1 technical snag near Saki Naka",
     "refs": ["N01"], "expect": "With the commuters → confirmed (83%)"},
    {"id": "dadar_crowd", "label": "2 commuters: Dadar CR–WR bridge closed",
     "refs": ["R18", "R19"], "expect": "Possible (44%)"},
    {"id": "dadar_official", "label": "Central Railway notice: Dadar middle FOB closed",
     "refs": ["O01"], "expect": "Confirmed"},
    {"id": "wr_false", "label": "1 commuter: “Western line puri band hai”",
     "refs": ["R23"], "expect": "Ignored (25%)"},
    {"id": "wr_official", "label": "Western Railway notice: services running",
     "refs": ["O02"], "expect": "Cancels the false WR claim"},
    {"id": "bkc_lift", "label": "2 commuters: BKC Metro lift not working",
     "refs": ["R26", "R27"], "expect": "Possible (44%) — blocks step-free routes"},
    {"id": "azad_water", "label": "1 commuter: waterlogging near Azad Maidan",
     "refs": ["R28"], "expect": "Possible (40%) with the rain alert"},
]


class ClockUpdate(BaseModel):
    set: str | None = None          # "HH:MM"
    advance_min: float | None = None
    speed: float | None = None      # simulated seconds per real second, 0 = pause


class ResetIn(BaseModel):
    mode: DemoMode = "scripted"


class InjectIn(BaseModel):
    ref_ids: list[str] = Field(default_factory=list, description="Seed ids, e.g. R04, N01, O01")
    preset: str | None = Field(default=None, description="Or a preset id from GET /admin/presets")


def _state() -> dict:
    now = clock.now()
    return {"now": fmt_hhmm(now), "iso": now.isoformat(timespec="seconds"), "speed": clock.speed,
            "mode": store.mode}


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


@router.post("/reset")
def reset(body: ResetIn | None = None) -> dict:
    """Reload the demo and put the clock back to the scenario start (paused).

    scripted (default): the story plays by itself as the clock moves.
    manual: only pre-16:30 history is loaded; use /admin/inject to make things happen.
    """
    store.reset((body or ResetIn()).mode)
    clock.set(parse_hhmm(load_seed().scenario["start"]))
    clock.set_speed(0)
    return _state()


@router.get("/presets")
def presets() -> list[dict]:
    return PRESETS


@router.post("/inject")
def inject(body: InjectIn) -> dict:
    """Send seed reports / news / notices as if they arrived right now on the demo clock."""
    refs = list(body.ref_ids)
    if body.preset:
        preset = next((p for p in PRESETS if p["id"] == body.preset), None)
        if preset is None:
            raise HTTPException(status_code=404, detail=f"No preset {body.preset!r}")
        refs += preset["refs"]
    if not refs:
        raise HTTPException(status_code=422, detail="Give ref_ids or a preset")
    try:
        injected = store.inject(refs, clock.now())
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {**_state(), "injected": injected}


def _label(kind: str, ref: str | None, item: dict) -> str:
    seed = load_seed()
    if kind == "report" and ref in seed.reports:
        return seed.reports[ref]["text"]
    if kind == "news" and ref in seed.news:
        return f"{seed.news[ref]['outlet']}: {seed.news[ref]['title']}"
    if kind == "official" and ref in seed.official:
        a = seed.official[ref]
        return f"{a['source']}: {a['text']}"
    return item.get("note") or item.get("action", kind)


@router.get("/timeline")
def timeline() -> dict:
    """The scripted story, with which items have already happened on the demo clock."""
    seed = load_seed()
    now = clock.now()
    start = parse_hhmm(seed.scenario["start"])
    injected = {i["ref_id"] for i in store.injected}
    items = []
    for item in seed.scenario["timeline"]:
        t, ref, kind = item["t"], item.get("ref"), item["kind"]
        if not HHMM.match(t):
            state = "other_day"
        elif parse_hhmm(t) < start:
            state = "history"
        elif store.mode == "scripted":
            state = "done" if parse_hhmm(t) <= now else "upcoming"
        else:
            state = "done" if ref in injected else "not_injected"
        items.append({"t": t, "kind": kind, "ref": ref, "label": _label(kind, ref, item), "state": state,
                      "traveller_id": item.get("traveller_id")})
    return {**_state(), "start": seed.scenario["start"], "end": seed.scenario["end"],
            "items": items, "injected": store.injected}
