"""Settings loaded from the repo-root .env file (see .env.example)."""
from __future__ import annotations

import os
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def _find_data_dir() -> Path:
    """Resolve the directory containing seed data across local and deployed environments."""
    env_dir = os.environ.get("TRAVELBUDDY_DATA_DIR") or os.environ.get("DATA_DIR")
    if env_dir:
        p = Path(env_dir).resolve()
        if (p / "network" / "lines.yaml").is_file():
            return p

    config_path = Path(__file__).resolve()
    candidates = [
        # 1. When packaged for Vercel deployment (backend/data or /var/task/data):
        config_path.parents[1] / "data",
        config_path.parents[0] / "data",
        Path.cwd() / "data",
        # 2. In local repo development (repo-level data):
        config_path.parents[2] / "data",
        config_path.parents[1].parent / "data",
        Path.cwd().parent / "data",
    ]
    for candidate in candidates:
        if (candidate / "network" / "lines.yaml").is_file():
            return candidate.resolve()

    return (config_path.parents[2] / "data").resolve()


def _find_repo_root() -> Path:
    """Find the repository root locally and in Vercel deployments."""
    config_path = Path(__file__).resolve()
    candidates = [
        config_path.parents[2],
        config_path.parents[1],
        Path.cwd(),
    ]
    for candidate in candidates:
        if (candidate / ".env").is_file() or (candidate / "data" / "network" / "lines.yaml").is_file():
            return candidate.resolve()
    return config_path.parents[2].resolve()


REPO_ROOT = _find_repo_root()


def _default_cache_dir() -> Path:
    if os.environ.get("VERCEL") or os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
        return Path("/tmp/.cache")
    return REPO_ROOT / "backend" / ".cache"


def _default_database_url() -> str:
    if os.environ.get("VERCEL") or os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
        return "sqlite:////tmp/travelbuddy.db"
    return f"sqlite:///{REPO_ROOT / 'backend' / 'travelbuddy.db'}"


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
    rapidapi_key: str = ""          # RapidAPI key (alternative / proxy)
    rapidapi_host: str = ""         # RapidAPI host header (optional)
    railway_api_base_url: str = "https://api.railradar.in/v1"
    railway_cache_ttl_seconds: int = 120
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

    data_dir: Path = Field(default_factory=_find_data_dir)
    cache_dir: Path = Field(default_factory=_default_cache_dir)
    database_url: str = Field(default_factory=_default_database_url)
    cors_origins: list[str] = ["http://localhost:3000"]

    @property
    def tts_cache_dir(self) -> Path:
        p = self.cache_dir / "tts"
        p.mkdir(parents=True, exist_ok=True)
        return p

    @property
    def active_railway_key(self) -> str:
        return (self.railradar_api_key or self.rapidapi_key).strip()


settings = Settings()
