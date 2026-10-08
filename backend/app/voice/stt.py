"""Speech-to-Text (STT) service. SPEC.md §7.
Supports Sarvam Saaras (v3) Indic ASR and Gemini multimodal audio STT.
"""
from __future__ import annotations

import base64
import json
import logging
import re
from typing import Literal

import httpx

from ..config import settings

logger = logging.getLogger(__name__)

GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models"


def _transcribe_sarvam(audio_bytes: bytes, mime_type: str) -> dict[str, str]:
    if not settings.sarvam_api_key:
        raise RuntimeError("SARVAM_API_KEY is not set")

    clean_mime = mime_type.split(";")[0].strip() or "audio/wav"
    ext = "wav" if "wav" in clean_mime else "mp3" if "mp3" in clean_mime else "wav"
    files = {"file": (f"audio.{ext}", audio_bytes, clean_mime)}
    data = {"model": "saaras:v3"}
    headers = {"api-subscription-key": settings.sarvam_api_key}

    res = httpx.post(
        "https://api.sarvam.ai/speech-to-text",
        headers=headers,
        files=files,
        data=data,
        timeout=25.0,
    )
    if res.status_code != 200:
        raise RuntimeError(f"Sarvam STT failed: HTTP {res.status_code} {res.text[:150]}")

    payload = res.json()
    transcript = payload.get("transcript", "").strip()
    lang_code = payload.get("language_code", "en-IN").lower()
    lang = "hi" if "hi" in lang_code else "mr" if "mr" in lang_code else "en"

    logger.info(
        f"[Voice:STT] Provider=Sarvam model=saaras:v3 bytes={len(audio_bytes)} "
        f"lang={lang} transcript='{transcript[:80]}'"
    )
    return {"text": transcript, "language": lang}


def _transcribe_gemini(audio_bytes: bytes, mime_type: str) -> dict[str, str]:
    if not settings.gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY is not set")

    clean_mime = mime_type.split(";")[0].strip() or "audio/wav"
    b64_audio = base64.b64encode(audio_bytes).decode("ascii")

    prompt = (
        "You are an acoustic speech-to-text recognition system for Mumbai commuters. "
        "Listen to the audio and transcribe the exact words spoken verbatim in the original language "
        "(English, Hindi, Marathi, or mixed Hinglish/Marathi-English). "
        "Do NOT invent words. Do NOT summarize or answer the question. Do NOT output timestamps. "
        "Respond ONLY with a JSON object: {\"text\": \"<exact spoken transcription>\", \"language\": \"<en|hi|mr>\"}."
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
            "temperature": 0.0,
            "responseMimeType": "application/json",
        },
    }

    models = [
        m
        for m in dict.fromkeys([
            settings.voice_stt_model,
            "gemini-3.5-flash",
            "gemini-3.7-flash",
            "gemini-flash-lite-latest",
        ])
        if m and m not in ("gemini-3.8-flash", "gemini-flash-latest")  # Avoid 20 req/day quota models
    ]

    last_err: Exception | None = None
    for model in models:
        try:
            url = f"{GEMINI_BASE}/{model}:generateContent?key={settings.gemini_api_key}"
            res = httpx.post(url, json=body, timeout=25.0)
            if res.status_code == 200:
                data = res.json()
                text_content = data["candidates"][0]["content"]["parts"][0]["text"]
                parsed = json.loads(text_content)
                text = str(parsed.get("text", "")).strip()
                lang = str(parsed.get("language", "en")).strip().lower()
                if lang not in ("en", "hi", "mr"):
                    lang = "hi" if any("\u0900" <= c <= "\u097F" for c in text) else "en"

                logger.info(
                    f"[Voice:STT] Provider=Gemini model={model} bytes={len(audio_bytes)} "
                    f"lang={lang} transcript='{text[:80]}'"
                )
                return {"text": text, "language": lang}
            logger.warning(f"Gemini STT model {model} HTTP {res.status_code}: {res.text[:150]}")
        except Exception as exc:
            last_err = exc
            logger.warning(f"Gemini STT error with {model}: {exc}")

    raise RuntimeError(f"Gemini STT failed across models: {last_err}")


def transcribe_audio(audio_bytes: bytes, mime_type: str = "audio/wav") -> dict[str, str]:
    """Transcribes audio using the configured provider (default: Sarvam Saaras, fallback: Gemini).
    Returns dict with 'text' and 'language' ('en' | 'hi' | 'mr').
    """
    if not audio_bytes:
        return {"text": "", "language": "en"}

    logger.info(f"[Voice:STT] Request received: size={len(audio_bytes)} bytes, mime={mime_type}")

    provider = (settings.voice_provider or "sarvam").lower()

    # 1. Try Sarvam Saaras if selected or key available
    if provider == "sarvam" and settings.sarvam_api_key:
        try:
            return _transcribe_sarvam(audio_bytes, mime_type)
        except Exception as exc:
            logger.warning(f"[Voice:STT] Sarvam STT failed, trying Gemini fallback: {exc}")

    # 2. Try Gemini STT
    if settings.gemini_api_key:
        try:
            return _transcribe_gemini(audio_bytes, mime_type)
        except Exception as exc:
            logger.warning(f"[Voice:STT] Gemini STT failed: {exc}")
            if settings.sarvam_api_key and provider != "sarvam":
                try:
                    return _transcribe_sarvam(audio_bytes, mime_type)
                except Exception as sarv_exc:
                    logger.warning(f"[Voice:STT] Sarvam fallback also failed: {sarv_exc}")

    # 3. If Sarvam was not tried yet and key is present
    if settings.sarvam_api_key:
        try:
            return _transcribe_sarvam(audio_bytes, mime_type)
        except Exception as exc:
            logger.warning(f"[Voice:STT] Sarvam STT failed: {exc}")

    # 4. Graceful empty result (do NOT return fake hallucinated sentences)
    logger.warning("[Voice:STT] No STT provider succeeded; returning empty transcription")
    return {
        "text": "",
        "language": "en",
    }
