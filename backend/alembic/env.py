import asyncio
import os

from alembic import context
from sqlalchemy.ext.asyncio import create_async_engine

from app.config import get_settings
from app.db import models  # noqa: F401  (registers tables)
from app.db.base import Base

config = context.config
target_metadata = Base.metadata


def _url() -> str:
    return os.environ.get("DATABASE_URL") or get_settings().database_url


def do_run(connection):
    context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
    with context.begin_transaction():
        context.run_migrations()


async def run_async():
    engine = create_async_engine(_url())
    async with engine.connect() as conn:
        await conn.run_sync(do_run)
    await engine.dispose()


if context.is_offline_mode():
    context.configure(url=_url(), target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()
else:
    asyncio.run(run_async())
