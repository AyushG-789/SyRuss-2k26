"""Saved journeys, replan accept/reject, and the live alerts socket (B9). SPEC.md §8, §10."""
from __future__ import annotations

import asyncio
import contextlib

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect

from ..clock import clock, fmt_hhmm
from ..replan.monitor import journeys
from ..schemas import Journey, JourneyIn
from ..verify.store import store

router = APIRouter(tags=["journeys"])


@router.post("/journeys", response_model=Journey, status_code=201)
def save_journey(body: JourneyIn) -> Journey:
    """Save the route card the traveller chose. The monitor watches it from now on."""
    if not body.card.legs:
        raise HTTPException(status_code=422, detail="card has no legs")
    j = journeys.save(body.traveller, body.card)
    journeys.check(journey_id=j.journey_id)  # a problem may already be confirmed on this route
    return journeys.get(j.journey_id)


@router.get("/journeys", response_model=list[Journey])
def list_journeys() -> list[Journey]:
    journeys.check()
    return journeys.all()


@router.get("/journeys/{journey_id}", response_model=Journey)
def get_journey(journey_id: str) -> Journey:
    """Journey + current card + pending proposal (polling fallback for the socket)."""
    journeys.check(journey_id=journey_id)
    j = journeys.get(journey_id)
    if not j:
        raise HTTPException(status_code=404, detail="journey not found")
    return j


def _decide(journey_id: str, accept: bool) -> Journey:
    j = journeys.get(journey_id)
    if not j:
        raise HTTPException(status_code=404, detail="journey not found")
    if not j.proposal:
        raise HTTPException(status_code=409, detail="no pending replan proposal")
    return journeys.decide(journey_id, accept)


@router.post("/journeys/{journey_id}/replan/accept", response_model=Journey)
def accept_replan(journey_id: str) -> Journey:
    return _decide(journey_id, True)


@router.post("/journeys/{journey_id}/replan/reject", response_model=Journey)
def reject_replan(journey_id: str) -> Journey:
    return _decide(journey_id, False)


# ---- WebSocket /ws/alerts --------------------------------------------------------------------
# Server → client messages:
#   {type:"clock", now}
#   {type:"event_update", event_id, status, confidence}
#   {type:"replan_proposal", journey_id, proposal}   ·   {type:"journey_notice", journey_id, notice}

class AlertHub:
    def __init__(self) -> None:
        self.clients: set[WebSocket] = set()
        self._last_clock = ""
        self._last_status: dict[str, str] = {}
        self._sent: dict[str, str] = {}   # journey_id -> last proposal id / notice sent

    async def broadcast(self, msg: dict) -> None:
        for ws in list(self.clients):
            try:
                await ws.send_json(msg)
            except Exception:  # noqa: BLE001 - a closed socket just drops out
                self.clients.discard(ws)

    def tick(self) -> list[dict]:
        """Everything that changed since the last tick (runs in a worker thread)."""
        now = clock.now()
        msgs: list[dict] = []
        hhmm = fmt_hhmm(now)
        if hhmm != self._last_clock:
            self._last_clock = hhmm
            msgs.append({"type": "clock", "now": hhmm})
        for ev in store.events(now):
            if self._last_status.get(ev.event_id) != ev.status:
                self._last_status[ev.event_id] = ev.status
                msgs.append({"type": "event_update", "event_id": ev.event_id,
                             "status": ev.status, "confidence": ev.confidence})
        journeys.check(now)
        for j in journeys.all():
            if j.proposal and self._sent.get(j.journey_id) != j.proposal.proposal_id:
                self._sent[j.journey_id] = j.proposal.proposal_id
                msgs.append({"type": "replan_proposal", "journey_id": j.journey_id,
                             "proposal": j.proposal.model_dump()})
            elif not j.proposal and j.notice and self._sent.get(j.journey_id) != j.notice:
                self._sent[j.journey_id] = j.notice
                msgs.append({"type": "journey_notice", "journey_id": j.journey_id, "notice": j.notice})
        return msgs

    async def run(self, every_s: float = 1.0) -> None:
        while True:
            if self.clients:
                with contextlib.suppress(Exception):
                    for msg in await asyncio.to_thread(self.tick):
                        await self.broadcast(msg)
            await asyncio.sleep(every_s)


hub = AlertHub()


@router.websocket("/ws/alerts")
async def alerts(ws: WebSocket) -> None:
    await ws.accept()
    hub.clients.add(ws)
    await ws.send_json({"type": "clock", "now": fmt_hhmm(clock.now())})
    try:
        while True:
            await ws.receive_text()  # clients don't need to send anything; this keeps it open
    except WebSocketDisconnect:
        hub.clients.discard(ws)
