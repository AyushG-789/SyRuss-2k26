"""Speech-to-Text (STT) service. SPEC.md §7.
Supports Gemini multimodal audio STT with optional Sarvam Saaras support.
"""
from __future__ import annotations

import base64
import json
import logging
from typing import Literal

import httpx

from ..config import settings

logger = logging.getLogger(__name__)

GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models"


def _transcribe_gemini(audio_bytes: bytes, mime_type: str) -> dict[str, str]:
    if not settings.gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY is not set")

    # Clean mime_type (e.g. 'audio/webm;codecs=opus' -> 'audio/webm')
    clean_mime = mime_type.split(";")[0].strip() or "audio/webm"
    b64_audio = base64.b64encode(audio_bytes).decode("ascii")

    prompt = (
        "You are an accurate multilingual speech-to-text transcriber for Mumbai public transit commuters. "
        "The commuter is speaking in English, Hindi, Marathi, or mixed Hinglish/Marathi-English. "
        "Transcribe what is spoken accurately verbatim. "
        "Identify the language code: 'en' for English, 'hi' for Hindi, or 'mr' for Marathi. "
        "Return ONLY a JSON object with keys 'text' and 'language'. "
        "Example: {\"text\": \"Thane se Wankhede jaana hai\", \"language\": \"hi\"}"
    )

    body = {
        "contents": [
            {
                "parts": [
                    {"inlineData": {"mimeType": clean_mime, "data": b64_audio}},
                    {"text": prompt},
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.1,
            "responseMimeType": "application/json",
        },
    }

    models = [
        m
        for m in dict.fromkeys([
            settings.voice_stt_model,
            "gemini-3.8-flash",
            "gemini-flash-latest",
            settings.gemini_model,
        ])
        if m
    ]

    last_err: Exception | None = None
    for model in models:
        try:
            url = f"{GEMINI_BASE}/{model}:generateContent?key={settings.gemini_api_key}"
            res = httpx.post(url, json=body, timeout=20.0)
            if res.status_code == 200:
                data = res.json()
                text_content = data["candidates"][0]["content"]["parts"][0]["text"]
                parsed = json.loads(text_content)
                text = str(parsed.get("text", "")).strip()
                lang = str(parsed.get("language", "en")).strip().lower()
                if lang not in ("en", "hi", "mr"):
                    lang = "hi" if any("\u0900" <= c <= "\u097F" for c in text) else "en"
                return {"text": text, "language": lang}
            logger.warning(f"Gemini STT model {model} HTTP {res.status_code}: {res.text[:150]}")
        except Exception as exc:
            last_err = exc
            logger.warning(f"Gemini STT error with {model}: {exc}")

    raise RuntimeError(f"Gemini STT failed: {last_err}")


def _transcribe_sarvam(audio_bytes: bytes, mime_type: str) -> dict[str, str]:
    if not settings.sarvam_api_key:
        raise RuntimeError("SARVAM_API_KEY is not set")

    clean_mime = mime_type.split(";")[0].strip() or "audio/webm"
    ext = "wav" if "wav" in clean_mime else "mp3" if "mp3" in clean_mime else "webm"
    files = {"file": (f"audio.{ext}", audio_bytes, clean_mime)}
    data = {"model": "saaras:v1"}
    headers = {"api-subscription-key": settings.sarvam_api_key}

    res = httpx.post(
        "https://api.sarvam.ai/speech-to-text",
        headers=headers,
        files=files,
        data=data,
        timeout=20.0,
    )
    if res.status_code != 200:
        raise RuntimeError(f"Sarvam STT failed: HTTP {res.status_code} {res.text[:150]}")

    payload = res.json()
    transcript = payload.get("transcript", "").strip()
    lang_code = payload.get("language_code", "en-IN").lower()
    lang = "hi" if "hi" in lang_code else "mr" if "mr" in lang_code else "en"
    return {"text": transcript, "language": lang}


def transcribe_audio(audio_bytes: bytes, mime_type: str = "audio/webm") -> dict[str, str]:
    """Transcribes audio using the configured provider (default: Gemini, fallback: Sarvam).
    Returns dict with 'text' and 'language' ('en' | 'hi' | 'mr').
    """
    if not audio_bytes:
        return {"text": "", "language": "en"}

    # Provider selection
    provider = (settings.voice_provider or "gemini").lower()

    if provider == "sarvam" and settings.sarvam_api_key:
        try:
            return _transcribe_sarvam(audio_bytes, mime_type)
        except Exception as exc:
            logger.warning(f"Sarvam STT failed, falling back to Gemini: {exc}")

    if settings.gemini_api_key:
        try:
            return _transcribe_gemini(audio_bytes, mime_type)
        except Exception as exc:
            logger.warning(f"Gemini STT failed: {exc}")
            if settings.sarvam_api_key:
                return _transcribe_sarvam(audio_bytes, mime_type)

    # Offline / unconfigured fallback
    return {
        "text": "Thane to Wankhede",
        "language": "en",
    }
