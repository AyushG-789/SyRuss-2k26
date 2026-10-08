"""Pakka Check scoring + anti-gaming on hand-built evidence (SPEC.md §4.4–4.8)."""
import pytest

from app.clock import parse_hhmm
from app.verify import antigaming, policy
from app.verify.evidence import RawEvidence
from app.verify.score import decay_factor, evaluate, status_for

T = parse_hhmm

REPORTERS = {
    **{f"u{i}": {"account_age_days": 200, "reputation": 0.5} for i in range(1, 10)},
    **{f"n{i}": {"account_age_days": 0, "reputation": 0.5} for i in range(1, 10)},
    "trusted": {"account_age_days": 900, "reputation": 1.0},
    "shady": {"account_age_days": 400, "reputation": 0.1},
}


def crowd(ref, reporter, at, text="metro stuck at saki naka", contradicts=False):
    return RawEvidence("crowd", ref, T(at), reporter_id=reporter, text=text, contradicts=contradicts)


def news(ref, at, contradicts=False):
    return RawEvidence("news", ref, T(at), text="news", contradicts=contradicts)


def official(ref, at, contradicts=False):
    return RawEvidence("official", ref, T(at), text="official", contradicts=contradicts)


def weather(ref, at):
    return RawEvidence("weather", ref, T(at), text="orange alert")


# ---- SPEC §4.8 sanity numbers ---------------------------------------------------------------

def test_three_crowd_plus_news_is_confirmed_083():
    ev = [crowd("a", "u1", "17:00"), crowd("b", "u2", "17:01"), crowd("c", "u3", "17:02"), news("n", "17:03")]
    r = evaluate("delay", ev, REPORTERS, T("17:03"))
    assert r.confidence == pytest.approx(0.831, abs=0.001)  # 1 − 0.75³ × 0.4
    assert r.status == "confirmed"


def test_three_crowd_alone_is_only_possible():
    ev = [crowd("a", "u1", "17:00"), crowd("b", "u2", "17:01"), crowd("c", "u3", "17:02")]
    r = evaluate("delay", ev, REPORTERS, T("17:02"))
    assert r.confidence == pytest.approx(0.578, abs=0.001)
    assert r.status == "possible"


def test_fake_burst_from_new_accounts_collapses_to_005():
    text = "METRO 1 COMPLETELY SHUT!!! dont go to ghatkopar metro"
    ev = [crowd(f"f{i}", f"n{i}", f"16:4{i}", text=text.lower() if i % 2 else text) for i in range(1, 6)]
    r = evaluate("closure", ev, REPORTERS, T("16:45"))
    assert r.confidence == pytest.approx(0.05)
    assert r.status == "coordinated"
    assert "coordinated_burst" in r.flags
    assert len(r.evidence) == 1 and len(r.evidence[0].covers) == 5


def test_one_crowd_plus_rain_prior_is_possible_040():
    ev = [weather("w", "15:30"), crowd("a", "u1", "17:25", text="paani bhar gaya")]
    r = evaluate("waterlogging", ev, REPORTERS, T("17:25"))
    assert r.confidence == pytest.approx(0.40)  # 1 − 0.75 × 0.8
    assert r.status == "possible"


def test_one_official_alone_is_confirmed():
    r = evaluate("closure", [official("o", "17:15")], REPORTERS, T("17:15"))
    assert r.confidence == pytest.approx(0.8)
    assert r.status == "confirmed"


def test_crowd_claim_contradicted_by_official_is_ignored():
    ev = [crowd("a", "u1", "17:20", text="western line puri band"), official("o", "17:22", contradicts=True)]
    r = evaluate("closure", ev, REPORTERS, T("17:25"))
    assert r.confidence == 0.0
    assert r.status == "ignored"
    assert "contradicted" in r.flags


# ---- Anti-gaming ----------------------------------------------------------------------------

def test_same_reporter_counts_once():
    ev = [crowd("a", "u1", "17:05"), crowd("b", "u1", "17:09", text="abhi bhi ruki hai")]
    r = evaluate("delay", ev, REPORTERS, T("17:10"))
    assert r.confidence == pytest.approx(0.25)
    assert "repeat_reporter" in r.flags
    assert r.last_seen == T("17:09")  # the repeat still keeps the event fresh


def test_new_account_alone_weighs_005():
    assert antigaming.crowd_weight(REPORTERS["n1"]) == (policy.UNTRUSTED_WEIGHT, "new account")


def test_low_reputation_weighs_005():
    assert antigaming.crowd_weight(REPORTERS["shady"])[0] == policy.UNTRUSTED_WEIGHT


def test_reputation_raises_weight_up_to_cap():
    assert antigaming.crowd_weight(REPORTERS["u1"])[0] == pytest.approx(0.25)
    assert antigaming.crowd_weight(REPORTERS["trusted"])[0] == pytest.approx(policy.CROWD_CAP)


def test_two_different_new_account_messages_are_not_a_burst():
    ev = [crowd("a", "n1", "16:40", text="metro shut"), crowd("b", "n2", "16:41", text="huge crowd at bkc lift"),
          crowd("c", "n3", "16:42", text="dadar bridge closed")]
    assert antigaming.find_bursts(ev, REPORTERS) == []


def test_burst_needs_reports_within_ten_minutes():
    ev = [crowd("a", "n1", "16:00"), crowd("b", "n2", "16:20"), crowd("c", "n3", "16:40")]
    assert antigaming.find_bursts(ev, REPORTERS) == []


def test_burst_plus_real_support_is_not_coordinated():
    burst = [crowd(f"f{i}", f"n{i}", f"16:4{i}") for i in range(1, 4)]
    r = evaluate("delay", burst + [official("o", "16:45")], REPORTERS, T("16:45"))
    assert r.status == "confirmed"
    assert "coordinated_burst" in r.flags


def test_reputation_update():
    assert antigaming.update_reputation({"reputation": 0.5}, "confirmed")["reputation"] == 0.6
    assert antigaming.update_reputation({"reputation": 0.1}, "contradicted")["reputation"] == 0.0


# ---- Contradiction rules --------------------------------------------------------------------

def test_crowd_running_normally_cannot_cancel_news_backed_event():
    ev = [crowd("a", "u1", "17:05"), crowd("b", "u2", "17:06"), crowd("c", "u3", "17:07"), news("n", "17:12"),
          crowd("ok", "u4", "17:20", text="chalu ho gayi", contradicts=True)]
    r = evaluate("delay", ev, REPORTERS, T("17:20"))
    assert r.contradiction == 0.0
    assert r.status == "confirmed"


def test_official_running_normally_cancels_news_backed_claim():
    ev = [news("n", "17:00"), official("o", "17:05", contradicts=True)]
    r = evaluate("closure", ev, REPORTERS, T("17:05"))
    assert r.status == "ignored"


# ---- Time: future evidence, fading, expiry --------------------------------------------------

def test_future_evidence_is_not_used():
    ev = [crowd("a", "u1", "17:00"), news("n", "17:30")]
    assert evaluate("delay", ev, REPORTERS, T("17:10")).confidence == pytest.approx(0.25)


def test_no_fading_during_grace_period():
    assert decay_factor("delay", policy.DECAY_GRACE_MIN) == 1.0
    assert decay_factor("delay", policy.DECAY_GRACE_MIN + 60) == pytest.approx(0.368, abs=0.001)


def test_mega_block_never_fades():
    assert decay_factor("mega_block", 10_000) == 1.0


def test_delay_expires_45_min_after_last_evidence():
    ev = [official("o", "17:00")]
    at_45 = evaluate("delay", ev, REPORTERS, T("17:45"))
    assert at_45.status == "possible"            # faded (0.8 × e^-0.5 ≈ 0.49) but still alive
    assert at_45.expires_at == T("17:45")
    assert evaluate("delay", ev, REPORTERS, T("17:46")).status == "expired"


def test_weather_prior_alone_is_not_an_event():
    r = evaluate("waterlogging", [weather("w", "15:30")], REPORTERS, T("17:00"))
    assert r.status == "ignored" and r.confidence == 0.0


def test_weather_is_ignored_for_non_waterlogging_types():
    ev = [weather("w", "15:30"), crowd("a", "u1", "17:00")]
    assert evaluate("delay", ev, REPORTERS, T("17:00")).confidence == pytest.approx(0.25)


@pytest.mark.parametrize("value,expected", [(0.7, "confirmed"), (0.699, "possible"), (0.4, "possible"), (0.399, "ignored")])
def test_thresholds(value, expected):
    assert status_for(value) == expected
