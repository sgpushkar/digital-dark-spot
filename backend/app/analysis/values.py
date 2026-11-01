"""Deterministic value parsing and comparison: dates, money, numbers, academic periods, scope tags.
Everything here is rule-based so conflict decisions on structured values are reproducible."""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date

MONTHS = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "sept": 9, "oct": 10, "nov": 11, "dec": 12,
}
_MONTH_NAMES = (
    r"(?:january|february|march|april|may|june|july|august|september|october|november|december|"
    r"jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)"
)
_DMY = re.compile(rf"\b(\d{{1,2}})(?:st|nd|rd|th)?\s+(?:of\s+)?({_MONTH_NAMES})\.?,?\s+(\d{{4}})\b", re.I)
_MDY = re.compile(rf"\b({_MONTH_NAMES})\.?\s+(\d{{1,2}})(?:st|nd|rd|th)?,?\s+(\d{{4}})\b", re.I)
_ISO = re.compile(r"\b(\d{4})-(\d{2})-(\d{2})\b")


@dataclass(frozen=True)
class ParsedDate:
    value: date
    start: int
    end: int
    raw: str


def _mk(year: int, month: int, day: int) -> date | None:
    try:
        return date(year, month, day)
    except ValueError:
        return None


def find_dates(text: str) -> list[ParsedDate]:
    found: list[ParsedDate] = []
    taken: list[tuple[int, int]] = []

    def add(m: re.Match, d: date | None) -> None:
        if d is None:
            return
        if any(s < m.end() and m.start() < e for s, e in taken):
            return
        taken.append((m.start(), m.end()))
        found.append(ParsedDate(d, m.start(), m.end(), m.group(0)))

    for m in _DMY.finditer(text):
        add(m, _mk(int(m.group(3)), MONTHS[m.group(2).lower()[:4].rstrip("t") if m.group(2).lower().startswith("sept") else m.group(2).lower()[:3]], int(m.group(1))))
    for m in _MDY.finditer(text):
        add(m, _mk(int(m.group(3)), MONTHS[m.group(1).lower()[:3]], int(m.group(2))))
    for m in _ISO.finditer(text):
        add(m, _mk(int(m.group(1)), int(m.group(2)), int(m.group(3))))
    return sorted(found, key=lambda p: p.start)


def parse_loose_date(value: str | None) -> date | None:
    """Parse metadata dates (ISO 8601 date/datetime strings, HTTP-date) without inventing anything."""
    if not value:
        return None
    value = value.strip()
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", value)
    if m:
        return _mk(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    dates = find_dates(value)
    if dates:
        return dates[0].value
    from email.utils import parsedate_to_datetime

    try:
        return parsedate_to_datetime(value).date()
    except (TypeError, ValueError, IndexError):
        return None


# ---- money -------------------------------------------------------------------------------
_CUR = {
    "₹": "INR", "rs": "INR", "rs.": "INR", "inr": "INR", "rupees": "INR", "rupee": "INR",
    "$": "USD", "usd": "USD", "dollars": "USD", "dollar": "USD",
    "€": "EUR", "eur": "EUR", "euros": "EUR", "£": "GBP", "gbp": "GBP",
}
_MULT = {"k": 1e3, "thousand": 1e3, "lakh": 1e5, "lakhs": 1e5, "lac": 1e5, "lacs": 1e5, "m": 1e6, "million": 1e6}
_MONEY_PRE = re.compile(
    r"(?P<cur>₹|\brs\.?|\binr\b|\$|\busd\b|€|\beur\b|£|\bgbp\b)\s?(?P<amt>\d[\d,]*(?:\.\d+)?)\s?"
    r"(?P<mult>lakhs?|lacs?|thousand|million|k\b|m\b)?",
    re.I,
)
_MONEY_POST = re.compile(
    r"(?P<amt>\d[\d,]*(?:\.\d+)?)\s?(?P<mult>lakhs?|lacs?|thousand|million|k\b|m\b)?\s?"
    r"(?P<cur>\binr\b|\busd\b|\beur\b|\bgbp\b|rupees?|dollars?|euros?)",
    re.I,
)


@dataclass(frozen=True)
class Money:
    amount: float
    currency: str
    raw: str


def find_money(text: str) -> list[Money]:
    out: list[Money] = []
    spans: list[tuple[int, int]] = []
    for pat in (_MONEY_PRE, _MONEY_POST):
        for m in pat.finditer(text):
            if any(s < m.end() and m.start() < e for s, e in spans):
                continue
            amount = float(m.group("amt").replace(",", ""))
            mult = (m.group("mult") or "").lower()
            amount *= _MULT.get(mult, 1)
            cur = _CUR.get(m.group("cur").lower().strip(), m.group("cur").upper())
            spans.append((m.start(), m.end()))
            out.append(Money(amount, cur, m.group(0).strip()))
    return out


# ---- academic periods ------------------------------------------------------------------
_PERIOD = re.compile(r"\b(20\d{2})\s*[-–—/]\s*(?:20)?(\d{2})\b")
_YEAR = re.compile(r"\b(20\d{2})\b")


def normalize_period(start_year: int, end_two_digit: int | str) -> str:
    return f"{start_year}-{int(end_two_digit):02d}"


def find_periods(text: str) -> list[str]:
    """Academic years / application cycles such as 2026-27, 2026/2027, 2026–27."""
    out: list[str] = []
    for m in _PERIOD.finditer(text):
        start, end2 = int(m.group(1)), int(m.group(2))
        if (start + 1) % 100 == end2:
            out.append(normalize_period(start, end2))
    return out


def period_start_year(period: str) -> int:
    return int(period.split("-")[0])


def find_years(text: str) -> list[int]:
    return [int(y) for y in _YEAR.findall(text)]


# ---- scope tags (context that can legitimately explain differing values) -------------
SCOPE_PATTERNS: dict[str, re.Pattern] = {
    "undergraduate": re.compile(r"\b(undergraduate|bachelor'?s?|b\.?tech|ug)\b", re.I),
    "postgraduate": re.compile(r"\b(postgraduate|post-graduate|master'?s?|m\.?tech|pg)\b", re.I),
    "doctoral": re.compile(r"\b(ph\.?d|doctoral|doctorate)\b", re.I),
    "international": re.compile(r"\b(international|overseas|non-resident|foreign)\b", re.I),
    "domestic": re.compile(r"\b(domestic|resident students?|citizens? only)\b", re.I),
    "first_year": re.compile(r"\b(first[- ]year|freshers?|year 1)\b", re.I),
    "continuing": re.compile(r"\b(continuing|returning|renewal)\b", re.I),
    "per_semester": re.compile(r"\b(per semester|each semester)\b", re.I),
    "per_year": re.compile(r"\b(per (academic )?year|annually|each year|a year)\b", re.I),
    "total": re.compile(r"\b(in total|total (value|award)|over the (course|duration))\b", re.I),
    "early_round": re.compile(r"\b(early (round|decision|application)|priority deadline)\b", re.I),
    "late_round": re.compile(r"\b(late (round|application)|final (round|deadline)|extended)\b", re.I),
}


def find_scope_tags(text: str) -> list[str]:
    return sorted(tag for tag, pat in SCOPE_PATTERNS.items() if pat.search(text))


# ---- normalised value + comparison ---------------------------------------------------
@dataclass
class NormalizedValue:
    type: str  # date | money | number | text
    value: object  # iso str | {"amount","currency"} | float | str
    display: str

    def to_dict(self) -> dict:
        return {"type": self.type, "value": self.value, "display": self.display}


_NUM = re.compile(r"(?<![\w.])(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?\s?(%|percent|gpa|cgpa)?", re.I)


def find_numbers(text: str) -> list[tuple[float, str]]:
    out = []
    for m in _NUM.finditer(text):
        whole = m.group(1).replace(",", "")
        val = float(whole + ("." + m.group(2) if m.group(2) else ""))
        out.append((val, m.group(0).strip()))
    return out


def normalize_value(text: str, value_type: str) -> NormalizedValue:
    if value_type == "date":
        dates = find_dates(text)
        if dates:
            d = dates[0]
            return NormalizedValue("date", d.value.isoformat(), d.raw)
    if value_type == "money":
        money = find_money(text)
        if money:
            m = money[0]
            return NormalizedValue("money", {"amount": m.amount, "currency": m.currency}, m.raw)
    if value_type == "number":
        nums = find_numbers(text)
        if nums:
            return NormalizedValue("number", nums[0][0], nums[0][1])
    return NormalizedValue("text", " ".join(text.split()).lower(), text.strip())


@dataclass
class ValueComparison:
    comparable: bool
    differs: bool
    reason: str


def compare_values(a: NormalizedValue, b: NormalizedValue, money_tolerance: float = 0.005) -> ValueComparison:
    if a.type != b.type:
        return ValueComparison(False, False, f"values have different types ({a.type} vs {b.type})")
    if a.type == "date":
        same = a.value == b.value
        return ValueComparison(True, not same, "dates are identical" if same else f"{a.display} ≠ {b.display}")
    if a.type == "money":
        av, bv = a.value, b.value  # type: ignore[assignment]
        if av["currency"] != bv["currency"]:  # type: ignore[index]
            return ValueComparison(False, False, "amounts use different currencies; not directly comparable")
        hi = max(av["amount"], bv["amount"])  # type: ignore[index]
        diff = abs(av["amount"] - bv["amount"]) / hi if hi else 0.0  # type: ignore[index]
        differs = diff > money_tolerance
        return ValueComparison(True, differs, f"{a.display} vs {b.display}" if differs else "amounts match")
    if a.type == "number":
        differs = abs(float(a.value) - float(b.value)) > 1e-9  # type: ignore[arg-type]
        return ValueComparison(True, differs, f"{a.display} vs {b.display}" if differs else "numbers match")
    return ValueComparison(False, False, "free-text values need semantic comparison")
