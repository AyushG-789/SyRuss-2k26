"""Minimal Gemini REST client (generateContent with function calling). Key: GEMINI_API_KEY in .env."""
from __future__ import annotations

import httpx

from ..config import settings

BASE = "https://generativelanguage.googleapis.com/v1beta/models"


class GeminiError(RuntimeError):
    pass


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
        except httpx.HTTPError as exc:
            errors.append(f"{model}: network error {exc}")
            continue
        if res.status_code in (429, 500, 503):  # busy / over the free quota → try the next model
            errors.append(f"{model}: HTTP {res.status_code}")
            continue
        if res.status_code != 200:
            raise GeminiError(f"{model}: HTTP {res.status_code}: {res.text[:200]}")
        return _content(res.json())
    raise GeminiError("; ".join(errors) or "no model configured")


def _content(data: dict) -> dict:
    try:
        return data["candidates"][0]["content"]
    except (KeyError, IndexError) as exc:
        reason = data.get("promptFeedback", {}).get("blockReason") or data.get("candidates", [{}])[0].get("finishReason")
        raise GeminiError(f"no answer ({reason})") from exc
