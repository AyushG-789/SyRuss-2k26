"""Scoring and card generation for route candidates. SPEC.md §5.5."""
from __future__ import annotations
from app.i18n import tr

from typing import Any
from pydantic import BaseModel

from app.schemas import Priority, RouteCard, Leg


class ScoredCandidate(BaseModel):
    plan_id: str
    legs: list[Leg]
    duration_min: int
    cost_inr: int
    transfers: int
    walk_min: int
    reliability: float
    risk_delay_min: float = 0.0

    @property
    def expected_time(self) -> float:
        return self.duration_min + self.risk_delay_min


def calculate_metrics_and_scores(
    candidates: list[ScoredCandidate],
    priority: Priority = "balanced",
) -> tuple[dict[str, float], dict[str, float], dict[str, float]]:
    """Calculate normalized (0..10) scores for fastest, cheapest, optimal."""
    if not candidates:
        return {}, {}, {}

    if len(candidates) == 1:
        cid = candidates[0].plan_id
        return {cid: 10.0}, {cid: 10.0}, {cid: 10.0}

    # Extract raw metrics
    times = [c.expected_time for c in candidates]
    costs = [c.cost_inr for c in candidates]
    transfers = [c.transfers for c in candidates]
    walks = [c.walk_min for c in candidates]
    reliabilities = [c.reliability for c in candidates]

    min_t, max_t = min(times), max(times)
    min_c, max_c = min(costs), max(costs)
    min_x, max_x = min(transfers), max(transfers)
    min_w, max_w = min(walks), max(walks)
    min_r, max_r = min(reliabilities), max(reliabilities)

    norm_t = [1.0 if max_t == min_t else 1.0 - (t - min_t) / (max_t - min_t) for t in times]
    norm_c = [1.0 if max_c == min_c else 1.0 - (c - min_c) / (max_c - min_c) for c in costs]
    norm_x = [1.0 if max_x == min_x else 1.0 - (x - min_x) / (max_x - min_x) for x in transfers]
    norm_w = [1.0 if max_w == min_w else 1.0 - (w - min_w) / (max_w - min_w) for w in walks]
    norm_r = [1.0 if max_r == min_r else (r - min_r) / (max_r - min_r) for r in reliabilities]

    # Weights
    w_fastest = {"t": 0.60, "c": 0.05, "x": 0.10, "w": 0.05, "r": 0.20}
    w_cheapest = {"t": 0.10, "c": 0.60, "x": 0.10, "w": 0.05, "r": 0.15}

    w_opt = {"t": 0.30, "c": 0.20, "x": 0.15, "w": 0.10, "r": 0.25}
    if priority == "fastest":
        w_opt["t"] += 0.15
    elif priority == "cheapest":
        w_opt["c"] += 0.15
    elif priority == "fewest_transfers":
        w_opt["x"] += 0.15
    elif priority == "most_reliable":
        w_opt["r"] += 0.15
    sum_opt = sum(w_opt.values())
    w_opt = {k: v / sum_opt for k, v in w_opt.items()}

    scores_fast: dict[str, float] = {}
    scores_cheap: dict[str, float] = {}
    scores_opt: dict[str, float] = {}

    for i, c in enumerate(candidates):
        cid = c.plan_id
        m = {"t": norm_t[i], "c": norm_c[i], "x": norm_x[i], "w": norm_w[i], "r": norm_r[i]}

        sf = round(10.0 * sum(w_fastest[k] * m[k] for k in m), 1)
        sc = round(10.0 * sum(w_cheapest[k] * m[k] for k in m), 1)
        so = round(10.0 * sum(w_opt[k] * m[k] for k in m), 1)

        scores_fast[cid] = max(0.0, min(10.0, sf))
        scores_cheap[cid] = max(0.0, min(10.0, sc))
        scores_opt[cid] = max(0.0, min(10.0, so))

    return scores_fast, scores_cheap, scores_opt


def build_route_cards(
    candidates: list[ScoredCandidate],
    priority: Priority = "balanced",
    language: str = "en",
) -> list[RouteCard]:
    """Select up to 3 distinct route cards (Fastest, Optimal, Cheapest) and score them."""
    if not candidates:
        return []

    scores_fast, scores_cheap, scores_opt = calculate_metrics_and_scores(candidates, priority)
    cand_by_id = {c.plan_id: c for c in candidates}

    # Sort candidates for each category
    fast_sorted = sorted(candidates, key=lambda c: (scores_fast[c.plan_id], -c.duration_min, -c.cost_inr), reverse=True)
    opt_sorted = sorted(candidates, key=lambda c: (scores_opt[c.plan_id], -c.duration_min, -c.cost_inr), reverse=True)
    cheap_sorted = sorted(candidates, key=lambda c: (scores_cheap[c.plan_id], -c.cost_inr, -c.duration_min), reverse=True)

    chosen: dict[str, tuple[str, ScoredCandidate, float]] = {}  # label -> (plan_id, cand, score)
    used_ids: set[str] = set()

    # 1. Pick Fastest
    best_fast = fast_sorted[0]
    chosen["fastest"] = ("p_fast", best_fast, scores_fast[best_fast.plan_id])
    used_ids.add(best_fast.plan_id)

    # 2. Pick Cheapest
    best_cheap = next((c for c in cheap_sorted if c.plan_id not in used_ids), None)
    if best_cheap is None:
        best_cheap = cheap_sorted[0]
    chosen["cheapest"] = ("p_cheap", best_cheap, scores_cheap[best_cheap.plan_id])
    used_ids.add(best_cheap.plan_id)

    # 3. Pick Optimal
    best_opt = next((c for c in opt_sorted if c.plan_id not in used_ids), None)
    if best_opt is None:
        best_opt = opt_sorted[0]
    chosen["optimal"] = ("p_opt", best_opt, scores_opt[best_opt.plan_id])
    used_ids.add(best_opt.plan_id)

    # Determine recommended card
    rec_label = "optimal"
    if priority == "fastest":
        rec_label = "fastest"
    elif priority == "cheapest":
        rec_label = "cheapest"

    cards: list[RouteCard] = []
    # Output order: Fastest, Optimal, Cheapest
    for label in ("fastest", "optimal", "cheapest"):
        pid, cand, sc = chosen[label]
        rel_colour = "green" if cand.reliability >= 0.90 else "yellow" if cand.reliability >= 0.70 else "red"
        rel_pct = round(cand.reliability * 100)

        n = cand.transfers
        changes = tr(language, "changes.none") if n == 0 else tr(language, "changes.one") if n == 1 else tr(language, "changes.many", n=n)
        reason = tr(language, "card.reason", label=tr(language, f"label.{label}"), min=cand.duration_min,
                    cost=cand.cost_inr, changes=changes, rel=rel_pct)
        facts: dict[str, Any] = {
            "duration_min": cand.duration_min,
            "cost_inr": cand.cost_inr,
            "transfers": cand.transfers,
            "walk_min": cand.walk_min,
            "reliability": rel_pct,
        }

        card = RouteCard(
            plan_id=pid,
            label=label,  # type: ignore[arg-type]
            recommended=(label == rec_label),
            legs=cand.legs,
            duration_min=cand.duration_min,
            cost_inr=cand.cost_inr,
            transfers=cand.transfers,
            walk_min=cand.walk_min,
            reliability=cand.reliability,
            reliability_colour=rel_colour,  # type: ignore[arg-type]
            score=sc,
            reason=reason,
            facts=facts,
        )
        cards.append(card)

    return cards
