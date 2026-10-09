"""Settings loaded from the repo-root .env file (see .env.example)."""
from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


def _find_repo_root() -> Path:
    """Find the repository root locally and in Vercel deployments."""
    candidates = [
        Path(__file__).resolve().parents[2],
        Path(__file__).resolve().parents[1],
        Path.cwd(),
    ]
    for candidate in candidates:
        if (candidate / "data" / "network" / "lines.yaml").is_file():
            return candidate
    # Preserve the existing default so a missing data directory
    # produces a clear file-not-found error.
    return Path(__file__).resolve().parents[2]


REPO_ROOT = _find_repo_root()



class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=REPO_ROOT / ".env", extra="ignore")

    gemini_api_key: str = ""
    gemini_model: str = "gemini-flash-lite-latest"      # chatbot: fast + generous free quota (SPEC §6)
    gemini_fallback_model: str = "gemini-flash-latest"  # used if the main one is busy / over quota
    openai_api_key: str = ""
    openai_model_fast: str = ""
    openai_model_smart: str = ""
    sarvam_api_key: str = ""
    # Shared team keys for live feeds (B8, maps). All optional: everything works on mock data without them.
    railradar_api_key: str = ""     # RailRadar.in — live train running status
    tomtom_api_key: str = ""        # TomTom — road traffic / incidents
    newsapi_key: str = ""           # newsapi.org — news search (B8)
    mapbox_token: str = ""          # Mapbox — map tiles / directions

    voice_provider: str = "sarvam"                      # sarvam | gemini (SPEC §7)
    voice_stt_model: str = "gemini-3.5-flash"           # multimodal audio STT
    voice_tts_model: str = "gemini-3.8-flash-tts"       # natural Indian voice TTS

    demo_date: str = "2026-10-20"
    scenario_file: str = "scenarios/demo.json"
    news_mode: str = "mock"          # mock | live
    official_mode: str = "mock"      # mock | live
    weather_mode: str = "mock"       # mock | live

    data_dir: Path = REPO_ROOT / "data"
    cache_dir: Path = REPO_ROOT / "backend" / ".cache"
    database_url: str = f"sqlite:///{REPO_ROOT / 'backend' / 'travelbuddy.db'}"
    cors_origins: list[str] = ["http://localhost:3000"]

    @property
    def tts_cache_dir(self) -> Path:
        p = self.cache_dir / "tts"
        p.mkdir(parents=True, exist_ok=True)
        return p


settings = Settings()
