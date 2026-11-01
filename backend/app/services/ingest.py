"""Creating sources (URLs, uploads, demo fixtures), persisting extracted text and chunks."""
from __future__ import annotations

import hashlib
import mimetypes
from datetime import datetime, timezone
from urllib.parse import urlparse

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.core.security import Resolver, UnsafeURLError, assert_public_url, clean_text
from app.db.models import Source, SourceChunk
from app.ingestion.chunking import chunk_document
from app.ingestion.html import extract_html
from app.ingestion.pdf import extract_pdf
from app.ingestion.types import ExtractedDocument, ExtractionError

SOURCE_TYPES = {"official_source", "academic", "government", "institution", "organization", "news", "blog",
                "forum", "document", "unknown"}


def classify_source_type(host: str | None, hint: str | None = None) -> str:
    if hint and hint in SOURCE_TYPES:
        return hint
    h = (host or "").lower()
    if h.endswith((".gov", ".gov.in", ".nic.in", ".gov.uk", ".mil")) or ".gov." in h:
        return "government"
    if h.endswith((".edu", ".ac.in", ".ac.uk", ".edu.au")) or ".edu." in h or ".ac." in h:
        return "academic"
    return "unknown"


async def next_ref(db: AsyncSession, model, session_id: str, prefix: str) -> str:
    n = (await db.execute(select(func.count()).select_from(model).where(model.research_session_id == session_id))).scalar_one()
    return f"{prefix}_{n + 1:03d}"


async def add_url_sources(
    db: AsyncSession, session_id: str, items: list[dict], settings: Settings, resolver: Resolver | None = None,
) -> list[dict]:
    results = []
    existing = {u for (u,) in (await db.execute(select(Source.url).where(Source.research_session_id == session_id))).all()}
    for item in items:
        raw = item["url"]
        try:
            url = await assert_public_url(raw, allow_private=settings.allow_private_urls, resolver=resolver)
        except UnsafeURLError as exc:
            results.append({"url": raw, "status": "rejected", "reason": str(exc)})
            continue
        if url in existing:
            results.append({"url": url, "status": "duplicate", "reason": "URL already added to this session"})
            continue
        host = urlparse(url).hostname
        ref = await next_ref(db, Source, session_id, "source")
        db.add(Source(research_session_id=session_id, ref=ref, url=url, domain=host,
                      source_type=classify_source_type(host, item.get("source_type")), extraction_status="pending"))
        await db.flush()
        existing.add(url)
        results.append({"url": url, "status": "added", "ref": ref})
    await db.commit()
    return results


async def persist_document(
    db: AsyncSession, source: Source, doc: ExtractedDocument, settings: Settings, retrieved_at: datetime | None = None,
) -> int:
    text = clean_text(doc.text)
    doc.text = text
    source.text = text
    source.title = source.title or (doc.title or "")[:500] or None
    source.publication_date = doc.publication_date
    source.modified_date = doc.modified_date
    source.content_hash = hashlib.sha256(text.encode()).hexdigest()
    source.retrieved_at = retrieved_at or datetime.now(timezone.utc)
    source.extraction_status = "done"
    source.error_message = None
    source.extra = {**(source.extra or {}), "date_origins": doc.date_origins, "extractor": doc.extractor, "warnings": doc.warnings}
    for old in list((await db.execute(select(SourceChunk).where(SourceChunk.source_id == source.id))).scalars()):
        await db.delete(old)
    await db.flush()
    chunks = chunk_document(doc, size=settings.chunk_size, overlap=settings.chunk_overlap)
    base = (await db.execute(select(func.count()).select_from(SourceChunk).where(SourceChunk.research_session_id == source.research_session_id))).scalar_one()
    for i, c in enumerate(chunks):
        db.add(SourceChunk(source_id=source.id, research_session_id=source.research_session_id, ref=f"chunk_{base + i + 1:03d}",
                           content=c.content, chunk_index=c.index, char_start=c.start, char_end=c.end,
                           page_number=c.page_number, section_heading=c.section_heading))
    await db.commit()
    return len(chunks)


class UploadError(ValueError):
    pass


async def add_upload(
    db: AsyncSession, session_id: str, filename: str, data: bytes, settings: Settings, source_type: str | None = None,
) -> Source:
    if not data:
        raise UploadError("The uploaded file is empty")
    if len(data) > settings.upload_max_bytes:
        raise UploadError(f"File exceeds the {settings.upload_max_bytes // (1024 * 1024)} MB limit")
    safe = (filename or "upload").replace("\\", "/").split("/")[-1][:120]
    ext = safe.rsplit(".", 1)[-1].lower() if "." in safe else ""
    if data[:5] == b"%PDF-" or ext == "pdf":
        if data[:5] != b"%PDF-":
            raise UploadError("File has a .pdf extension but is not a PDF")
        doc = extract_pdf(data, backend=settings.pdf_backend, max_pages=settings.upload_max_pages)
    elif ext in ("html", "htm"):
        doc = extract_html(data.decode("utf-8", errors="replace"))
    elif ext in ("txt", "md") or (mimetypes.guess_type(safe)[0] or "").startswith("text/"):
        text = data.decode("utf-8", errors="replace")
        doc = ExtractedDocument(title=safe, text=text, extractor="text")
    else:
        raise UploadError("Unsupported file type. Upload a PDF, HTML or plain-text file")
    digest = hashlib.sha256(clean_text(doc.text).encode()).hexdigest()
    dup = (await db.execute(select(Source).where(Source.research_session_id == session_id, Source.content_hash == digest))).scalars().first()
    if dup:
        raise UploadError(f"Duplicate content: identical to {dup.ref}")
    ref = await next_ref(db, Source, session_id, "source")
    src = Source(research_session_id=session_id, ref=ref, url=f"upload://{safe}", domain="uploaded document",
                 source_type=source_type if source_type in SOURCE_TYPES else "document", title=doc.title or safe)
    db.add(src)
    await db.flush()
    try:
        await persist_document(db, src, doc, settings)
    except Exception:
        await db.rollback()
        raise
    return src
