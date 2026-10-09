"""Readable route summaries for people (not ids): 'CR Fast → Taxi'."""
from __future__ import annotations

from app.i18n import tr

from app.schemas import Leg

SHORT_LINE = {"WR_SLOW": "WR Slow", "WR_FAST": "WR Fast", "CR_SLOW": "CR Slow", "CR_FAST": "CR Fast",
              "HARBOUR": "Harbour", "METRO1": "Metro 1", "METRO3": "Metro 3"}
MODE_WORD = {"walk": "Walk", "taxi": "Taxi", "auto": "Auto", "cab": "Cab", "bus": "BEST bus", "ferry": "Ferry"}


def _line_name(line_id: str, lang: str) -> str:
    if line_id.startswith("BEST"):
        return tr(lang, "word.bus")
    if line_id == "HARBOUR":
        return tr(lang, "line.harbour")
    for speed in ("SLOW", "FAST"):
        if line_id.endswith(f"_{speed}"):
            return f"{line_id.split('_')[0]} {tr(lang, f'line.{speed.lower()}')}"
    return SHORT_LINE.get(line_id, line_id)


def route_text(legs: list[Leg], lang: str = "en") -> str:
    parts: list[str] = []
    for leg in legs:
        if leg.line_id:
            name = _line_name(leg.line_id, lang)
        elif leg.mode == "walk":
            continue
        else:
            name = tr(lang, f"word.{leg.mode}") if leg.mode in MODE_WORD else leg.mode
        if not parts or parts[-1] != name:
            parts.append(name)
    return " → ".join(parts) or tr(lang, "word.walk")
