"""POST /chat — the TravelBuddy assistant (Gemini + our tools). SPEC.md §6."""
from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..llm.chat import chat

router = APIRouter(tags=["chat"])


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    text: str = Field(max_length=2000)


class ChatIn(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=30)
    journey_id: str | None = None


@router.post("/chat")
def post_chat(body: ChatIn) -> dict:
    if body.messages[-1].role != "user":
        raise HTTPException(status_code=422, detail="last message must be from the user")
    return chat([m.model_dump() for m in body.messages], body.journey_id)
