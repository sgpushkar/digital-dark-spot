import time
from collections import defaultdict, deque

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.api.errors import err


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Per-client sliding-window limiter (in-process). Put a gateway/Redis limiter in front for multi-instance deployments."""

    def __init__(self, app, per_minute: int):
        super().__init__(app)
        self.per_minute = per_minute
        self.hits: dict[str, deque] = defaultdict(deque)

    async def dispatch(self, request: Request, call_next):
        if self.per_minute <= 0 or request.url.path in ("/api/health",):
            return await call_next(request)
        key = request.client.host if request.client else "unknown"
        now, q = time.monotonic(), self.hits[key]
        while q and now - q[0] > 60:
            q.popleft()
        if len(q) >= self.per_minute:
            return err(429, "rate_limited", "Too many requests; slow down.")
        q.append(now)
        return await call_next(request)
