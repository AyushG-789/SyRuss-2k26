"""FastAPI entry point. Run from backend/:  uvicorn app.main:app --reload --port 8000"""
from __future__ import annotations

import asyncio
import contextlib
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import admin, chat, events, journeys, plan, reports, voice
from .clock import clock, fmt_hhmm
from .config import settings
from .data_loader import load_seed



@asynccontextmanager
async def lifespan(_: FastAPI):
    # Live alerts: watch the clock, events and saved journeys; push changes over /ws/alerts.
    task = asyncio.create_task(journeys.hub.run())
    yield
    task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await task


app = FastAPI(title="TravelBuddy API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(admin.router)
app.include_router(chat.router)
app.include_router(events.router)
app.include_router(journeys.router)
app.include_router(plan.router)
app.include_router(reports.router)
app.include_router(voice.router)


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
