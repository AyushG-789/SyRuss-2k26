from app.verify.antigaming import (
    apply_antigaming,
    crowd_weight,
    find_coordinated_bursts,
)
from app.verify.models import Report, Reporter


def make_report(
    report_id: str,
    reporter_id: str,
    reported_at: str,
    text: str,
    event_id: str = "E_TEST",
) -> Report:
    return Report(
        report_id=report_id,
        reporter_id=reporter_id,
        reported_at=reported_at,
        lat=None,
        lon=None,
        lang="en",
        text=text,
        expected={"event": event_id},
    )


def test_normal_reporter_weight():
    reporter = Reporter(
        reporter_id="u01",
        account_age_days=100,
        reputation=0.5,
    )

    assert crowd_weight(reporter) == 0.25


def test_new_account_gets_low_weight():
    reporter = Reporter(
        reporter_id="n01",
        account_age_days=0,
        reputation=0.5,
    )

    assert crowd_weight(reporter) == 0.05


def test_low_reputation_gets_low_weight():
    reporter = Reporter(
        reporter_id="u19",
        account_age_days=400,
        reputation=0.15,
    )

    assert crowd_weight(reporter) == 0.05


def test_reputation_weight_is_capped():
    reporter = Reporter(
        reporter_id="u99",
        account_age_days=500,
        reputation=1.0,
    )

    assert crowd_weight(reporter) == 0.35


def test_same_reporter_counts_only_highest_weight():
    reporters = {
        "u01": Reporter("u01", 100, 0.5),
    }

    reports = [
        make_report("R01", "u01", "17:00", "Metro delay"),
        make_report("R02", "u01", "17:01", "Metro delay again"),
    ]

    weights, bursts = apply_antigaming(reports, reporters)

    assert weights[("E_TEST", "u01")] == 0.25
    assert bursts == set()


def test_three_new_accounts_form_coordinated_burst():
    reporters = {
        "n01": Reporter("n01", 0, 0.5),
        "n02": Reporter("n02", 0, 0.5),
        "n03": Reporter("n03", 0, 0.5),
    }

    reports = [
        make_report("R01", "n01", "16:40", "Metro 1 completely shut"),
        make_report("R02", "n02", "16:41", "Metro 1 completely shut"),
        make_report("R03", "n03", "16:42", "Metro 1 completely shut"),
    ]

    burst_ids = find_coordinated_bursts(reports, reporters)

    assert burst_ids == {"R01", "R02", "R03"}


def test_two_new_accounts_are_not_a_coordinated_burst():
    reporters = {
        "n01": Reporter("n01", 0, 0.5),
        "n02": Reporter("n02", 0, 0.5),
    }

    reports = [
        make_report("R01", "n01", "16:40", "Metro 1 completely shut"),
        make_report("R02", "n02", "16:41", "Metro 1 completely shut"),
    ]

    burst_ids = find_coordinated_bursts(reports, reporters)

    assert burst_ids == set()