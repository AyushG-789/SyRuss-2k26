"""Tests for Railway endpoints and dedicated Transit tracker (Local trains, Bus, Metro)."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.feeds.railway import (
    _get_cache,
    _set_cache,
    check_railway_service,
    get_station_live_board,
)
from app.main import app

client = TestClient(app)


def test_railway_status_api():
    res = client.get("/railway/status")
    assert res.status_code == 200
    data = res.json()
    assert "configured" in data
    assert "capabilities" in data


def test_railway_station_live_board_api():
    # Tests station board with real timetable fallback when unconfigured
    res = client.get("/railway/station/MMCT/live")
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert data["station_code"] == "MMCT"
    assert "trains" in data
    assert len(data["trains"]) > 0
    first_train = data["trains"][0]
    assert "scheduled_departure" in first_train
    assert "destination" in first_train


def test_railway_station_invalid_code():
    res = client.get("/railway/station//live")
    assert res.status_code == 404 or res.status_code == 400


def test_railway_caching():
    test_key = "test_transit_key"
    payload = {"station": "DDR", "data": [1, 2, 3]}
    _set_cache(test_key, payload)
    cached = _get_cache(test_key, ttl_seconds=60)
    assert cached == payload
    expired = _get_cache(test_key, ttl_seconds=0)
    assert expired is None


# ================================================================================================
# Local Trains Tracker Tests
# ================================================================================================

def test_upcoming_local_trains_western_line():
    # Dadar station on Western Line
    res = client.get("/transit/trains/upcoming?station_id=dadar_wr&line_id=WR_SLOW")
    assert res.status_code == 200
    data = res.json()
    assert data["station_id"] == "dadar_wr"
    assert data["line_id"] == "WR_SLOW"
    assert data["data_source"] in ("timetable", "railradar")
    assert len(data["trains"]) > 0

    first = data["trains"][0]
    assert first["fast_slow"] in ("Fast", "Slow")
    assert first["direction"] in ("up", "down")
    assert "countdown_min" in first
    assert "countdown_str" in first
    assert "combined_display" in first
    assert "platform" in first


def test_upcoming_local_trains_direction_filter():
    # Down direction from Andheri (towards Borivali)
    res = client.get("/transit/trains/upcoming?station_id=andheri_wr&direction=down")
    assert res.status_code == 200
    data = res.json()
    assert all(t["direction"] == "down" for t in data["trains"])

    # Up direction from Andheri (towards Churchgate)
    res_up = client.get("/transit/trains/upcoming?station_id=andheri_wr&direction=up")
    assert res_up.status_code == 200
    data_up = res_up.json()
    assert all(t["direction"] == "up" for t in data_up["trains"])


def test_upcoming_local_trains_central_line():
    # Thane on Central Line
    res = client.get("/transit/trains/upcoming?station_id=thane&line_id=CR_SLOW")
    assert res.status_code == 200
    data = res.json()
    assert len(data["trains"]) > 0
    assert any("CSMT" in t["destination"] for t in data["trains"])


# ================================================================================================
# BEST Bus Arrival Estimates Tests
# ================================================================================================

def test_bus_arrivals_estimates():
    res = client.get("/transit/bus/arrivals?stop_id=andheri_bus")
    assert res.status_code == 200
    data = res.json()
    assert data["stop_id"] == "andheri_bus"
    assert data["live_feed_status"] == "unavailable"
    assert "Live GPS" in data["note"] and "unavailable" in data["note"]
    assert len(data["buses"]) > 0

    bus = data["buses"][0]
    assert bus["operator"] == "BEST"
    assert bus["is_live"] is False
    assert bus["live_available"] is False
    assert "·" in bus["combined_display"]  # e.g. "4:18 PM · 6 min"
    assert "min" in bus["countdown_str"]


def test_bus_arrivals_invalid_stop():
    res = client.get("/transit/bus/arrivals?stop_id=non_existent_stop_xyz")
    assert res.status_code == 404


# ================================================================================================
# Metro Arrival Estimates Tests
# ================================================================================================

def test_metro_arrivals_line_1():
    # Andheri Metro 1
    res = client.get("/transit/metro/arrivals?station_id=andheri_m1&line_id=METRO1")
    assert res.status_code == 200
    data = res.json()
    assert data["station_id"] == "andheri_m1"
    assert data["line_id"] == "METRO1"
    assert len(data["trains"]) > 0

    metro_train = data["trains"][0]
    assert metro_train["line_id"] == "METRO1"
    assert metro_train["operator"] == "Mumbai Metro One"
    assert "min" in metro_train["countdown_str"]
    assert metro_train["destination"] in ("Versova", "Ghatkopar")
    # Verify zero suburban local trains are present
    assert "Local" not in metro_train["destination"]


def test_metro_arrivals_line_3():
    # BKC Metro 3 Aqua Line
    res = client.get("/transit/metro/arrivals?station_id=bkc_m3&line_id=METRO3")
    assert res.status_code == 200
    data = res.json()
    assert data["station_id"] == "bkc_m3"
    assert data["line_id"] == "METRO3"
    assert len(data["trains"]) > 0


def test_transit_lines_metadata():
    res = client.get("/transit/lines")
    assert res.status_code == 200
    data = res.json()
    assert "lines" in data
    assert "local" in data["lines"]
    assert "metro" in data["lines"]
    assert "bus" in data["lines"]
    assert len(data["lines"]["local"]) >= 5
    assert len(data["lines"]["metro"]) >= 2
