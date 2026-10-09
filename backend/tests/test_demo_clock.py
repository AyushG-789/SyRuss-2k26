"""The demo clock the browser sends (X-Demo-Clock) wins over a server copy's own clock."""
import time

from fastapi.testclient import TestClient

from app.clock import ClockState, clock, parse_hhmm
from app.main import app

client = TestClient(app)


def test_header_clock_is_used_and_returned():
    client.post("/admin/reset")
    clock.set(parse_hhmm("20:40"))           # a "stale" server copy left far ahead
    anchor = ClockState(parse_hhmm("17:00"), time.time(), 0).encode()
    r = client.get("/admin/clock", headers={"X-Demo-Clock": anchor}).json()
    assert r["now"] == "17:00" and r["speed"] == 0
    assert client.get("/admin/clock").json()["now"] == "20:40"   # no header: the server's own clock
    client.post("/admin/reset")


def test_playing_from_the_header_and_changing_it():
    client.post("/admin/reset")
    start = ClockState(parse_hhmm("16:30"), time.time() - 120, 60).encode()   # played 2 real minutes at 60x
    r = client.get("/admin/clock", headers={"X-Demo-Clock": start}).json()
    assert r["now"] == "18:30"
    paused = client.post("/admin/clock", json={"speed": 0}, headers={"X-Demo-Clock": start}).json()
    assert paused["speed"] == 0 and paused["anchor"].endswith("|0")
    later = client.get("/admin/clock", headers={"X-Demo-Clock": paused["anchor"]}).json()
    assert later["now"] == "18:30"            # paused stays put
    client.post("/admin/reset")


def test_bad_header_is_ignored():
    client.post("/admin/reset")
    assert client.get("/admin/clock", headers={"X-Demo-Clock": "nonsense"}).json()["now"] == "16:30"
