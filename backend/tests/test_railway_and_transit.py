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
from datetime import datetime

from app.api import transit
from app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def fixed_board_time(monkeypatch):
    """Station boards use real IST time; pin it so these tests don't depend on when they run."""
    monkeypatch.setattr(transit, "board_now", lambda: datetime(2026, 10, 20, 9, 30))


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
    assert "GPS is not connected" in data["note"]
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


def test_planned_trains_have_no_made_up_numbers(monkeypatch):
    # Without the live feed, trains are planned from frequency — they must not carry invented numbers.
    monkeypatch.setattr("app.api.transit.settings.railradar_api_key", "")
    monkeypatch.setattr("app.api.transit.settings.rapidapi_key", "")
    res = client.get("/transit/trains/upcoming?station_id=andheri_wr")
    assert res.status_code == 200
    data = res.json()
    assert data["is_live"] is False and data["trains"]
    assert all(t["train_number"] == "" for t in data["trains"])


def test_boards_use_real_ist_time_not_the_demo_clock(monkeypatch):
    # The demo clock says 5:15 pm; the station boards must show the real time (here 10:05 am).
    monkeypatch.setattr(transit, "board_now", lambda: datetime(2026, 10, 20, 10, 5))
    demo = {"X-Demo-Clock": "2026-10-20T17:15:00|1791600000|0"}
    for url in ("/transit/trains/upcoming?station_id=andheri_wr",
                "/transit/metro/arrivals?station_id=andheri_m1",
                "/transit/bus/arrivals?stop_id=andheri_bus"):
        data = client.get(url, headers=demo).json()
        assert data["as_of"] == "10:05", url


def test_night_shows_first_trains_of_the_morning(monkeypatch):
    monkeypatch.setattr(transit, "board_now", lambda: datetime(2026, 10, 20, 1, 0))
    data = client.get("/transit/trains/upcoming?station_id=dadar_wr").json()
    assert data["trains"], "should still list the first trains"
    first = min(t["countdown_min"] for t in data["trains"])
    assert first >= 180                               # locals start at 04:00
    assert "night" in data["note"]
    assert any(" h" in t["countdown_str"] for t in data["trains"])
    metro = client.get("/transit/metro/arrivals?station_id=andheri_m1").json()
    assert "first train" in metro["trains"][0]["frequency_note"]


def test_bus_frequency_follows_the_time_band(monkeypatch):
    # BEST bands are 06:00–23:00; at 23:30 the next bus is the first one at 06:00, not every 12 min.
    monkeypatch.setattr(transit, "board_now", lambda: datetime(2026, 10, 20, 23, 30))
    data = client.get("/transit/bus/arrivals?stop_id=andheri_bus").json()
    assert data["buses"] and min(b["countdown_min"] for b in data["buses"]) == 390


def test_live_board_shows_real_delays(monkeypatch):
    # A real RailRadar answer for Andheri (10:26 am): scheduled + expected times and minutes late.
    monkeypatch.setattr(transit, "board_now", lambda: datetime(2026, 10, 10, 10, 20))
    monkeypatch.setattr(transit.settings, "railradar_api_key", "test-key")
    seed = transit.load_seed()
    monkeypatch.setitem(seed.stations["andheri_wr"], "code", "ADH")
    monkeypatch.setitem(seed.stations["churchgate"], "code", "CCG")
    board = {"ok": True, "is_live": True, "trains": [
        {"train_number": "90277", "train_name": "Churchgate - Borivali Local", "train_type": "Mumbai Suburban EMU",
         "destination": "BVI", "scheduled_departure": "10:22", "expected_departure": "2026-10-10T10:31:00+05:30",
         "delay_minutes": 9, "platform": "3", "status": "upcoming"},
        {"train_number": "90320", "train_name": "Borivali - Churchgate Local", "train_type": "Mumbai Suburban EMU",
         "destination": "CCG", "scheduled_departure": "10:27", "expected_departure": "2026-10-10T10:26:00+05:30",
         "delay_minutes": -1, "platform": "5", "status": "at-station"},
        {"train_number": "95710", "train_name": "Kalyan - Mumbai CSMT Local", "destination": "CSMT",
         "scheduled_departure": None, "expected_departure": None, "delay_minutes": 56, "platform": "6"},
    ]}
    monkeypatch.setattr(transit, "get_station_live_board", lambda code: board)
    data = client.get("/transit/trains/upcoming?station_id=andheri_wr").json()
    assert data["is_live"] is True
    by_no = {t["train_number"]: t for t in data["trains"]}
    late = by_no["90277"]
    assert late["delay_minutes"] == 9 and late["scheduled_departure"] == "10:22" and late["expected_departure"] == "10:31"
    assert late["countdown_min"] == 11 and late["platform"] == "PF 3" and late["direction"] == "down"
    early = by_no["90320"]
    assert early["delay_minutes"] == -1 and early["direction"] == "up" and early["destination"] == "Churchgate"
    assert "95710" not in by_no            # ends at CSMT: no departure from here
    assert late["speed_known"] is False    # the feed doesn't say fast/slow for this one


def test_railway_board_never_uses_the_demo_clock(monkeypatch):
    # Stations nearby: the RailRadar module's timetable board is on real IST time too.
    from app.feeds import railway as rail_feed
    monkeypatch.setattr(rail_feed, "real_ist_now", lambda: datetime(2026, 10, 20, 10, 5))
    monkeypatch.setattr(rail_feed.settings, "railradar_api_key", "")
    monkeypatch.setattr(rail_feed.settings, "rapidapi_key", "")
    rail_feed._CACHE.clear() if hasattr(rail_feed, "_CACHE") else None
    data = client.get("/railway/station/ADH/live", headers={"X-Demo-Clock": "2026-10-20T17:15:00|1791600000|0"}).json()
    assert data["as_of"] == "10:05"
