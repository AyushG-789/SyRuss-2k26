"""Turn what someone typed ("Andheri", "BKC", "VT") into a known place or line.

Same rules as the website's trip form (frontend/lib/places.ts), plus station aliases, so the
chatbot and the form agree on what a name means.
"""
from __future__ import annotations

import re
from functools import lru_cache

from .data_loader import load_seed
from .schemas import Place


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def _words(s: str) -> set[str]:
    return {w for w in _norm(s).split() if len(w) >= 3}


@lru_cache(maxsize=1)
def _options() -> list[dict]:
    seed = load_seed()
    opts = [{"label": p["name"], "lat": p["lat"], "lon": p["lon"], "poi_id": pid, "stop_id": None, "names": [p["name"]]}
            for pid, p in seed.pois.items()]
    for sid, s in seed.stations.items():
        if s["mode"] == "bus":
            continue
        opts.append({"label": f"{s['name']} station", "lat": s["lat"], "lon": s["lon"], "poi_id": None, "stop_id": sid,
                     "names": [s["name"], *(s.get("aliases") or [])]})
    return opts


def resolve_place(text: str) -> Place | None:
    """Best known place for the text, or None. Ties go to the shorter (more general) name."""
    q = _norm(text or "")
    if not q:
        return None
    opts = _options()
    tiers = [
        lambda o: _norm(o["label"]) == q,
        lambda o: any(_norm(n) == q for n in o["names"]),
        lambda o: any(_norm(n).startswith(q + " ") for n in o["names"]),
        lambda o: any(q.startswith(_norm(n) + " ") for n in o["names"]),
    ]
    for tier in tiers:
        hits = [o for o in opts if tier(o)]
        if hits:
            return _place(min(hits, key=lambda o: len(o["label"])))
    qw = _words(text)
    scored = [(len(_words(o["label"]) & qw), -len(o["label"]), o) for o in opts]
    best = max(scored, key=lambda t: (t[0], t[1]), default=None)
    return _place(best[2]) if best and best[0] > 0 else None


def stop_ids_for(text: str) -> list[str]:
    """Station ids a name could mean ("Dadar" → both Dadar stations; "Andheri" → WR + Metro 1)."""
    q = _norm(text or "")
    if not q:
        return []
    seed = load_seed()
    ids = [sid for sid, s in seed.stations.items()
           if _norm(s["name"]) == q or _norm(s["name"]).startswith(q + " ")
           or any(_norm(a) == q for a in (s.get("aliases") or []))]
    if ids:
        return ids
    p = resolve_place(text)
    return [o["stop_id"] for o in _options() if p and o["label"] == p.label and o["stop_id"]]


LINE_WORDS = {
    "METRO1": ["metro 1", "metro line 1", "line 1", "m1", "versova ghatkopar", "blue line"],
    "METRO3": ["metro 3", "metro line 3", "line 3", "aqua", "aqua line", "m3"],
    "WR_SLOW": ["western slow", "wr slow", "western line slow"],
    "WR_FAST": ["western fast", "wr fast", "western line fast"],
    "CR_SLOW": ["central slow", "cr slow", "central line slow"],
    "CR_FAST": ["central fast", "cr fast", "central line fast"],
    "HARBOUR": ["harbour", "harbour line", "harbor"],
}
LINE_GROUPS = {
    "western": ["WR_SLOW", "WR_FAST"], "western line": ["WR_SLOW", "WR_FAST"], "wr": ["WR_SLOW", "WR_FAST"],
    "central": ["CR_SLOW", "CR_FAST"], "central line": ["CR_SLOW", "CR_FAST"], "cr": ["CR_SLOW", "CR_FAST"],
    "metro": ["METRO1", "METRO3"], "local": ["WR_SLOW", "WR_FAST", "CR_SLOW", "CR_FAST", "HARBOUR"],
}


def resolve_lines(text: str) -> list[str]:
    """Line ids a name means ("Metro 1" → METRO1, "western line" → WR_SLOW + WR_FAST)."""
    q = _norm(text or "")
    if not q:
        return []
    lines = load_seed().lines
    if text.upper() in lines:
        return [text.upper()]
    for lid, words in LINE_WORDS.items():
        if q in words or q == _norm(lines[lid]["name"]):
            return [lid]
    return LINE_GROUPS.get(q, [])


def _place(o: dict) -> Place:
    return Place(label=o["label"], lat=o["lat"], lon=o["lon"], poi_id=o["poi_id"])
