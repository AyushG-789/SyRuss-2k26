"""TravelBuddy chatbot: Gemini understands the question and words the answer; every fact comes
from our tools (routing, Pakka Check, saved journeys). SPEC.md §6.

Safety nets:
- number check: a reply with a number that no tool returned is regenerated once, then replaced by
  a plain template built from the tool results;
- no key / Gemini down: a small rule-based fallback still answers trips and line status.
"""
from __future__ import annotations

import json
import re

from ..clock import clock, fmt_hhmm
from ..config import settings
from . import gemini
from .check_numbers import allowed_numbers, unsupported
from .tools import DECLARATIONS, TOOLS, get_live_problems, plan_trip

MAX_TOOL_ROUNDS = 4
MAX_HISTORY = 10


def system_prompt(journey_id: str | None) -> str:
    return f"""You are TravelBuddy, a friendly Mumbai commute assistant (local trains, metro, BEST buses, autos, taxis).
The current time is {fmt_hhmm(clock.now())} (demo clock). Times are 24-hour HH:MM. Money is in rupees (₹).
{"The traveller has a saved trip with journey_id " + journey_id + "." if journey_id else ""}

Rules:
- ALWAYS use the tools for facts: routes, times, fares, delays, closures, trust percentages, trips. Never guess or use outside knowledge for these.
- Only write numbers that appear in tool results or in the traveller's message.
- For a trip request call plan_trip. If a place is unknown, ask for a nearby station or landmark.
- For "is X running / any problem at Y" call get_live_problems. Say whether a problem is confirmed or only possible, with its trust % and sources (e.g. "confirmed, 83%: 3 commuters + 1 news report"). If reports were not trusted (fake burst, too few), say so plainly.
- "Why" questions about a problem: explain_problem. Questions about "my trip": get_my_journey.
- Reply in the traveller's language (English, Hindi, Marathi, or Hinglish if they mix). Keep it short: at most 70 words, plain text, at most 3 short bullet lines. No tables, no markdown headings.
- When you suggest routes, lead with the recommended one, then mention one alternative if useful. The app shows route cards under your message, so don't repeat every detail.
- You only help with travel in Mumbai. Politely decline anything else."""


def _public(result: dict) -> dict:
    """Tool output without private fields (e.g. the full traveller object for the UI)."""
    return {k: v for k, v in result.items() if not k.startswith("_")}


def _history(messages: list[dict]) -> list[dict]:
    out = []
    for m in messages[-MAX_HISTORY:]:
        text = (m.get("text") or "").strip()
        if text:
            out.append({"role": "model" if m.get("role") == "assistant" else "user", "parts": [{"text": text}]})
    return out


def _text(content: dict) -> str:
    return "".join(p.get("text", "") for p in content.get("parts", []) if not p.get("thought")).strip()


# ---- Plain answers built straight from tool results (fallback + number-check failure) ---------
def _trip_text(r: dict) -> str:
    if not r.get("ok"):
        return r.get("error", "I couldn't plan that trip.")
    if not r["options"]:
        return f"I couldn't find a route from {r['from']} to {r['to']} within your limits."
    best = next((o for o in r["options"] if o["recommended"]), r["options"][0])
    line = (f"{r['from']} → {r['to']}: {best['route']}, leave {best['depart']}, arrive {best['arrive']} "
            f"({best['duration_min']} min, ₹{best['cost_inr']}).")
    if best["live_problems"]:
        p = best["live_problems"][0]
        line += f" Note: {p['title']} is {p['meaning']} ({p['trust_pct']}%)."
    return line


def _problems_text(r: dict) -> str:
    if not r.get("ok"):
        return r.get("error", "I couldn't check that.")
    trusted = [p for p in r["problems"] if p["status"] in ("confirmed", "possible")]
    untrusted = [p for p in r["problems"] if p["status"] not in ("confirmed", "possible")]
    if not trusted and not untrusted:
        return f"No problems reported there as of {r['now']}."
    bits = [f"{p['title']}: {p['meaning']}, {p['trust_pct']}% ({p['sources']})." for p in trusted[:3]]
    if untrusted:
        p = untrusted[0]
        bits.append(f"Ignored: {p['title']} ({p['meaning']}).")
    return " ".join(bits)


def _template(calls: list[tuple[str, dict]]) -> str:
    for name, r in reversed(calls):
        if name == "plan_trip":
            return _trip_text(r)
        if name == "get_live_problems":
            return _problems_text(r)
        if name == "get_my_journey":
            if not r.get("ok"):
                return r["error"]
            p = r.get("replan_proposal")
            return p["message"] if p else (r.get("notice") or f"Your trip ({r['route']}) is {r['status']}, arriving {r['arrive']}.")
        if name == "explain_problem" and r.get("ok"):
            return f"{r['title']}: {r['meaning']}, {r['trust_pct']}%. {r['summary']}"
    return "Sorry, I couldn't answer that. Try “Thane to Wankhede by 18:30” or “Is Metro 1 running?”."


_TRIP = re.compile(r"(?:from\s+)?(?P<a>.+?)\s+(?:to|se)\s+(?P<b>.+?)(?:\s+(?:by|before|at)\s+(?P<t>\d{1,2}[:.]\d{2}))?\s*[?.!]*$", re.I)


def _fallback(message: str) -> tuple[str, list[tuple[str, dict]]]:
    """No Gemini: handle 'A to B (by HH:MM)' and 'is <line> running / problem at <station>'."""
    calls: list[tuple[str, dict]] = []
    m = _TRIP.search(message.strip())
    if m:
        t = m.group("t")
        r = plan_trip(m.group("a"), m.group("b"), arrive_by=t.replace(".", ":").zfill(5) if t else None)
        if r.get("ok") or "Unknown place" not in r.get("error", ""):
            calls.append(("plan_trip", r))
            return _trip_text(r), calls
    lowered = message.lower()
    for word in ("metro 1", "metro 3", "western", "central", "harbour", "aqua"):
        if word in lowered:
            r = get_live_problems(line=word)
            calls.append(("get_live_problems", r))
            return _problems_text(r), calls
    for word in ("dadar", "andheri", "saki naka", "bandra", "kurla", "ghatkopar", "thane", "csmt", "churchgate"):
        if word in lowered:
            r = get_live_problems(station=word)
            calls.append(("get_live_problems", r))
            return _problems_text(r), calls
    return ("The AI assistant is offline right now. I can still plan “Thane to Wankhede by 18:30” "
            "or check “Is Metro 1 running?”."), calls


# ---- Main entry ---------------------------------------------------------------------------------
def chat(messages: list[dict], journey_id: str | None = None) -> dict:
    """messages: [{role: 'user'|'assistant', text}], newest last. Returns the reply + UI extras."""
    last = next((m["text"] for m in reversed(messages) if m.get("role") == "user"), "")
    calls: list[tuple[str, dict]] = []
    source = "gemini"
    note = None
    try:
        if not gemini.available():
            raise gemini.GeminiError("no key")
        reply, calls = _run(messages, journey_id)
        allowed = allowed_numbers(*[m.get("text", "") for m in messages], *[_public(r) for _, r in calls],
                                  fmt_hhmm(clock.now()))
        bad = unsupported(reply, allowed)
        if bad:
            retry = [*messages, {"role": "assistant", "text": reply},
                     {"role": "user", "text": f"(System check: these numbers were not in any tool result: {', '.join(bad)}. "
                                              "Rewrite your last answer using only numbers from the tool results.)"}]
            reply2, more = _run(retry, journey_id)
            calls += more
            allowed |= allowed_numbers(*[_public(r) for _, r in more])
            if unsupported(reply2, allowed):
                reply, source, note = _template(calls), "template", f"number check failed: {bad}"
            else:
                reply = reply2
    except gemini.GeminiError as exc:
        reply, calls = _fallback(last)
        source, note = "fallback", str(exc)

    trip = next((r for name, r in reversed(calls) if name == "plan_trip" and r.get("ok")), None)
    problems = next((r for name, r in reversed(calls) if name == "get_live_problems" and r.get("ok")), None)
    return {
        "reply": reply,
        "source": source,                       # gemini | template | fallback
        "model": settings.gemini_model if source != "fallback" else None,
        "tools_used": [name for name, _ in calls],
        "trip": {"traveller": trip["_traveller"], "from": trip["from"], "to": trip["to"],
                 "options": trip["options"]} if trip else None,
        "problems": problems["problems"] if problems else None,
        "note": note,
    }


def _run(messages: list[dict], journey_id: str | None) -> tuple[str, list[tuple[str, dict]]]:
    contents = _history(messages)
    calls: list[tuple[str, dict]] = []
    system = system_prompt(journey_id)
    for _ in range(MAX_TOOL_ROUNDS):
        content = gemini.generate(contents, system=system, tools=DECLARATIONS)
        contents.append(content)
        fcalls = [p["functionCall"] for p in content.get("parts", []) if "functionCall" in p]
        if not fcalls:
            return _text(content) or _template(calls), calls
        responses = []
        for fc in fcalls:
            name, args = fc.get("name"), fc.get("args") or {}
            fn = TOOLS.get(name)
            try:
                result = fn(**args) if fn else {"ok": False, "error": f"unknown tool {name}"}
            except TypeError as exc:
                result = {"ok": False, "error": f"bad arguments: {exc}"}
            calls.append((name, result))
            fr = {"name": name, "response": json.loads(json.dumps(_public(result), default=str))}
            if fc.get("id"):
                fr["id"] = fc["id"]
            responses.append({"functionResponse": fr})
        contents.append({"role": "user", "parts": responses})
    return _template(calls), calls
