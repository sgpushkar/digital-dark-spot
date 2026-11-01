"""Progress events for live pipeline updates. In-process pub/sub with replay so late WebSocket
clients still see the stage history. Optionally mirrors job state to Redis (failures never block)."""
import asyncio
import json
import logging
from collections import defaultdict, deque
from datetime import datetime, timezone

log = logging.getLogger("dds.events")


class EventBus:
    def __init__(self, history: int = 300, redis_url: str | None = None):
        self._subs: dict[str, set[asyncio.Queue]] = defaultdict(set)
        self._hist: dict[str, deque] = defaultdict(lambda: deque(maxlen=history))
        self._redis_url = redis_url
        self._redis = None

    async def publish(self, session_id: str, event: dict) -> None:
        event = {**event, "ts": datetime.now(timezone.utc).isoformat(), "session_id": session_id}
        self._hist[session_id].append(event)
        for q in list(self._subs[session_id]):
            q.put_nowait(event)
        await self._mirror(session_id, event)

    def replay(self, session_id: str) -> list[dict]:
        return list(self._hist[session_id])

    def subscribe(self, session_id: str) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue()
        self._subs[session_id].add(q)
        return q

    def unsubscribe(self, session_id: str, q: asyncio.Queue) -> None:
        self._subs[session_id].discard(q)

    def clear(self, session_id: str) -> None:
        self._hist[session_id].clear()

    async def _mirror(self, session_id: str, event: dict) -> None:
        if not self._redis_url or event.get("type") != "stage":
            return
        try:
            if self._redis is None:
                import redis.asyncio as aioredis

                self._redis = aioredis.from_url(self._redis_url, socket_timeout=1)
            await self._redis.hset(f"dds:job:{session_id}", event["stage"], json.dumps({"status": event["status"], "ts": event["ts"]}))
            await self._redis.expire(f"dds:job:{session_id}", 86400)
        except Exception as exc:  # noqa: BLE001 - Redis is optional infrastructure
            log.warning("redis mirror disabled: %s", type(exc).__name__)
            self._redis_url = None


bus = EventBus()
