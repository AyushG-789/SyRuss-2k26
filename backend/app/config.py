"""Settings loaded from the repo-root .env file (see .env.example)."""
from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=REPO_ROOT / ".env", extra="ignore")

    gemini_api_key: str = ""
    gemini_model: str = "gemini-flash-lite-latest"      # chatbot: fast + generous free quota (SPEC §6)
    gemini_fallback_model: str = "gemini-flash-latest"  # used if the main one is busy / over quota
    openai_api_key: str = ""
    openai_model_fast: str = ""
    openai_model_smart: str = ""
    sarvam_api_key: str = ""

    demo_date: str = "2026-10-20"
    scenario_file: str = "scenarios/demo.json"
    news_mode: str = "mock"          # mock | live
    official_mode: str = "mock"      # mock | live
    weather_mode: str = "mock"       # mock | live

    data_dir: Path = REPO_ROOT / "data"
    cache_dir: Path = REPO_ROOT / "backend" / ".cache"
    database_url: str = f"sqlite:///{REPO_ROOT / 'backend' / 'travelbuddy.db'}"
    cors_origins: list[str] = ["http://localhost:3000"]


settings = Settings()
