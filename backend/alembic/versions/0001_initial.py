"""initial schema: sessions, sources, chunks (pgvector), claims, findings, tasks, pipeline state

Revision ID: 0001
Revises:
"""
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    is_pg = bind.dialect.name == "postgresql"
    if is_pg:
        op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    from app.db.base import Base
    from app.db import models  # noqa: F401

    Base.metadata.create_all(bind)

    if is_pg:
        # Retrieval indexes: ANN index for pgvector cosine search + GIN full-text index for keyword search.
        op.execute("CREATE INDEX IF NOT EXISTS ix_chunks_embedding_hnsw ON source_chunks USING hnsw (embedding vector_cosine_ops)")
        op.execute("CREATE INDEX IF NOT EXISTS ix_chunks_fts ON source_chunks USING gin (to_tsvector('english', content))")


def downgrade() -> None:
    from app.db.base import Base
    from app.db import models  # noqa: F401

    Base.metadata.drop_all(op.get_bind())
