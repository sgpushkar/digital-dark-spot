from datetime import date

from app.analysis.values import (
    compare_values,
    find_dates,
    find_money,
    find_periods,
    find_scope_tags,
    normalize_value,
    parse_loose_date,
)


def test_find_dates_multiple_formats():
    text = "Closes on 10 November 2026; results on March 5, 2027; archived 2025-01-31."
    got = [d.value for d in find_dates(text)]
    assert date(2026, 11, 10) in got and date(2027, 3, 5) in got and date(2025, 1, 31) in got


def test_find_dates_ordinals_and_sept():
    assert find_dates("by 3rd Sept 2026")[0].value == date(2026, 9, 3)
    assert find_dates("by 1st of December 2026")[0].value == date(2026, 12, 1)


def test_invalid_dates_ignored():
    assert find_dates("31 February 2026") == []


def test_parse_loose_date():
    assert parse_loose_date("2026-08-01T10:00:00+05:30") == date(2026, 8, 1)
    assert parse_loose_date("Tue, 14 Oct 2025 08:00:00 GMT") == date(2025, 10, 14)
    assert parse_loose_date("nonsense") is None
    assert parse_loose_date(None) is None


def test_money_forms():
    assert find_money("award of ₹1,50,000 per year")[0].currency == "INR"
    assert find_money("up to $12,000")[0].amount == 12000
    assert find_money("worth 1.5 lakh INR")[0].amount == 150000
    assert find_money("no money here") == []


def test_periods():
    assert find_periods("for the 2024-2025 academic year") == ["2024-25"]
    assert find_periods("AY 2026–27 cohort") == ["2026-27"]
    assert find_periods("see 2026-31") == []  # not consecutive years


def test_scope_tags():
    tags = find_scope_tags("Award for postgraduate international students, per year")
    assert {"postgraduate", "international", "per_year"} <= set(tags)


def test_compare_dates_conflict_and_match():
    a = normalize_value("10 November 2026", "date")
    b = normalize_value("20 November 2026", "date")
    assert compare_values(a, b).differs
    assert not compare_values(a, normalize_value("November 10, 2026", "date")).differs


def test_compare_money_currency_mismatch_not_comparable():
    a = normalize_value("$5,000", "money")
    b = normalize_value("₹5,000", "money")
    cmp = compare_values(a, b)
    assert not cmp.comparable and not cmp.differs


def test_compare_money_differs():
    cmp = compare_values(normalize_value("₹50,000", "money"), normalize_value("₹75,000", "money"))
    assert cmp.comparable and cmp.differs


def test_text_is_not_deterministically_comparable():
    cmp = compare_values(normalize_value("must be a citizen", "text"), normalize_value("must be a resident", "text"))
    assert not cmp.comparable
