"""Every number Pakka Check uses, in one place (SPEC.md §4.4–4.7).

The transparency page reads these directly, so what judges see is what the code does.
"""
from __future__ import annotations

# --- Source weights (SPEC §4.5) ---
SOURCE_WEIGHT = {"official": 0.8, "news": 0.6, "crowd": 0.25, "weather": 0.2}

# Trust ranking for contradictions: a "running normally" only cancels a claim when it comes
# from a source ranked HIGHER than the strongest source supporting that claim.
SOURCE_RANK = {"official": 3, "traffic": 2, "news": 1, "crowd": 0, "weather": -1}

# --- Crowd weights and anti-gaming (SPEC §4.4) ---
CROWD_BASE = 0.25
CROWD_CAP = 0.35
DEFAULT_REPUTATION = 0.5
NEW_ACCOUNT_MAX_AGE_DAYS = 1          # younger than this = "new account"
LOW_REPUTATION = 0.2                  # below this = untrusted reporter
UNTRUSTED_WEIGHT = 0.05               # weight for new / untrusted reporters
BURST_MIN_REPORTS = 3                 # this many near-identical new-account reports …
BURST_WINDOW_MIN = 10                 # … within this many minutes …
BURST_SIMILARITY = 85                 # … with text similarity ≥ this (0–100) = coordinated burst
BURST_WEIGHT = 0.05                   # a whole burst counts as ONE source of this weight
REPUTATION_UP = 0.1                   # reporter's event confirmed
REPUTATION_DOWN = 0.2                 # reporter's event contradicted

# --- Freshness (SPEC §4.5): no fading for the first GRACE minutes, then exp(-(age-GRACE)/TAU) ---
DECAY_GRACE_MIN = 15
DECAY_TAU_MIN = {
    "delay": 60, "closure": 240, "lift_out": 1440, "diversion": 120,
    "crowding": 30, "waterlogging": 120, "mega_block": None,  # None = no fading
}

# --- Lifetime after the last supporting evidence (SPEC §4.7) ---
LIFETIME_MIN = {
    "delay": 45, "closure": 240, "lift_out": 1440, "diversion": 120,
    "crowding": 30, "waterlogging": 120, "mega_block": None,  # None = until announced end
}

# --- Status thresholds (SPEC §4.6) ---
CONFIRMED_AT = 0.70
POSSIBLE_AT = 0.40

# Types that only describe the absence of a problem; they can contradict but never support.
NON_DISRUPTION_TYPES = {"running_normally", "not_a_disruption"}


def as_dict() -> dict:
    """Snapshot for the transparency page / API."""
    return {
        "source_weight": SOURCE_WEIGHT,
        "source_rank": SOURCE_RANK,
        "crowd": {"base": CROWD_BASE, "cap": CROWD_CAP, "formula": "0.25 × (0.5 + reputation), capped at 0.35"},
        "anti_gaming": {
            "new_account_max_age_days": NEW_ACCOUNT_MAX_AGE_DAYS,
            "low_reputation": LOW_REPUTATION,
            "untrusted_weight": UNTRUSTED_WEIGHT,
            "burst": {"min_reports": BURST_MIN_REPORTS, "window_min": BURST_WINDOW_MIN,
                      "similarity": BURST_SIMILARITY, "weight": BURST_WEIGHT},
            "reputation_up": REPUTATION_UP,
            "reputation_down": REPUTATION_DOWN,
        },
        "decay": {"grace_min": DECAY_GRACE_MIN, "tau_min": DECAY_TAU_MIN},
        "lifetime_min": LIFETIME_MIN,
        "thresholds": {"confirmed": CONFIRMED_AT, "possible": POSSIBLE_AT},
    }
