"""Voice STT and TTS tests. SPEC.md §7."""
import base64
import io
import wave
import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app.voice import stt, tts

client = TestClient(app)


def _make_dummy_wav() -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(16000)
        wf.writeframes(b"\x00\x00" * 1600)
    return buf.getvalue()


def test_tts_returns_wav_and_caches():
    test_text = "Dadar station bridge closed. Take taxi."
    res = client.post("/voice/tts", json={"text": test_text, "language": "en"})
    assert res.status_code == 200
    data = res.json()
    assert data["mime"] == "audio/wav"
    assert "audio_base64" in data
    assert len(data["audio_base64"]) > 0

    # Second call for identical text and language should be cached
    res2 = client.post("/voice/tts", json={"text": test_text, "language": "en"})
    assert res2.status_code == 200
    data2 = res2.json()
    assert data2["cached"] is True
    assert data2["audio_base64"] == data["audio_base64"]


def test_tts_marathi_and_hindi_languages():
    res_hi = client.post("/voice/tts", json={"text": "ठाणे से दादर", "language": "hi"})
    assert res_hi.status_code == 200
    assert res_hi.json()["mime"] == "audio/wav"

    res_mr = client.post("/voice/tts", json={"text": "दादर स्थानक", "language": "mr"})
    assert res_mr.status_code == 200
    assert res_mr.json()["mime"] == "audio/wav"


def test_stt_transcribes_uploaded_audio():
    wav_bytes = _make_dummy_wav()
    files = {"file": ("test.wav", wav_bytes, "audio/wav")}
    res = client.post("/voice/stt", files=files)
    assert res.status_code == 200
    data = res.json()
    assert "text" in data
    assert data["language"] in ("en", "hi", "mr")


def test_voice_offline_fallback(monkeypatch):
    # Simulate completely offline / no keys
    monkeypatch.setattr(settings, "gemini_api_key", "")
    monkeypatch.setattr(settings, "sarvam_api_key", "")

    # STT should not crash
    files = {"file": ("test.wav", _make_dummy_wav(), "audio/wav")}
    res_stt = client.post("/voice/stt", files=files)
    assert res_stt.status_code == 200
    assert "text" in res_stt.json()

    # TTS should return valid audio with fallback_to_browser=True
    res_tts = client.post("/voice/tts", json={"text": "Emergency alert", "language": "en"})
    assert res_tts.status_code == 200
    assert res_tts.json()["fallback_to_browser"] is True
