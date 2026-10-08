"""Readable route summaries for people (not ids): 'CR Fast → Taxi'."""
from __future__ import annotations

from app.schemas import Leg

SHORT_LINE = {"WR_SLOW": "WR Slow", "WR_FAST": "WR Fast", "CR_SLOW": "CR Slow", "CR_FAST": "CR Fast",
              "HARBOUR": "Harbour", "METRO1": "Metro 1", "METRO3": "Metro 3"}
MODE_WORD = {"walk": "Walk", "taxi": "Taxi", "auto": "Auto", "cab": "Cab", "bus": "BEST bus", "ferry": "Ferry"}


def route_text(legs: list[Leg]) -> str:
    parts: list[str] = []
    for leg in legs:
        if leg.line_id:
            name = "BEST bus" if leg.line_id.startswith("BEST") else SHORT_LINE.get(leg.line_id, leg.line_id)
        elif leg.mode == "walk":
            continue
        else:
            name = MODE_WORD.get(leg.mode, leg.mode)
        if not parts or parts[-1] != name:
            parts.append(name)
    return " → ".join(parts) or "Walk"
