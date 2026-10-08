"""FastAPI entry point. Run from backend/:  uvicorn app.main:app --reload --port 8000"""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import admin
from .clock import clock, fmt_hhmm
from .config import settings
from .data_loader import load_seed

app = FastAPI(title="TravelBuddy API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(admin.router)


@app.get("/health")
def health() -> dict:
    seed = load_seed()
    return {
        "status": "ok",
        "clock": fmt_hhmm(clock.now()),
        "demo_date": settings.demo_date,
        "data": {
            "stations": len(seed.stations),
            "lines": len(seed.lines),
            "pois": len(seed.pois),
            "travellers": len(seed.travellers),
            "reports": len(seed.reports),
        },
    }
