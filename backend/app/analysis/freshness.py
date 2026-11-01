"""Rule-based freshness. The retrieval timestamp is NEVER used as a publication date, and no date is invented.
Each label comes with the reasons and the evidence that produced it."""
from __future__ import annotations

import re
from datetime import date

from app.analysis.claims import split_sentences
from app.analysis.values import find_dates, find_periods, find_years, period_start_year
from app.schemas.domain import FreshnessAssessment, SourceDoc

_DEADLINE_CUES = re.compile(r"\b(deadline|close[sd]?|closing|due|last date|expires?|valid until|apply by|apply before)\b", re.I)


def determine_target_period(question: str, objective: str | None, as_of: date) -> tuple[str, str]:
    """Which cycle is the user researching? Prefer what they wrote; otherwise infer from the date and say so."""
    text = f"{question} {objective or ''}"
    periods = find_periods(text)
    if periods:
        return max(periods, key=period_start_year), "stated_in_research_goal"
    years = [y for y in find_years(text) if as_of.year - 1 <= y <= as_of.year + 3]
    if years:
        y = max(years)
        return f"{y}-{(y + 1) % 100:02d}", "year_stated_in_research_goal"
    y = as_of.year if as_of.month >= 6 else as_of.year - 1
    return f"{y}-{(y + 1) % 100:02d}", "inferred_from_current_date"


def assess_freshness(
    source: SourceDoc, *, as_of: date, target_period: str, target_origin: str, max_age_days: int = 548,
) -> FreshnessAssessment:
    text = source.text
    periods = sorted(set(find_periods(text)), key=period_start_year)
    latest_period = periods[-1] if periods else None
    target_year = period_start_year(target_period)

    deadline_dates: list[tuple[date, str]] = []
    for sentence, _ in split_sentences(text):
        if _DEADLINE_CUES.search(sentence):
            for d in find_dates(sentence):
                deadline_dates.append((d.value, sentence))
    meta_dates = [d for d in (source.modified_date, source.publication_date) if d]
    meta_used = max(meta_dates) if meta_dates else None

    def build(label, reasons, quote=None):
        return FreshnessAssessment(
            source_ref=source.ref, label=label, reasons=reasons, periods_found=periods,
            deadline_dates=sorted({d.isoformat() for d, _ in deadline_dates}),
            metadata_date_used=meta_used.isoformat() if meta_used else None,
            target_period=target_period, target_period_origin=target_origin, evidence_quote=quote,
        )

    if latest_period and period_start_year(latest_period) < target_year:
        quote = next((s for s, _ in split_sentences(text) if latest_period.split("-")[0] in s), None)
        return build("POTENTIALLY_OUTDATED", [
            f"Refers to the {latest_period} cycle, while the research targets {target_period} ({target_origin.replace('_', ' ')}).",
            "Older information is not necessarily wrong, but it may not apply to the current cycle.",
        ], quote)

    if deadline_dates and all(d < as_of for d, _ in deadline_dates):
        latest = max(deadline_dates, key=lambda t: t[0])
        return build("EXPIRED", [
            f"The latest deadline/expiry date stated in the page ({latest[0].isoformat()}) is before {as_of.isoformat()}.",
        ], latest[1])

    if latest_period and period_start_year(latest_period) >= target_year:
        reasons = [f"Refers to the {latest_period} cycle, which matches the research target {target_period}."]
        if not meta_used:
            reasons.append("No publication or modification date is available, so currency rests on the in-text period only.")
        return build("CURRENT", reasons)

    if meta_used:
        age = (as_of - meta_used).days
        if age > max_age_days:
            return build("POTENTIALLY_OUTDATED", [f"Latest available metadata date is {meta_used.isoformat()} ({age} days before {as_of.isoformat()}), beyond the {max_age_days}-day threshold."])
        return build("CURRENT", [f"Metadata date {meta_used.isoformat()} is within {max_age_days} days of {as_of.isoformat()}. A metadata date shows last update, not that every statement is current."])

    years = find_years(text)
    if years:
        latest_year = max(years)
        if latest_year < target_year:
            return build("POTENTIALLY_OUTDATED", [f"Latest year mentioned is {latest_year}; the research targets {target_period}. No publication date available."])
        return build("UNDATED", [f"Mentions {latest_year} but provides no publication or modification date, so when it was written cannot be established."])
    return build("DATE_UNAVAILABLE", ["No publication date, modification date, or in-text period/year could be found. Freshness cannot be established."])
