"""Number check (SPEC §6.3): every number in a chat reply must come from a tool result or the
traveller's own message. Stops the model from inventing times, fares or trust percentages."""
from __future__ import annotations

import json
import re

_DEVANAGARI = str.maketrans("०१२३४५६७८९", "0123456789")
_NUM = re.compile(r"\d+(?:[.:]\d+)?")
ALWAYS_OK = {str(n) for n in range(0, 6)}  # "1 change", "2 options", "3 routes"


def numbers_in(text: str) -> set[str]:
    out = set()
    for n in _NUM.findall(text.translate(_DEVANAGARI)):
        out.add(n)
        if ":" in n:  # "17:05" also allows "17" and "05"
            out.update(n.split(":"))
        if n.endswith(".0"):
            out.add(n[:-2])
    return out


def allowed_numbers(*sources) -> set[str]:
    allowed = set(ALWAYS_OK)
    for s in sources:
        allowed |= numbers_in(s if isinstance(s, str) else json.dumps(s, ensure_ascii=False))
    # "09:05" vs "9:05"
    allowed |= {n.lstrip("0") or "0" for n in allowed}
    return allowed


def unsupported(reply: str, allowed: set[str]) -> list[str]:
    bad = []
    for n in sorted(numbers_in(reply)):
        if n in allowed or (n.lstrip("0") or "0") in allowed:
            continue
        bad.append(n)
    return bad
