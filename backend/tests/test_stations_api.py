"""Tests for GET /stations/search, /stations/nearby, and /stations/{id}."""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_search_stations_empty_returns_major_hubs():
    res = client.get("/stations/search")
    assert res.status_code == 200
    data = res.json()
    assert len(data) > 0
    hub_ids = [s["id"] for s in data]
    assert "andheri_wr" in hub_ids
    assert "dadar_wr" in hub_ids or "dadar_cr" in hub_ids


def test_search_stations_by_code_csmt():
    res = client.get("/stations/search?q=CSMT")
    assert res.status_code == 200
    data = res.json()
    assert len(data) > 0
    names = [s["name"] for s in data]
    assert any("CSMT" in name for name in names)


def test_search_stations_by_code_ddr():
    res = client.get("/stations/search?q=DDR")
    assert res.status_code == 200
    data = res.json()
    assert len(data) > 0
    assert any("Dadar" in s["name"] for s in data)


def test_search_stations_by_name_ghatkopar():
    res = client.get("/stations/search?q=Ghatkopar")
    assert res.status_code == 200
    data = res.json()
    assert len(data) > 0
    assert any("Ghatkopar" in s["name"] for s in data)


def test_search_stations_by_name_andheri():
    res = client.get("/stations/search?q=Andheri")
    assert res.status_code == 200
    data = res.json()
    assert len(data) > 0
    assert any("Andheri" in s["name"] for s in data)


def test_search_stations_mode_filter():
    res = client.get("/stations/search?q=Andheri&mode=metro")
    assert res.status_code == 200
    data = res.json()
    assert len(data) > 0
    assert all(s["mode"] == "metro" for s in data)


def test_nearby_stations_andheri_coords():
    # Andheri coordinates ~ 19.1197, 72.8464
    res = client.get("/stations/nearby?lat=19.1197&lon=72.8464&radius_km=2.0")
    assert res.status_code == 200
    data = res.json()
    assert len(data) > 0
    # First station should be very close (< 0.5km)
    assert data[0]["distance_km"] < 0.5
    assert any("Andheri" in s["name"] for s in data)


def test_get_station_by_id():
    res = client.get("/stations/andheri_wr")
    assert res.status_code == 200
    data = res.json()
    assert data["id"] == "andheri_wr"
    assert data["mode"] == "local"
    assert "lines" in data


def test_get_station_not_found():
    res = client.get("/stations/non_existent_station_xyz")
    assert res.status_code == 404
