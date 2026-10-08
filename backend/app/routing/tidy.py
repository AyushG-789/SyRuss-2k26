"""Clean up the 'Rejected options' list before it reaches the screen.

The path search returns many near-identical candidates: the same lines with a change at a
different station, or getting off and back on the same line ("WR_SLOW -> WR_SLOW"). Their
summaries only name the lines, so they look like repeats. We merge repeated lines, keep one
entry per route summary (the first, i.e. the closest to passing), and show at most a few.
"""
from __future__ import annotations

from app.schemas import RejectedOption

MAX_REJECTED = 5


def _collapse(summary: str) -> str:
    """'Via WR_SLOW -> WR_SLOW -> METRO3' -> 'Via WR_SLOW -> METRO3'."""
    prefix = "Via "
    if not summary.startswith(prefix):
        return summary
    parts: list[str] = []
    for p in summary[len(prefix):].split(" -> "):
        if not parts or parts[-1] != p:
            parts.append(p)
    return prefix + " -> ".join(parts)


def tidy_rejected(rejected: list[RejectedOption], limit: int = MAX_REJECTED) -> list[RejectedOption]:
    seen: set[str] = set()
    out: list[RejectedOption] = []
    for r in rejected:
        summary = _collapse(r.summary)
        if summary in seen:
            continue
        seen.add(summary)
        out.append(RejectedOption(summary=summary, reason=r.reason))
        if len(out) >= limit:
            break
    return out
