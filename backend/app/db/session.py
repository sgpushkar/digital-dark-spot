from collections.abc import AsyncIterator

from fastapi import Request

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from app.config import get_settings
from app.db.base import Base

_engine: AsyncEngine | None = None
_maker: async_sessionmaker[AsyncSession] | None = None


def make_engine(url: str | None = None) -> AsyncEngine:
    url = url or get_settings().database_url
    kwargs: dict = {"pool_pre_ping": True}
    if url.startswith("sqlite"):
        kwargs = {}
    return create_async_engine(url, **kwargs)


def init_engine(url: str | None = None) -> None:
    global _engine, _maker
    _engine = make_engine(url)
    _maker = async_sessionmaker(_engine, expire_on_commit=False)


def get_maker() -> async_sessionmaker[AsyncSession]:
    if _maker is None:
        init_engine()
    assert _maker is not None
    return _maker


def get_engine() -> AsyncEngine:
    if _engine is None:
        init_engine()
    assert _engine is not None
    return _engine


async def get_db(request: Request) -> AsyncIterator[AsyncSession]:
    # the app context owns the session factory, so tests and prod share one wiring path
    async with request.app.state.ctx.maker() as session:
        yield session


async def create_all() -> None:
    """Dev/test convenience. Production uses Alembic migrations."""
    engine = get_engine()
    async with engine.begin() as conn:
        if engine.dialect.name == "postgresql":
            from sqlalchemy import text

            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        await conn.run_sync(Base.metadata.create_all)
