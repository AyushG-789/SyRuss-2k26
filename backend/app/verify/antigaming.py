"""Anti-gaming rules (SPEC.md §4.4): decide how much each piece of evidence is worth.

1. Crowd weight depends on the reporter: 0.25 × (0.5 + reputation), capped at 0.35.
2. New accounts (< 1 day) and low-reputation reporters count only 0.05.
3. Coordinated burst: ≥ 3 near-identical new-account reports within 10 min collapse into ONE
   source of weight 0.05, and the event is flagged `coordinated_burst`.
4. One reporter, many reports on the same event: counts once (their highest weight).
"""
from __future__ import annotations

import re
from datetime import timedelta

from rapidfuzz import fuzz

from . import policy
from .evidence import RawEvidence, WeightedEvidence

Reporters = dict[str, dict]  # reporter_id -> {"account_age_days": int, "reputation": float}


def is_untrusted(reporter: dict | None) -> bool:
    if reporter is None:
        return True
    return (reporter.get("account_age_days", 0) < policy.NEW_ACCOUNT_MAX_AGE_DAYS
            or reporter.get("reputation", policy.DEFAULT_REPUTATION) < policy.LOW_REPUTATION)


def crowd_weight(reporter: dict | None) -> tuple[float, str]:
    if is_untrusted(reporter):
        if reporter is None:
            return policy.UNTRUSTED_WEIGHT, "unknown reporter"
        if reporter.get("account_age_days", 0) < policy.NEW_ACCOUNT_MAX_AGE_DAYS:
            return policy.UNTRUSTED_WEIGHT, "new account"
        return policy.UNTRUSTED_WEIGHT, "low reputation"
    rep = reporter.get("reputation", policy.DEFAULT_REPUTATION)
    return min(policy.CROWD_BASE * (0.5 + rep), policy.CROWD_CAP), f"reputation {rep:.2f}"


def _norm(text: str) -> str:
    return re.sub(r"[^a-z0-9 ]+", "", text.lower()).strip()


def similarity(a: str, b: str) -> float:
    """0–100, ignoring case, punctuation and word order."""
    return fuzz.token_sort_ratio(_norm(a), _norm(b))


def find_bursts(items: list[RawEvidence], reporters: Reporters) -> list[list[RawEvidence]]:
    """Groups of ≥ BURST_MIN_REPORTS near-identical crowd reports from new accounts."""
    new_account = [
        e for e in items
        if e.source_type == "crowd" and not e.contradicts
        and reporters.get(e.reporter_id or "", {}).get("account_age_days", 0) < policy.NEW_ACCOUNT_MAX_AGE_DAYS
    ]
    new_account.sort(key=lambda e: e.at)
    window = timedelta(minutes=policy.BURST_WINDOW_MIN)
    used: set[str] = set()
    bursts: list[list[RawEvidence]] = []
    for seed in new_account:
        if seed.ref_id in used:
            continue
        group = [seed] + [
            e for e in new_account
            if e.ref_id != seed.ref_id and e.ref_id not in used
            and timedelta(0) <= e.at - seed.at <= window
            and similarity(seed.text, e.text) >= policy.BURST_SIMILARITY
        ]
        if len(group) >= policy.BURST_MIN_REPORTS:
            bursts.append(group)
            used.update(e.ref_id for e in group)
    return bursts


def weigh(items: list[RawEvidence], reporters: Reporters) -> tuple[list[WeightedEvidence], list[str]]:
    """Apply all anti-gaming rules. Returns (weighted evidence, event flags)."""
    flags: list[str] = []
    out: list[WeightedEvidence] = []

    bursts = find_bursts(items, reporters)
    in_burst = {e.ref_id for group in bursts for e in group}
    for group in bursts:
        flags.append("coordinated_burst")
        latest = max(group, key=lambda e: e.at)
        out.append(WeightedEvidence(
            raw=latest,
            weight=policy.BURST_WEIGHT,
            note=f"coordinated burst of {len(group)} new-account reports, counted once",
            covers=tuple(e.ref_id for e in group),
            burst=True,
        ))

    # Crowd: one entry per (reporter, supports/contradicts), keeping the highest weight.
    best_by_reporter: dict[tuple[str, bool], WeightedEvidence] = {}
    repeats: dict[tuple[str, bool], list[str]] = {}
    for e in items:
        if e.ref_id in in_burst:
            continue
        if e.source_type == "crowd":
            key = (e.reporter_id or e.ref_id, e.contradicts)
            weight, note = crowd_weight(reporters.get(e.reporter_id or ""))
            repeats.setdefault(key, []).append(e.ref_id)
            current = best_by_reporter.get(key)
            # Same weight → keep the latest report so the event's last_seen stays fresh.
            if current is None or weight > current.weight or (weight == current.weight and e.at > current.raw.at):
                best_by_reporter[key] = WeightedEvidence(raw=e, weight=weight, note=note)
        else:
            out.append(WeightedEvidence(raw=e, weight=policy.SOURCE_WEIGHT[e.source_type], note=e.source_type))

    for key, w in best_by_reporter.items():
        refs = repeats[key]
        if len(refs) > 1:
            w = WeightedEvidence(raw=w.raw, weight=w.weight,
                                 note=f"{w.note}; same reporter {len(refs)}×, counted once", covers=tuple(refs))
            if "repeat_reporter" not in flags:
                flags.append("repeat_reporter")
        out.append(w)

    out.sort(key=lambda w: w.raw.at)
    return out, flags


def update_reputation(reporter: dict, outcome: str) -> dict:
    """outcome: 'confirmed' → +0.1, 'contradicted' → −0.2 (clamped to 0..1). Returns a new dict."""
    rep = reporter.get("reputation", policy.DEFAULT_REPUTATION)
    if outcome == "confirmed":
        rep += policy.REPUTATION_UP
    elif outcome == "contradicted":
        rep -= policy.REPUTATION_DOWN
    return {**reporter, "reputation": round(min(max(rep, 0.0), 1.0), 3)}
