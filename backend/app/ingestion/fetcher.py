"""Safe async fetching: SSRF checks on every hop, manual redirects, byte caps, timeouts, bounded retries."""
import asyncio
import hashlib
import logging
from dataclasses import dataclass, field
from urllib.parse import urljoin, urlparse
from urllib.robotparser import RobotFileParser

import httpx

from app.config import Settings
from app.core.security import Resolver, UnsafeURLError, assert_public_url

log = logging.getLogger("dds.fetch")


class FetchError(Exception):
    pass


@dataclass
class FetchResult:
    url: str
    final_url: str
    status_code: int
    content_type: str
    body: bytes
    headers: dict[str, str] = field(default_factory=dict)
    redirects: list[str] = field(default_factory=list)

    @property
    def sha256(self) -> str:
        return hashlib.sha256(self.body).hexdigest()


ALLOWED_TYPES = ("text/html", "application/xhtml+xml", "application/pdf", "text/plain")


async def _robots_allows(client: httpx.AsyncClient, url: str, settings: Settings, resolver: Resolver | None) -> bool:
    p = urlparse(url)
    robots_url = f"{p.scheme}://{p.netloc}/robots.txt"
    try:
        await assert_public_url(robots_url, allow_private=settings.allow_private_urls, resolver=resolver)
        resp = await client.get(robots_url, timeout=5.0, headers={"User-Agent": settings.user_agent})
        if resp.status_code != 200:
            return True  # no robots.txt => crawling permitted
        rp = RobotFileParser()
        rp.parse(resp.text.splitlines())
        return rp.can_fetch(settings.user_agent, url)
    except (httpx.HTTPError, UnsafeURLError):
        return True  # robots unreachable: do not block, SSRF guard still applies to the page itself


async def fetch_url(
    url: str,
    settings: Settings,
    *,
    client: httpx.AsyncClient | None = None,
    resolver: Resolver | None = None,
) -> FetchResult:
    own_client = client is None
    client = client or httpx.AsyncClient(follow_redirects=False, timeout=settings.fetch_timeout_s)
    try:
        last_exc: Exception | None = None
        for attempt in range(settings.fetch_retries + 1):
            try:
                return await _fetch_once(url, settings, client, resolver)
            except (httpx.TimeoutException, httpx.TransportError) as exc:
                last_exc = exc
                log.warning("fetch attempt %s failed for %s: %s", attempt + 1, url, type(exc).__name__)
                await asyncio.sleep(0.2 * (attempt + 1))
        raise FetchError(f"Network error after {settings.fetch_retries + 1} attempts: {type(last_exc).__name__}")
    finally:
        if own_client:
            await client.aclose()


async def _fetch_once(url: str, settings: Settings, client: httpx.AsyncClient, resolver: Resolver | None) -> FetchResult:
    current = await assert_public_url(url, allow_private=settings.allow_private_urls, resolver=resolver)
    if settings.respect_robots and not await _robots_allows(client, current, settings, resolver):
        raise FetchError("Blocked by robots.txt")
    redirects: list[str] = []
    for _ in range(settings.fetch_max_redirects + 1):
        async with client.stream(
            "GET", current, headers={"User-Agent": settings.user_agent, "Accept": "text/html,application/pdf;q=0.9,*/*;q=0.1"},
            timeout=settings.fetch_timeout_s,
        ) as resp:
            if resp.status_code in (301, 302, 303, 307, 308):
                location = resp.headers.get("location")
                if not location:
                    raise FetchError("Redirect without Location header")
                nxt = urljoin(current, location)
                current = await assert_public_url(nxt, allow_private=settings.allow_private_urls, resolver=resolver)
                redirects.append(current)
                continue
            if resp.status_code >= 400:
                raise FetchError(f"HTTP {resp.status_code}")
            ctype = resp.headers.get("content-type", "").split(";")[0].strip().lower()
            if ctype and not any(ctype.startswith(t) for t in ALLOWED_TYPES):
                raise FetchError(f"Unsupported content type '{ctype}'")
            declared = resp.headers.get("content-length")
            if declared and declared.isdigit() and int(declared) > settings.fetch_max_bytes:
                raise FetchError("Response too large")
            body = bytearray()
            async for part in resp.aiter_bytes():
                body.extend(part)
                if len(body) > settings.fetch_max_bytes:
                    raise FetchError("Response too large")
            return FetchResult(
                url=url, final_url=current, status_code=resp.status_code, content_type=ctype or "text/html",
                body=bytes(body), headers={k.lower(): v for k, v in resp.headers.items()}, redirects=redirects,
            )
    raise FetchError(f"Too many redirects (>{settings.fetch_max_redirects})")
