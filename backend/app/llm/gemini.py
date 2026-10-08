"""Minimal Gemini REST client (generateContent with function calling). Key: GEMINI_API_KEY in .env."""
from __future__ import annotations

import time

import httpx

from ..config import settings

BASE = "https://generativelanguage.googleapis.com/v1beta/models"


class GeminiError(RuntimeError):
    pass


# If Gemini was just too slow / over quota, give it a rest instead of making every traveller wait.
COOLDOWN_S = 120.0
_resting_until = 0.0


def resting() -> bool:
    return time.monotonic() < _resting_until


def _rest() -> None:
    global _resting_until
    _resting_until = time.monotonic() + COOLDOWN_S


def available() -> bool:
    return bool(settings.gemini_api_key)


def generate(contents: list[dict], *, system: str, tools: list[dict] | None = None,
             temperature: float = 0.3, timeout: float = 25.0) -> dict:
    """One model turn. Returns the candidate's `content` ({role, parts}) exactly as sent back,
    so it can be appended to the history (Gemini 3 needs its thought signatures returned)."""
    if not available():
        raise GeminiError("GEMINI_API_KEY is not set")
    body: dict = {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": contents,
        "generationConfig": {"temperature": temperature},
    }
    if tools:
        body["tools"] = [{"functionDeclarations": tools}]
    models = [m for m in dict.fromkeys([settings.gemini_model, settings.gemini_fallback_model]) if m]
    errors = []
    for model in models:
        try:
            res = httpx.post(f"{BASE}/{model}:generateContent", json=body, timeout=timeout,
                             headers={"x-goog-api-key": settings.gemini_api_key})
        except httpx.TimeoutException as exc:
            # Too slow: don't make the traveller wait for a second model as well.
            _rest()
            raise GeminiError(f"{model}: timed out after {timeout:.0f}s") from exc
        except httpx.HTTPError as exc:
            errors.append(f"{model}: network error {exc}")
            continue
        if res.status_code in (429, 500, 503):  # busy / over the free quota → try the next model
            errors.append(f"{model}: HTTP {res.status_code}")
            continue
        if res.status_code != 200:
            raise GeminiError(f"{model}: HTTP {res.status_code}: {res.text[:200]}")
        return _content(res.json())
    if errors and all("HTTP 429" in e or "HTTP 503" in e for e in errors):
        _rest()
    raise GeminiError("; ".join(errors) or "no model configured")


def _content(data: dict) -> dict:
    try:
        return data["candidates"][0]["content"]
    except (KeyError, IndexError) as exc:
        reason = data.get("promptFeedback", {}).get("blockReason") or data.get("candidates", [{}])[0].get("finishReason")
        raise GeminiError(f"no answer ({reason})") from exc
