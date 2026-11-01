"""Boundary-aware chunking with overlap. Every chunk keeps char offsets, page and section."""
import re
from dataclasses import dataclass

from app.ingestion.types import ExtractedDocument, Span

_SENT_END = re.compile(r"(?<=[.!?])\s+|\n{2,}")


@dataclass
class Chunk:
    index: int
    content: str
    start: int
    end: int
    page_number: int | None
    section_heading: str | None


def _label_at(spans: list[Span], pos: int):
    for s in spans:
        if s.start <= pos < s.end:
            return s.label
    # fall back to the nearest preceding span (text between headings belongs to the last heading)
    prev = [s for s in spans if s.start <= pos]
    return prev[-1].label if prev else None


def chunk_document(doc: ExtractedDocument, *, size: int = 900, overlap: int = 150) -> list[Chunk]:
    if size < 100:
        raise ValueError("chunk size too small")
    if not 0 <= overlap < size // 2:
        raise ValueError("overlap must be >= 0 and < half the chunk size")
    text = doc.text
    n = len(text)
    chunks: list[Chunk] = []
    start = 0
    while start < n:
        hard_end = min(start + size, n)
        end = hard_end
        if hard_end < n:
            window = text[start + size // 2 : hard_end]
            cuts = [m.end() for m in _SENT_END.finditer(window)]
            if cuts:
                end = start + size // 2 + cuts[-1]
        piece = text[start:end]
        stripped = piece.strip()
        if stripped:
            lead = len(piece) - len(piece.lstrip())
            s = start + lead
            chunks.append(
                Chunk(
                    index=len(chunks),
                    content=stripped,
                    start=s,
                    end=s + len(stripped),
                    page_number=_label_at(doc.pages, s) if doc.pages else None,
                    section_heading=_label_at(doc.sections, s) if doc.sections else None,
                )
            )
        if end >= n:
            break
        nxt = end - overlap
        start = nxt if nxt > start else end
    return chunks
