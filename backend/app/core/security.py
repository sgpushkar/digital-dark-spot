"""SSRF protection and untrusted-content handling."""
import asyncio
import ipaddress
import re
import socket
from collections.abc import Callable
from urllib.parse import urlparse, urlunparse

ALLOWED_SCHEMES = {"http", "https"}
BLOCKED_HOSTNAMES = {
    "localhost",
    "localhost.localdomain",
    "metadata.google.internal",
    "metadata",
    "instance-data",
}
BLOCKED_SUFFIXES = (".local", ".internal", ".localhost", ".lan", ".home.arpa")


class UnsafeURLError(ValueError):
    """Raised when a URL is malformed or points at a non-public destination."""


Resolver = Callable[[str], list[str]]


def default_resolver(host: str) -> list[str]:
    infos = socket.getaddrinfo(host, None, type=socket.SOCK_STREAM)
    return sorted({info[4][0] for info in infos})


def is_public_ip(ip_str: str) -> bool:
    try:
        ip = ipaddress.ip_address(ip_str.split("%")[0])
    except ValueError:
        return False
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
        ip = ip.ipv4_mapped
    return bool(ip.is_global) and not (
        ip.is_multicast or ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved
    )


def normalize_url(url: str) -> str:
    """Syntactic validation + normalisation (lowercase host, strip fragment, default path)."""
    if not isinstance(url, str) or not url.strip():
        raise UnsafeURLError("URL is empty")
    url = url.strip()
    if len(url) > 2048:
        raise UnsafeURLError("URL is too long")
    parsed = urlparse(url)
    if parsed.scheme.lower() not in ALLOWED_SCHEMES:
        raise UnsafeURLError("Only http and https URLs are allowed")
    if not parsed.hostname:
        raise UnsafeURLError("URL has no host")
    if parsed.username or parsed.password:
        raise UnsafeURLError("URLs with embedded credentials are not allowed")
    try:
        port = parsed.port
    except ValueError as exc:
        raise UnsafeURLError("Invalid port") from exc
    host = parsed.hostname.lower().rstrip(".")
    netloc = host if port is None else f"{host}:{port}"
    if ":" in host:  # IPv6 literal
        netloc = f"[{host}]" + (f":{port}" if port else "")
    path = parsed.path or "/"
    return urlunparse((parsed.scheme.lower(), netloc, path, "", parsed.query, ""))


def _check_hostname_literal(host: str) -> None:
    if host in BLOCKED_HOSTNAMES or host.endswith(BLOCKED_SUFFIXES):
        raise UnsafeURLError(f"Host '{host}' is not allowed")
    # decimal/hex/octal IPv4 tricks such as http://2130706433/ or http://0x7f000001/
    if re.fullmatch(r"(0x[0-9a-f]+|\d+)", host):
        raise UnsafeURLError("Numeric host encodings are not allowed")
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return
    if not is_public_ip(str(ip)):
        raise UnsafeURLError("Private, loopback or reserved IP addresses are not allowed")


async def assert_public_url(
    url: str, *, allow_private: bool = False, resolver: Resolver | None = None
) -> str:
    """Validate a URL for fetching. Resolves DNS and rejects any non-public answer.
    Call this on the initial URL AND on every redirect target."""
    normalized = normalize_url(url)
    if allow_private:
        return normalized
    host = urlparse(normalized).hostname or ""
    _check_hostname_literal(host)
    resolve = resolver or default_resolver
    try:
        addresses = await asyncio.to_thread(resolve, host)
    except (socket.gaierror, OSError) as exc:
        raise UnsafeURLError(f"Host '{host}' could not be resolved") from exc
    if not addresses:
        raise UnsafeURLError(f"Host '{host}' did not resolve")
    for address in addresses:
        if not is_public_ip(address):
            raise UnsafeURLError(f"Host '{host}' resolves to a non-public address")
    return normalized


# ---- untrusted content / prompt injection hygiene --------------------------------------

_CTRL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
UNTRUSTED_OPEN = "<<<UNTRUSTED_SOURCE_TEXT"
UNTRUSTED_CLOSE = "UNTRUSTED_SOURCE_TEXT>>>"
_INJECTION_HINTS = re.compile(
    r"(ignore (all |any )?(previous|prior|above) (instructions|prompts)|disregard (the )?(system|previous)|"
    r"you are now|new instructions:|system prompt|act as (an? )?(?!student)|reveal your (prompt|instructions))",
    re.I,
)


def clean_text(text: str) -> str:
    return _CTRL.sub("", text)


def wrap_untrusted(text: str) -> str:
    """Wrap retrieved content so a model can be told it is data, never instructions.
    Delimiter tokens inside the content are defused so the wrapper cannot be closed early."""
    safe = clean_text(text).replace(UNTRUSTED_OPEN, "[delimiter-removed]").replace(
        UNTRUSTED_CLOSE, "[delimiter-removed]"
    )
    return f"{UNTRUSTED_OPEN}\n{safe}\n{UNTRUSTED_CLOSE}"


def detect_injection_markers(text: str) -> list[str]:
    """Heuristic only: flags instruction-like phrases so they can be surfaced to the user.
    It never *removes* content and is not a guarantee against prompt injection."""
    return sorted({m.group(0).lower() for m in _INJECTION_HINTS.finditer(text)})
