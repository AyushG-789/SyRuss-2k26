"""Text-to-Speech (TTS) service with on-disk caching. SPEC.md §7.
Supports Gemini Flash TTS with optional Sarvam Bulbul support.
Caches generated .wav files by sha256(lang + ":" + text) in backend/.cache/tts/.
"""
from __future__ import annotations

import base64
import hashlib
import io
import logging
import wave

import httpx

from ..config import settings

logger = logging.getLogger(__name__)

GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models"


def _pcm_to_wav(pcm_bytes: bytes, sample_rate: int = 24000) -> bytes:
    """Wraps raw 16-bit mono PCM bytes in a standard WAV header using Python's built-in wave module."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(pcm_bytes)
    return buf.getvalue()


def _synthesize_gemini(text: str, lang: str) -> bytes:
    if not settings.gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY is not set")

    # Prompt tone / context based on language
    lang_name = "Marathi" if lang == "mr" else "Hindi" if lang == "hi" else "Indian English"
    prompt_text = text.strip()

    body = {
        "contents": [{"parts": [{"text": prompt_text}]}],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {
                "voiceConfig": {
                    "prebuiltVoiceConfig": {
                        "voiceName": "Puck"
                    }
                }
            },
        },
    }

    models = [
        m
        for m in dict.fromkeys([
            settings.voice_tts_model,
            "gemini-3.8-flash-tts",
            "gemini-2.5-flash-preview-tts",
        ])
        if m
    ]

    for model in models:
        try:
            url = f"{GEMINI_BASE}/{model}:generateContent?key={settings.gemini_api_key}"
            res = httpx.post(url, json=body, timeout=20.0)
            if res.status_code == 200:
                data = res.json()
                part = data["candidates"][0]["content"]["parts"][0]
                inline = part.get("inlineData", {})
                mime = inline.get("mimeType", "")
                raw_bytes = base64.b64decode(inline.get("data", ""))
                if "wav" in mime:
                    return raw_bytes
                # Raw PCM returned
                rate = 24000
                if "rate=" in mime:
                    try:
                        rate = int(mime.split("rate=")[1].split(";")[0])
                    except Exception:
                        pass
                return _pcm_to_wav(raw_bytes, sample_rate=rate)
            logger.warning(f"Gemini TTS {model} HTTP {res.status_code}: {res.text[:150]}")
        except Exception as exc:
            logger.warning(f"Gemini TTS error with {model}: {exc}")

    raise RuntimeError("All Gemini TTS models failed")


def _synthesize_sarvam(text: str, lang: str) -> bytes:
    if not settings.sarvam_api_key:
        raise RuntimeError("SARVAM_API_KEY is not set")

    target_lang = "mr-IN" if lang == "mr" else "hi-IN" if lang == "hi" else "en-IN"
    url = "https://api.sarvam.ai/text-to-speech"
    headers = {
        "api-subscription-key": settings.sarvam_api_key,
        "Content-Type": "application/json",
    }
    payload = {
        "inputs": [text[:500]],
        "target_language_code": target_lang,
        "speaker": "meera",
        "pitch": 0,
        "pace": 1.0,
        "loudness": 1.5,
        "speech_sample_rate": 16000,
        "enable_preprocessing": True,
        "model": "bulbul:v1",
    }

    res = httpx.post(url, headers=headers, json=payload, timeout=20.0)
    if res.status_code != 200:
        raise RuntimeError(f"Sarvam TTS failed: HTTP {res.status_code} {res.text[:150]}")

    data = res.json()
    audios = data.get("audios", [])
    if not audios:
        raise RuntimeError("Sarvam TTS returned no audio")
    return base64.b64decode(audios[0])


def _make_dummy_wav() -> bytes:
    """Generates a brief 0.1s silent WAV file for offline testing."""
    return _pcm_to_wav(b"\x00\x00" * 800, sample_rate=16000)


def synthesize_speech(text: str, language: str | None = None) -> dict:
    """Synthesizes text into speech.
    Returns:
        {
            "audio_base64": str,
            "mime": "audio/wav",
            "cached": bool,
            "fallback_to_browser": bool
        }
    """
    clean_text = text.strip()
    if not clean_text:
        dummy = _make_dummy_wav()
        return {
            "audio_base64": base64.b64encode(dummy).decode("ascii"),
            "mime": "audio/wav",
            "cached": False,
            "fallback_to_browser": False,
        }

    lang = (language or "en").lower().split("-")[0]
    if lang not in ("en", "hi", "mr"):
        lang = "hi" if any("\u0900" <= c <= "\u097F" for c in clean_text) else "en"

    # 1. Check disk cache
    cache_key = hashlib.sha256(f"{lang}:{clean_text}".encode("utf-8")).hexdigest()
    cache_dir = settings.tts_cache_dir
    cache_file = cache_dir / f"{cache_key}.wav"

    if cache_file.exists():
        try:
            cached_bytes = cache_file.read_bytes()
            if cached_bytes:
                return {
                    "audio_base64": base64.b64encode(cached_bytes).decode("ascii"),
                    "mime": "audio/wav",
                    "cached": True,
                    "fallback_to_browser": False,
                }
        except Exception as exc:
            logger.warning(f"Error reading TTS cache file: {exc}")

    # 2. Call provider
    provider = (settings.voice_provider or "gemini").lower()
    wav_bytes: bytes | None = None

    if provider == "sarvam" and settings.sarvam_api_key:
        try:
            wav_bytes = _synthesize_sarvam(clean_text, lang)
        except Exception as exc:
            logger.warning(f"Sarvam TTS failed, trying Gemini: {exc}")

    if not wav_bytes and settings.gemini_api_key:
        try:
            wav_bytes = _synthesize_gemini(clean_text, lang)
        except Exception as exc:
            logger.warning(f"Gemini TTS failed: {exc}")
            if settings.sarvam_api_key:
                try:
                    wav_bytes = _synthesize_sarvam(clean_text, lang)
                except Exception:
                    pass

    # 3. If audio generated, save to disk cache
    if wav_bytes:
        try:
            cache_file.write_bytes(wav_bytes)
        except Exception as exc:
            logger.warning(f"Error saving TTS to cache: {exc}")
        return {
            "audio_base64": base64.b64encode(wav_bytes).decode("ascii"),
            "mime": "audio/wav",
            "cached": False,
            "fallback_to_browser": False,
        }

    # 4. Fallback: tell frontend to use browser speech synthesis
    dummy = _make_dummy_wav()
    return {
        "audio_base64": base64.b64encode(dummy).decode("ascii"),
        "mime": "audio/wav",
        "cached": False,
        "fallback_to_browser": True,
    }
