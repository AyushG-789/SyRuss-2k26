"""Chatbot (SPEC §6). Gemini is replaced by a fake, so these tests never use the internet or a key."""
import pytest
from fastapi.testclient import TestClient

from app.llm import chat as chat_mod
from app.llm import gemini
from app.llm.check_numbers import allowed_numbers, unsupported
from app.main import app
from app.places import resolve_lines, resolve_place, stop_ids_for

client = TestClient(app)


@pytest.fixture(autouse=True)
def fresh_demo():
    client.post("/admin/reset")
    client.post("/admin/clock", json={"set": "17:20"})
    yield
    client.post("/admin/reset")


def ask(text, **extra):
    res = client.post("/chat", json={"messages": [{"role": "user", "text": text}], **extra})
    assert res.status_code == 200, res.text
    return res.json()


class FakeGemini:
    """Plays a scripted conversation: first a tool call, then a final text."""

    def __init__(self, *turns):
        self.turns = list(turns)
        self.seen = []

    def __call__(self, contents, *, system, tools=None, **_):
        self.seen.append(list(contents))
        turn = self.turns.pop(0)
        if isinstance(turn, dict):
            return {"role": "model", "parts": [{"functionCall": turn}]}
        return {"role": "model", "parts": [{"text": turn}]}


def use_fake(monkeypatch, fake):
    monkeypatch.setattr(gemini, "available", lambda: True)
    monkeypatch.setattr(gemini, "generate", fake)


# ---- Places + lines ----------------------------------------------------------------------------
def test_place_and_line_names():
    assert resolve_place("Andheri").label == "Andheri station"
    assert resolve_place("BKC").label == "Bandra Kurla Complex station"   # station alias
    assert resolve_place("qwerty") is None
    assert resolve_lines("Metro 1") == ["METRO1"]
    assert resolve_lines("western") == ["WR_SLOW", "WR_FAST"]
    assert set(stop_ids_for("Dadar")) >= {"dadar_cr", "dadar_wr"}


# ---- Number check ------------------------------------------------------------------------------
def test_number_check_catches_invented_numbers():
    allowed = allowed_numbers({"duration_min": 55, "cost_inr": 51, "arrive": "17:39", "trust_pct": 83})
    assert unsupported("55 min, ₹51, arriving 17:39 (83%)", allowed) == []
    assert unsupported("about 40 min and ₹20", allowed) == ["20", "40"]
    assert unsupported("२५ मिनिटे", allowed) == ["25"]       # Devanagari digits are checked too


# ---- With a (fake) Gemini ------------------------------------------------------------------------
def test_gemini_calls_tools_and_ui_gets_route_cards(monkeypatch):
    fake = FakeGemini({"name": "plan_trip", "args": {"origin": "Thane", "destination": "Wankhede", "arrive_by": "18:30"}},
                      "Take the CR Fast to CSMT, then a taxi.")
    use_fake(monkeypatch, fake)
    r = ask("I need to reach Wankhede from Thane, must be there by 18:30")   # not a simple 'A to B'
    assert r["source"] == "gemini" and r["tools_used"] == ["plan_trip"]
    assert r["trip"]["from"] == "Thane station" and r["trip"]["to"] == "Wankhede Stadium"
    assert r["trip"]["traveller"]["arrive_by"] == "18:30" and len(r["trip"]["options"]) >= 1
    # Tool results go back to Gemini without private fields.
    sent = fake.seen[1][-1]["parts"][0]["functionResponse"]["response"]
    assert "_traveller" not in sent and sent["ok"] is True


def test_invented_number_is_retried_then_replaced_by_template(monkeypatch):
    fake = FakeGemini({"name": "get_live_problems", "args": {"line": "Metro 1"}},
                      "Metro 1 is delayed by 99 minutes.",      # 99 is made up
                      "Still 77 minutes late.")                  # retry still made up
    use_fake(monkeypatch, fake)
    r = ask("How is the Versova–Ghatkopar line doing?")
    assert r["source"] == "template"
    assert "99" not in r["reply"] and "77" not in r["reply"]
    assert "Metro Line 1" in r["reply"]


def test_fake_burst_is_reported_as_not_trusted(monkeypatch):
    fake = FakeGemini({"name": "get_live_problems", "args": {"line": "Metro 1"}}, "ok")
    use_fake(monkeypatch, fake)
    r = ask("Was the blue line shut today?")
    statuses = {p["status"] for p in r["problems"]}
    assert "coordinated" in statuses              # the fake closure burst, flagged
    assert "confirmed" in statuses                # the real Saki Naka delay


# ---- Without Gemini (no key / quota / outage) ---------------------------------------------------
def test_fallback_without_key_still_plans_and_checks(monkeypatch):
    monkeypatch.setattr(gemini, "available", lambda: False)
    r = ask("Thane to Wankhede by 18:30")
    assert r["source"] == "fallback" and r["trip"] is not None
    assert "Thane station" in r["reply"] and "₹" in r["reply"]
    r = ask("is metro 1 running?")
    assert r["source"] == "fallback" and "Metro Line 1" in r["reply"]
    r = ask("tell me a joke")
    assert r["source"] == "fallback" and "offline" in r["reply"]


def test_gemini_error_falls_back(monkeypatch):
    def boom(*a, **k):
        raise gemini.GeminiError("HTTP 429")
    monkeypatch.setattr(gemini, "available", lambda: True)
    monkeypatch.setattr(gemini, "generate", boom)
    r = ask("Dadar")
    assert r["source"] in ("fallback", "template") and "Dadar" in r["reply"]


def test_bad_requests():
    assert client.post("/chat", json={"messages": []}).status_code == 422
    assert client.post("/chat", json={"messages": [{"role": "assistant", "text": "hi"}]}).status_code == 422


def test_slow_gemini_after_tools_answers_from_live_data(monkeypatch):
    calls = {"n": 0}

    def slow_second(contents, *, system, tools=None, **_):
        calls["n"] += 1
        if calls["n"] == 1:
            return {"role": "model", "parts": [{"functionCall": {"name": "get_live_problems", "args": {"line": "Metro 1"}}}]}
        raise gemini.GeminiError("timed out after 8s")

    use_fake(monkeypatch, slow_second)
    r = ask("How is the Versova–Ghatkopar line doing?")
    assert r["source"] == "template" and "Metro Line 1" in r["reply"]
    assert r["problems"]                      # the live data still reaches the UI


# ---- Fast path: common questions need only ONE Gemini call --------------------------------------
def test_detects_common_questions():
    assert chat_mod.detect("Thane to Wankhede by 18:30, under ₹150") == (
        "plan_trip", {"origin": "Thane", "destination": "Wankhede", "arrive_by": "18:30", "max_budget_inr": 150})
    assert chat_mod.detect("Andheri se BKC cheapest")[1]["priority"] == "cheapest"
    assert chat_mod.detect("Is Metro 1 running?") == ("get_live_problems", {"line": "metro 1"})
    assert chat_mod.detect("tell me a joke") is None
    assert chat_mod.detect("I want to go somewhere nice") is None


def test_fast_path_uses_one_gemini_call(monkeypatch):
    fake = FakeGemini("Metro 1 has a confirmed delay at Saki Naka.")
    use_fake(monkeypatch, fake)
    r = ask("Is Metro 1 running?")
    assert r["source"] == "gemini" and r["tools_used"] == ["get_live_problems"]
    assert len(fake.seen) == 1                                 # one call, no tool round-trip
    assert "Live TravelBuddy data" in fake.seen[0][-1]["parts"][-1]["text"]


def test_fast_path_timeout_answers_from_live_data(monkeypatch):
    def slow(*a, **k):
        raise gemini.GeminiError("timed out after 8s")
    monkeypatch.setattr(gemini, "available", lambda: True)
    monkeypatch.setattr(gemini, "generate", slow)
    r = ask("Thane to Wankhede by 18:30")
    assert r["source"] == "template" and r["trip"] and "Thane station" in r["reply"]


def test_resting_gemini_answers_instantly(monkeypatch):
    called = []
    monkeypatch.setattr(gemini, "available", lambda: True)
    monkeypatch.setattr(gemini, "resting", lambda: True)
    monkeypatch.setattr(gemini, "generate", lambda *a, **k: called.append(1))
    r = ask("Is Metro 1 running?")
    assert r["source"] == "template" and not called      # no waiting on a slow Gemini
