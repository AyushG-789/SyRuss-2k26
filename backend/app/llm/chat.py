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
import time

from ..clock import clock, fmt_hhmm
from ..config import settings
from ..places import resolve_place
from . import gemini, indic
from .check_numbers import allowed_numbers, unsupported
from .tools import DECLARATIONS, TOOLS, get_live_problems, plan_trip

MAX_TOOL_ROUNDS = 4
MAX_HISTORY = 10
# Time limits (seconds). If Gemini is slower than this, answer from the live data instead.
CALL_TIMEOUT_S = 8.0
FAST_TIMEOUT_S = 6.0      # the one wording call on the fast path
TOTAL_BUDGET_S = 14.0


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
def _trip_text(r: dict, lang: str = "en") -> str:
    if not r.get("ok"):
        return r.get("error", "I couldn't plan that trip.")
    if not r["options"]:
        return indic.say("no_route", lang, frm=r["from"], to=r["to"])
    best = next((o for o in r["options"] if o["recommended"]), r["options"][0])
    line = indic.say("trip", lang, frm=r["from"], to=r["to"], route=best["route"], depart=best["depart"],
                     arrive=best["arrive"], mins=best["duration_min"], cost=best["cost_inr"])
    if best["live_problems"]:
        p = best["live_problems"][0]
        line += indic.say("trip_note", lang, title=p["title"], meaning=indic.meaning(p["status"], p["meaning"], lang),
                          pct=p["trust_pct"])
    return line


def _problems_text(r: dict, lang: str = "en") -> str:
    if not r.get("ok"):
        return r.get("error", "I couldn't check that.")
    trusted = [p for p in r["problems"] if p["status"] in ("confirmed", "possible")]
    untrusted = [p for p in r["problems"] if p["status"] not in ("confirmed", "possible")]
    where = r.get("where") or "there"
    if trusted:
        text = " ".join(indic.say("problem", lang, title=p["title"], meaning=indic.meaning(p["status"], p["meaning"], lang),
                                  pct=p["trust_pct"], sources=p["sources"]) for p in trusted[:3])
    else:
        text = indic.say("all_clear", lang, where=where, now=r["now"])
    burst = next((p for p in untrusted if p["status"] == "coordinated"), None)
    other = [p for p in untrusted if p["status"] != "coordinated"]
    if burst:
        text += indic.say("fake_burst", lang, title=burst["title"], pct=burst["trust_pct"])
    if other:
        p = other[0]
        text += indic.say("untrusted", lang, n=len(other), s="" if len(other) == 1 else "s",
                          title=p["title"], sources=p["sources"], pct=p["trust_pct"])
    return text


def _place_text(r: dict, lang: str = "en") -> str:
    if not r.get("ok"):
        return r.get("error", "I don't have details for that place.")
    if r["closed_today"]:
        return indic.say("place_closed", lang, name=r["name"], day=r["today"].title(), closed=", ".join(d.title() for d in r["closed_on"]) or "some days")
    if r["open_now"] is None:
        return f"{r['name']} is {r['hours_today']}. Plan about {r.get('visit_min') or 30} min there." + (
            f" Nearest: {', '.join(r['nearest_stops'])}." if r.get("nearest_stops") else "")
    state = {"en": " — open now" if r["open_now"] else " — closed right now", "hi": " — अभी खुला है" if r["open_now"] else " — अभी बंद है",
             "mr": " — आत्ता उघडे आहे" if r["open_now"] else " — आत्ता बंद आहे"}.get(lang, "")
    ticket = "" if r.get("ticket_inr") is None else (", free entry" if r["ticket_inr"] == 0 else f", ticket about ₹{r['ticket_inr']}")
    stops = f" Nearest: {', '.join(r['nearest_stops'])}." if r.get("nearest_stops") else ""
    hours = r["hours_today"] if r["hours_today"] == "open 24 hours" else f"open {r['hours_today'].replace('-', '–')}"
    return indic.say("place_open", lang, name=r["name"], hours=hours, day=r["today"].title(), state=state,
                     visit=r.get("visit_min") or 30, ticket=ticket, stops=stops)


def _template(calls: list[tuple[str, dict]], lang: str = "en") -> str:
    for name, r in reversed(calls):
        if name == "plan_trip":
            return _trip_text(r, lang)
        if name == "get_live_problems":
            return _problems_text(r, lang)
        if name == "get_place_info":
            return _place_text(r, lang)
        if name == "get_my_journey":
            if not r.get("ok"):
                return r["error"]
            p = r.get("replan_proposal")
            return p["message"] if p else (r.get("notice") or f"Your trip ({r['route']}) is {r['status']}, arriving {r['arrive']}.")
        if name == "explain_problem" and r.get("ok"):
            return f"{r['title']}: {r['meaning']}, {r['trust_pct']}%. {r['summary']}"
    return indic.say("offline", lang)


_BUDGET = re.compile(r"(?:under|below|max|within|budget(?: of)?)\s*(?:₹|rs\.?|inr)?\s*(\d{2,4})", re.I)
_TRIP_WORDS = re.compile(r"\s+(?:under|below|max|within|budget|cheapest|fastest|by|before|at)\b.*$", re.I)


_TIME = re.compile(r"\b(?:by|before|till|tak)\s+(\d{1,2}[:.]\d{2})", re.I)
_STATUS = re.compile(r"\b(running|run|working|problem|problems|issue|delay|delayed|late|closed|close|shut|band|"
                     r"status|open|kya|hai|update|disruption|crowd)\b", re.I)
_HOURS = re.compile(r"\b(opening|open|opens|close|closes|closing|timings?|hours|times?|kab|khulta|khulega|band hota|ticket|entry|fee)\b", re.I)
LINE_WORDS = ("metro 1", "metro 3", "western", "central", "harbour", "aqua")
STATION_WORDS = ("dadar", "andheri", "saki naka", "bandra", "kurla", "ghatkopar", "thane", "csmt", "churchgate")


def _trip_prefs(text: str, args: dict) -> dict:
    """Budget and priority words: 'under ₹150', 'cheapest' / 'सबसे सस्ता' / 'स्वस्त', 'fastest' / 'जल्दी' / 'लवकर'."""
    lowered = text.lower()
    if (bm := _BUDGET.search(text)):
        args["max_budget_inr"] = int(bm.group(1))
    if "cheap" in lowered or "सस्त" in text or "स्वस्त" in text:
        args["priority"] = "cheapest"
    elif "fast" in lowered or "quick" in lowered or "जल्दी" in text or "लवकर" in text:
        args["priority"] = "fastest"
    return args


def detect(message: str) -> tuple[str, dict] | None:
    """Recognise the two most common questions without AI, so they need only one Gemini call:
    'A to B (by HH:MM, under ₹N, cheapest)' and 'is <line> running / problem at <station>?'."""
    text = re.sub(r"\s+", " ", message.replace(",", " ")).strip()
    lowered = text.lower()
    lang = indic.language(message)
    # Hindi / Marathi / Hinglish trips first: "मला अंधेरीहून BKC ला जायचे आहे", "Thane se Wankhede jana hai".
    if lang != "en" and (trip := indic.find_trip(message, resolve_place)):
        args = {"origin": trip[0], "destination": trip[1], "language": lang}
        if (tm := re.search(r"(\d{1,2}[:.]\d{2})", text.translate(str.maketrans("०१२३४५६७८९", "0123456789")))):
            args["arrive_by"] = tm.group(1).replace(".", ":").zfill(5)
        return "plan_trip", _trip_prefs(text, args)
    m = None if re.search(r"[\u0900-\u097F]", message) else re.match(r"^(?:from\s+)?(?P<a>.+?)\s+(?:to|se)\s+(?P<b>.+)$", text, re.I)
    if m:
        a, b = m.group("a").strip(), _TRIP_WORDS.sub("", m.group("b")).strip(" ?.!")
        if resolve_place(a) and resolve_place(b):
            args: dict = {"origin": a, "destination": b}
            if (tm := _TIME.search(text)):
                args["arrive_by"] = tm.group(1).replace(".", ":").zfill(5)
            return "plan_trip", _trip_prefs(text, args)
    if _HOURS.search(text) or indic.HOURS_WORDS.search(message):
        place = _HOURS.sub(" ", indic.to_latin(message))
        p = resolve_place(place)
        if p and p.poi_id:
            return "get_place_info", {"place": p.label}
    latin = indic.to_latin(message)
    lowered = latin.lower()
    short = len(text.split()) <= 3
    if not (short or _STATUS.search(latin) or indic.STATUS_WORDS.search(message)):
        return None
    for word in LINE_WORDS:
        if word in lowered:
            return "get_live_problems", {"line": word}
    for word in STATION_WORDS:
        if word in lowered:
            return "get_live_problems", {"station": word}
    return None


def _fallback(message: str, lang: str | None = None) -> tuple[str, list[tuple[str, dict]]]:
    """No Gemini: answer the recognised questions straight from live data, in the asker's language."""
    lang = lang or indic.language(message)
    hit = detect(message)
    if hit:
        name, args = hit
        r = TOOLS[name](**args)
        return _template([(name, r)], lang), [(name, r)]
    return indic.say("offline", lang), []


# ---- Main entry ---------------------------------------------------------------------------------
_REPLY_IN = {"hi": "Hindi", "mr": "Marathi"}


def chat(messages: list[dict], journey_id: str | None = None, app_language: str | None = None) -> dict:
    """messages: [{role: 'user'|'assistant', text}], newest last. Returns the reply + UI extras.
    app_language: the language the app is shown in ('hi' / 'mr' → reply in it, in Devanagari)."""
    last = next((m["text"] for m in reversed(messages) if m.get("role") == "user"), "")
    pinned = app_language if app_language in _REPLY_IN else None
    reply_lang = pinned or indic.language(last)
    if pinned and messages and messages[-1].get("role") == "user":
        # Tell Gemini which language to answer in (the asker may mix English words into Hindi/Marathi).
        hint = f"\n\n(Reply in {_REPLY_IN[pinned]}, in Devanagari script. Keep station and line names as they are.)"
        messages = [*messages[:-1], {**messages[-1], "text": messages[-1]["text"] + hint}]
    calls: list[tuple[str, dict]] = []
    source = "gemini"
    note = None
    try:
        if not gemini.available():
            raise gemini.GeminiError("no key")
        deadline = time.monotonic() + TOTAL_BUDGET_S
        hit = detect(last) if len(messages) == 1 else None   # follow-ups need the full conversation
        if hit:
            reply, calls = _fast(messages, journey_id, hit, deadline)
        else:
            reply, calls = _run(messages, journey_id, deadline)
        allowed = allowed_numbers(*[m.get("text", "") for m in messages], *[_public(r) for _, r in calls],
                                  fmt_hhmm(clock.now()))
        bad = unsupported(reply, allowed)
        if bad:
            retry = [*messages, {"role": "assistant", "text": reply},
                     {"role": "user", "text": f"(System check: these numbers were not in any tool result: {', '.join(bad)}. "
                                              "Rewrite your last answer using only numbers from the tool results.)"}]
            try:
                reply2, more = _run(retry, journey_id, deadline)
            except (_SlowAfterTools, gemini.GeminiError):
                reply2, more = None, []
            calls += more
            allowed |= allowed_numbers(*[_public(r) for _, r in more])
            if reply2 is None or unsupported(reply2, allowed):
                reply, source, note = _template(calls, reply_lang), "template", f"number check failed: {bad}"
            else:
                reply = reply2
    except _SlowAfterTools as slow:
        calls = slow.calls
        reply, source, note = _template(calls, reply_lang), "template", "Gemini too slow; answered from live data"
    except gemini.GeminiError as exc:
        reply, calls = _fallback(last, pinned)
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


def _fast(messages: list[dict], journey_id: str | None, hit: tuple[str, dict], deadline: float):
    """Common question: look the data up ourselves, then ONE Gemini call (no tools) to word it.
    Half the waiting of the full tool loop."""
    name, args = hit
    result = TOOLS[name](**args)
    calls = [(name, result)]
    if gemini.resting():  # Gemini was just slow: answer instantly from the live data
        raise _SlowAfterTools(calls)
    data = json.dumps(_public(result), ensure_ascii=False, default=str)
    contents = _history(messages)
    contents[-1]["parts"].append({"text": f"\n\n[Live TravelBuddy data from {name} — answer using only this]\n{data}"})
    try:
        content = gemini.generate(contents, system=system_prompt(journey_id),
                                  timeout=min(FAST_TIMEOUT_S, max(2.0, deadline - time.monotonic())))
    except gemini.GeminiError:
        raise _SlowAfterTools(calls) from None
    return _text(content) or _template(calls), calls


class _SlowAfterTools(Exception):
    """Gemini got too slow after the tools already ran: answer from their results."""

    def __init__(self, calls):
        super().__init__("slow")
        self.calls = calls


def _run(messages: list[dict], journey_id: str | None, deadline: float | None = None) -> tuple[str, list[tuple[str, dict]]]:
    contents = _history(messages)
    calls: list[tuple[str, dict]] = []
    system = system_prompt(journey_id)
    deadline = deadline or time.monotonic() + TOTAL_BUDGET_S
    for _ in range(MAX_TOOL_ROUNDS):
        left = deadline - time.monotonic()
        if left < 2:
            if calls:
                raise _SlowAfterTools(calls)
            raise gemini.GeminiError("out of time")
        try:
            content = gemini.generate(contents, system=system, tools=DECLARATIONS, timeout=min(CALL_TIMEOUT_S, left))
        except gemini.GeminiError:
            if calls:
                raise _SlowAfterTools(calls) from None
            raise
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
