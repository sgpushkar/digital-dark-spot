"""PDF extraction. Docling is used when installed and requested; pypdf is the dependable default."""
import io
import re
from datetime import date

from app.core.security import clean_text
from app.ingestion.types import ExtractedDocument, ExtractionError, Span


def _pdf_date(value) -> date | None:
    if value is None:
        return None
    if hasattr(value, "date"):
        try:
            return value.date()
        except Exception:  # noqa: BLE001
            return None
    m = re.search(r"(\d{4})(\d{2})(\d{2})", str(value))
    if m:
        try:
            return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        except ValueError:
            return None
    return None


def extract_pdf_pypdf(data: bytes, *, max_pages: int = 300) -> ExtractedDocument:
    from pypdf import PdfReader
    from pypdf.errors import PdfReadError

    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            raise ExtractionError("PDF is encrypted")
        n_pages = len(reader.pages)
    except ExtractionError:
        raise
    except (PdfReadError, ValueError, KeyError, OSError) as exc:
        raise ExtractionError(f"Could not read PDF: {exc}") from exc
    if n_pages > max_pages:
        raise ExtractionError(f"PDF has {n_pages} pages; the limit is {max_pages}")

    parts: list[str] = []
    pages: list[Span] = []
    pos = 0
    for idx, page in enumerate(reader.pages, start=1):
        try:
            text = clean_text(page.extract_text() or "")
        except Exception:  # noqa: BLE001 - one bad page must not kill the document
            text = ""
        text = "\n".join(" ".join(line.split()) for line in text.splitlines() if line.strip())
        if not text:
            continue
        pages.append(Span(idx, pos, pos + len(text)))
        parts.append(text)
        pos += len(text) + 2
    body = "\n\n".join(parts)
    if not body.strip():
        raise ExtractionError("No extractable text (scanned PDF? OCR is not enabled)")

    meta = reader.metadata
    title = (str(meta.title).strip() if meta and meta.title else None) or None
    created = _pdf_date(getattr(meta, "creation_date", None)) if meta else None
    modified = _pdf_date(getattr(meta, "modification_date", None)) if meta else None
    origins: dict[str, str] = {}
    warnings: list[str] = []
    if created:
        origins["publication_date"] = "pdf-metadata:CreationDate"
        warnings.append("PDF creation date is file metadata and may not equal the publication date")
    if modified:
        origins["modified_date"] = "pdf-metadata:ModDate"
    return ExtractedDocument(
        title=title, text=body, pages=pages, publication_date=created, modified_date=modified,
        date_origins=origins, extractor="pdf:pypdf", warnings=warnings,
    )


def extract_pdf(data: bytes, *, backend: str = "auto", max_pages: int = 300) -> ExtractedDocument:
    if backend in ("auto", "docling"):
        try:
            return _extract_docling(data)
        except ImportError:
            if backend == "docling":
                raise ExtractionError("PDF backend 'docling' requested but docling is not installed") from None
        except ExtractionError:
            raise
        except Exception:  # noqa: BLE001 - fall back to pypdf rather than fail the source
            pass
    return extract_pdf_pypdf(data, max_pages=max_pages)


def _extract_docling(data: bytes) -> ExtractedDocument:  # pragma: no cover - optional dependency
    import tempfile

    from docling.document_converter import DocumentConverter  # type: ignore

    with tempfile.NamedTemporaryFile(suffix=".pdf") as fh:
        fh.write(data)
        fh.flush()
        result = DocumentConverter().convert(fh.name)
    text = clean_text(result.document.export_to_text())
    if not text.strip():
        raise ExtractionError("Docling returned no text")
    return ExtractedDocument(title=None, text=text, extractor="pdf:docling")
