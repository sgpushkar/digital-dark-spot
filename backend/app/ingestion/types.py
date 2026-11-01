from dataclasses import dataclass, field
from datetime import date


@dataclass
class Span:
    label: str | int | None
    start: int
    end: int


@dataclass
class ExtractedDocument:
    title: str | None
    text: str
    sections: list[Span] = field(default_factory=list)  # heading spans over `text`
    pages: list[Span] = field(default_factory=list)  # page-number spans over `text`
    publication_date: date | None = None
    modified_date: date | None = None
    date_origins: dict[str, str] = field(default_factory=dict)  # where each date came from
    extractor: str = "unknown"
    warnings: list[str] = field(default_factory=list)


class ExtractionError(Exception):
    pass
