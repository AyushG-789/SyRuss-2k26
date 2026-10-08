"""Print Pakka Check's verdict for every seed event at a given demo time.

Usage (repo root, backend venv):
    python scripts/score_seed_reports.py            # at the scenario check time (17:35)
    python scripts/score_seed_reports.py --at 17:08
    python scripts/score_seed_reports.py --timeline # one line per event every 5 min, 16:30–18:30
"""
from __future__ import annotations

import argparse
import sys
from datetime import timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.clock import fmt_hhmm, parse_hhmm  # noqa: E402
from app.data_loader import load_seed  # noqa: E402
from app.verify.score import evaluate  # noqa: E402
from app.verify.seed import seed_events  # noqa: E402

ICON = {"confirmed": "🔴", "possible": "🟡", "ignored": "⚪", "coordinated": "🚩", "expired": "⌛"}


def table(at: str) -> int:
    seed = load_seed()
    now = parse_hhmm(at)
    mismatches = 0
    print(f"Pakka Check at {at}\n")
    print(f"{'Event':20} {'Conf':>5}  {'Status':13} {'Expected':12} Evidence")
    print("-" * 100)
    for ev in seed_events(seed).values():
        r = evaluate(ev.type, ev.evidence, seed.reporters, now)
        ok = r.status == ev.expected_status
        mismatches += not ok
        print(f"{ev.event_id:20} {round(r.confidence * 100):>4}%  {ICON[r.status]} {r.status:11} "
              f"{ev.expected_status or '-':12} {'✅' if ok else '❌'} {r.explain()}")
    return mismatches


def timeline() -> None:
    seed = load_seed()
    events = seed_events(seed)
    t = parse_hhmm(seed.scenario["start"])
    end = parse_hhmm(seed.scenario["end"])
    times = []
    while t <= end:
        times.append(t)
        t += timedelta(minutes=5)
    print(f"{'Event':20} " + " ".join(fmt_hhmm(x)[0:5] for x in times[::2]))
    for ev in events.values():
        cells = []
        for x in times[::2]:
            cells.append(f"{ICON[evaluate(ev.type, ev.evidence, seed.reporters, x).status]:^5}")
        print(f"{ev.event_id:20} " + " ".join(cells))
    print("\n" + "  ".join(f"{i} {s}" for s, i in ICON.items()))


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--at", help="HH:MM on the demo day")
    p.add_argument("--timeline", action="store_true")
    args = p.parse_args()
    if args.timeline:
        timeline()
        return
    at = args.at or load_seed().scenario["_meta"]["check_at"]
    bad = table(at)
    if args.at is None:
        print(f"\n{'All events match the expected status.' if bad == 0 else f'{bad} mismatches.'}")
        sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
