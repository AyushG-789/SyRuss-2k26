"""Regression tests for data directory resolution across local and Vercel environments."""
from __future__ import annotations

import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import _find_data_dir, settings
from app.data_loader import load_seed
from app.main import app
from build import package_seed_data


REQUIRED_SEED_FILES = [
    "network/lines.yaml",
    "network/stations.yaml",
    "network/fares.yaml",
    "pois.json",
    "travellers.json",
    "reporters.json",
    "reports_seed.json",
    "news_mock.json",
    "official_mock.json",
    "scenarios/demo.json",
]


def test_default_data_dir_contains_all_seed_files():
    """Verify that settings.data_dir resolves to an existing directory with all required files."""
    data_dir = settings.data_dir
    assert data_dir.is_dir(), f"data_dir '{data_dir}' is not a directory"

    for rel_path in REQUIRED_SEED_FILES:
        target = data_dir / rel_path
        assert target.is_file(), f"Missing required seed file: {target}"


def test_load_seed_loads_expected_entities():
    """Verify that load_seed() works with the resolved data_dir and loads seed data."""
    seed = load_seed()
    assert len(seed.stations) > 0
    assert len(seed.lines) > 0
    assert len(seed.pois) > 0
    assert len(seed.travellers) > 0
    assert len(seed.reports) > 0


def test_health_endpoint_returns_200_and_counts():
    """Regression test: GET /health must not crash with 500 FUNCTION_INVOCATION_FAILED."""
    client = TestClient(app)
    resp = client.get("/health")
    assert resp.status_code == 200, f"Health endpoint failed: {resp.text}"
    body = resp.json()
    assert body["status"] == "ok"
    assert body["data"]["stations"] > 0
    assert body["data"]["lines"] > 0
    assert body["data"]["reports"] > 0


def test_find_data_dir_env_override(tmp_path, monkeypatch):
    """Verify that TRAVELBUDDY_DATA_DIR / DATA_DIR environment variables are respected."""
    custom_data = tmp_path / "custom_data"
    network_dir = custom_data / "network"
    network_dir.mkdir(parents=True)
    (network_dir / "lines.yaml").write_text("lines: []\n", encoding="utf-8")

    monkeypatch.setenv("TRAVELBUDDY_DATA_DIR", str(custom_data))
    resolved = _find_data_dir()
    assert resolved == custom_data.resolve()


def test_build_package_seed_data_copies_files(tmp_path):
    """Verify that build.package_seed_data successfully packages repository data."""
    fake_backend = tmp_path / "backend"
    fake_backend.mkdir()
    target_data = fake_backend / "data"

    packaged = package_seed_data(backend_dir=fake_backend, source_data_dir=settings.data_dir)
    assert packaged is not None
    assert target_data.is_dir()
    assert (target_data / "network" / "lines.yaml").is_file()

