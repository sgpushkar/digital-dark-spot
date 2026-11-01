"""HTML -> clean text + sections + honest metadata. Content is untrusted: scripts, forms, embeds and
hidden elements are dropped, control characters stripped, and nothing is ever executed."""
import json
import re

from bs4 import BeautifulSoup, Tag

from app.analysis.values import parse_loose_date
from app.core.security import clean_text
from app.ingestion.types import ExtractedDocument, ExtractionError, Span

DROP_TAGS = ["script", "style", "noscript", "iframe", "object", "embed", "form", "svg", "canvas", "template"]
CHROME_TAGS = ["nav", "footer", "aside", "header"]
BLOCK_TAGS = ["h1", "h2", "h3", "h4", "h5", "h6", "p", "li", "tr", "blockquote", "pre", "dd", "dt", "figcaption"]
HEADINGS = {"h1", "h2", "h3", "h4"}

PUB_META = ["article:published_time", "og:article:published_time", "datePublished", "date", "dc.date",
            "dc.date.issued", "publishdate", "pubdate", "citation_publication_date"]
MOD_META = ["article:modified_time", "og:updated_time", "dateModified", "last-modified", "dc.date.modified",
            "revised"]


def _meta_lookup(soup: BeautifulSoup) -> dict[str, str]:
    out: dict[str, str] = {}
    for tag in soup.find_all("meta"):
        key = (tag.get("property") or tag.get("name") or tag.get("itemprop") or tag.get("http-equiv") or "").lower()
        content = tag.get("content")
        if key and content:
            out.setdefault(key, content)
    return out


def _jsonld_dates(soup: BeautifulSoup) -> dict[str, str]:
    found: dict[str, str] = {}

    def walk(node):
        if isinstance(node, dict):
            for key in ("datePublished", "dateModified"):
                if isinstance(node.get(key), str):
                    found.setdefault(key, node[key])
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)

    for tag in soup.find_all("script", type="application/ld+json"):
        try:
            walk(json.loads(tag.string or ""))
        except (json.JSONDecodeError, TypeError):
            continue
    return found


def extract_html(html: str, *, http_last_modified: str | None = None) -> ExtractedDocument:
    if not html or not html.strip():
        raise ExtractionError("Empty document")
    soup = BeautifulSoup(html, "lxml")
    meta = _meta_lookup(soup)
    jsonld = _jsonld_dates(soup)  # must be read before scripts are dropped

    pub = mod = None
    origins: dict[str, str] = {}
    for key in PUB_META:
        if key.lower() in meta and (d := parse_loose_date(meta[key.lower()])):
            pub, origins["publication_date"] = d, f"meta:{key}"
            break
    if not pub and "datePublished" in jsonld and (d := parse_loose_date(jsonld["datePublished"])):
        pub, origins["publication_date"] = d, "json-ld:datePublished"
    for key in MOD_META:
        if key.lower() in meta and (d := parse_loose_date(meta[key.lower()])):
            mod, origins["modified_date"] = d, f"meta:{key}"
            break
    if not mod and "dateModified" in jsonld and (d := parse_loose_date(jsonld["dateModified"])):
        mod, origins["modified_date"] = d, "json-ld:dateModified"
    if not mod and http_last_modified and (d := parse_loose_date(http_last_modified)):
        mod, origins["modified_date"] = d, "http:Last-Modified"

    title = None
    for candidate in (meta.get("og:title"), soup.title.string if soup.title and soup.title.string else None):
        if candidate and candidate.strip():
            title = " ".join(candidate.split())
            break

    for tag in soup(DROP_TAGS):
        tag.decompose()
    for tag in soup.find_all(attrs={"hidden": True}) + soup.find_all(attrs={"aria-hidden": "true"}):
        tag.decompose()
    for tag in soup.find_all(style=re.compile(r"display\s*:\s*none", re.I)):
        tag.decompose()
    root = soup.find("main") or soup.find("article") or soup.body or soup
    for tag in root.find_all(CHROME_TAGS):
        tag.decompose()

    parts: list[str] = []
    sections: list[Span] = []
    pos = 0
    current_heading: tuple[str, int] | None = None
    seen_blocks: set[int] = set()

    def close_heading(end: int) -> None:
        nonlocal current_heading
        if current_heading:
            sections.append(Span(current_heading[0], current_heading[1], end))
            current_heading = None

    for el in root.find_all(BLOCK_TAGS):
        if not isinstance(el, Tag) or id(el) in seen_blocks:
            continue
        # skip blocks nested in another block we already take (e.g. <p> in <li>)
        if any(p.name in BLOCK_TAGS and p.name not in HEADINGS for p in el.parents if isinstance(p, Tag)):
            continue
        text = " ".join(clean_text(el.get_text(" ", strip=True)).split())
        if not text:
            continue
        seen_blocks.add(id(el))
        if el.name in HEADINGS:
            close_heading(pos)
            current_heading = (text, pos)
        parts.append(text)
        pos += len(text) + 2  # "\n\n" separator
    close_heading(pos)

    body = "\n\n".join(parts)
    if not body.strip():
        raise ExtractionError("No readable text found (page may require JavaScript rendering)")
    return ExtractedDocument(
        title=title,
        text=body,
        sections=sections,
        publication_date=pub,
        modified_date=mod,
        date_origins=origins,
        extractor="html:bs4",
    )
