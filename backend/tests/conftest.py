import os

import pytest

os.environ.setdefault("LLM_PROVIDER", "none")

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import Settings
from app.db.base import Base
from app.retrieval.embeddings import HashEmbedder
from app.services.demo import demo_html_map
from app.services.events import EventBus
from app.services.pipeline import Ctx


@pytest.fixture
async def maker(tmp_path):
    """SQLite by default; set TEST_DATABASE_URL=postgresql+asyncpg://... to run the same suite on PostgreSQL + pgvector."""
    url = os.environ.get("TEST_DATABASE_URL") or f"sqlite+aiosqlite:///{tmp_path}/t.db"
    engine = create_async_engine(url)
    async with engine.begin() as conn:
        if url.startswith("postgresql"):
            await conn.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS vector")
            await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield async_sessionmaker(engine, expire_on_commit=False)
    await engine.dispose()


@pytest.fixture
def ctx_factory(maker):
    def make(**kw):
        return Ctx(settings=Settings(respect_robots=False, fetch_retries=0), maker=maker, bus=EventBus(), embedder=HashEmbedder(384),
                   demo_html=demo_html_map(), **kw)
    return make
