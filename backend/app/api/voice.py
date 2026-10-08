"""POST /voice/stt and POST /voice/tts — TravelBuddy Voice API (SPEC.md §7, §10)."""
from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

from ..voice.stt import transcribe_audio
from ..voice.tts import synthesize_speech

router = APIRouter(prefix="/voice", tags=["voice"])


class TTSIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    language: str | None = Field(default=None, max_length=10)


class TTSOut(BaseModel):
    audio_base64: str | None = None
    mime: str = "audio/wav"
    cached: bool = False
    fallback_to_browser: bool = False


class STTOut(BaseModel):
    text: str
    language: Literal["en", "hi", "mr"]


@router.post("/stt", response_model=STTOut)
async def post_stt(file: UploadFile = File(...)) -> dict:
    """Accepts uploaded audio (e.g. audio/webm from MediaRecorder) and transcribes it into text."""
    try:
        content = await file.read()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to read audio upload: {exc}") from exc

    if not content:
        raise HTTPException(status_code=422, detail="Audio file is empty")

    mime = file.content_type or "audio/webm"
    result = transcribe_audio(content, mime_type=mime)
    return result


@router.post("/tts", response_model=TTSOut)
def post_tts(body: TTSIn) -> dict:
    """Accepts text and language, and returns base64 WAV audio with caching."""
    return synthesize_speech(body.text, body.language)
