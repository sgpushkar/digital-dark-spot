"""Normalized schema. UUID primary keys; stable human-readable `ref` ids (source_001, claim_014...)
are unique per research session and are what evidence references point at."""
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.config import get_settings
from app.db.base import Base, TimestampMixin, UUIDStr, new_id, utcnow
from app.db.types import JSONType, VectorType

EMBED_DIM = get_settings().embedding_dim


class ResearchSession(Base, TimestampMixin):
    __tablename__ = "research_sessions"

    id: Mapped[str] = mapped_column(UUIDStr, primary_key=True, default=new_id)
    title: Mapped[str] = mapped_column(String(300))
    research_question: Mapped[str] = mapped_column(Text)
    research_objective: Mapped[str | None] = mapped_column(Text, nullable=True)
    topic: Mapped[str | None] = mapped_column(String(300), nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="draft", index=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    as_of_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    sources: Mapped[list["Source"]] = relationship(back_populates="session", cascade="all, delete-orphan")


class Source(Base, TimestampMixin):
    __tablename__ = "sources"
    __table_args__ = (
        UniqueConstraint("research_session_id", "ref", name="uq_source_ref"),
        UniqueConstraint("research_session_id", "url", name="uq_source_url"),
        Index("ix_sources_hash", "research_session_id", "content_hash"),
    )

    id: Mapped[str] = mapped_column(UUIDStr, primary_key=True, default=new_id)
    research_session_id: Mapped[str] = mapped_column(
        UUIDStr, ForeignKey("research_sessions.id", ondelete="CASCADE"), index=True
    )
    ref: Mapped[str] = mapped_column(String(30))
    url: Mapped[str] = mapped_column(String(2048))
    domain: Mapped[str | None] = mapped_column(String(255), nullable=True)
    title: Mapped[str | None] = mapped_column(String(500), nullable=True)
    source_type: Mapped[str] = mapped_column(String(40), default="unknown")
    publication_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    modified_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    retrieved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    content_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    extraction_status: Mapped[str] = mapped_column(String(20), default="pending")
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    text: Mapped[str | None] = mapped_column(Text, nullable=True)
    extra: Mapped[dict] = mapped_column(JSONType, default=dict)  # date_origins, extractor, http info

    session: Mapped[ResearchSession] = relationship(back_populates="sources")
    chunks: Mapped[list["SourceChunk"]] = relationship(
        back_populates="source", cascade="all, delete-orphan", order_by="SourceChunk.chunk_index"
    )


class SourceChunk(Base):
    __tablename__ = "source_chunks"
    __table_args__ = (
        UniqueConstraint("source_id", "chunk_index", name="uq_chunk_index"),
        Index("ix_chunks_session_ref", "research_session_id", "ref"),
    )

    id: Mapped[str] = mapped_column(UUIDStr, primary_key=True, default=new_id)
    source_id: Mapped[str] = mapped_column(UUIDStr, ForeignKey("sources.id", ondelete="CASCADE"), index=True)
    research_session_id: Mapped[str] = mapped_column(
        UUIDStr, ForeignKey("research_sessions.id", ondelete="CASCADE")
    )
    ref: Mapped[str] = mapped_column(String(30))
    content: Mapped[str] = mapped_column(Text)
    chunk_index: Mapped[int] = mapped_column(Integer)
    char_start: Mapped[int] = mapped_column(Integer, default=0)
    char_end: Mapped[int] = mapped_column(Integer, default=0)
    page_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    section_heading: Mapped[str | None] = mapped_column(String(500), nullable=True)
    embedding: Mapped[list[float] | None] = mapped_column(VectorType(EMBED_DIM), nullable=True)
    extra: Mapped[dict] = mapped_column("metadata", JSONType, default=dict)

    source: Mapped[Source] = relationship(back_populates="chunks")


class Claim(Base, TimestampMixin):
    __tablename__ = "claims"
    __table_args__ = (
        UniqueConstraint("research_session_id", "ref", name="uq_claim_ref"),
        Index("ix_claims_subject_pred", "research_session_id", "predicate"),
    )

    id: Mapped[str] = mapped_column(UUIDStr, primary_key=True, default=new_id)
    research_session_id: Mapped[str] = mapped_column(
        UUIDStr, ForeignKey("research_sessions.id", ondelete="CASCADE"), index=True
    )
    source_id: Mapped[str] = mapped_column(UUIDStr, ForeignKey("sources.id", ondelete="CASCADE"), index=True)
    ref: Mapped[str] = mapped_column(String(30))
    subject: Mapped[str] = mapped_column(String(300))
    predicate: Mapped[str] = mapped_column(String(120))
    object_value: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(120), index=True)
    original_text: Mapped[str] = mapped_column(Text)
    evidence_quote: Mapped[str] = mapped_column(Text)
    evidence_location: Mapped[dict] = mapped_column(JSONType, default=dict)
    confidence: Mapped[float] = mapped_column(Float, default=0.5)
    method: Mapped[str] = mapped_column(String(20), default="heuristic")
    quote_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    qualifiers: Mapped[dict] = mapped_column(JSONType, default=dict)  # normalized value, period, scope


class ClaimRelationship(Base, TimestampMixin):
    __tablename__ = "claim_relationships"
    __table_args__ = (
        Index("ix_rel_src", "source_claim_id"),
        Index("ix_rel_tgt", "target_claim_id"),
    )

    id: Mapped[str] = mapped_column(UUIDStr, primary_key=True, default=new_id)
    research_session_id: Mapped[str] = mapped_column(
        UUIDStr, ForeignKey("research_sessions.id", ondelete="CASCADE"), index=True
    )
    source_claim_id: Mapped[str] = mapped_column(UUIDStr, ForeignKey("claims.id", ondelete="CASCADE"))
    target_claim_id: Mapped[str] = mapped_column(UUIDStr, ForeignKey("claims.id", ondelete="CASCADE"))
    relationship_type: Mapped[str] = mapped_column(String(50))
    explanation: Mapped[str | None] = mapped_column(Text, nullable=True)


class InformationCategory(Base, TimestampMixin):
    __tablename__ = "information_categories"
    __table_args__ = (UniqueConstraint("research_session_id", "name", name="uq_category_name"),)

    id: Mapped[str] = mapped_column(UUIDStr, primary_key=True, default=new_id)
    research_session_id: Mapped[str] = mapped_column(
        UUIDStr, ForeignKey("research_sessions.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(120))
    label: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    importance: Mapped[int] = mapped_column(Integer, default=3)
    consequence: Mapped[int] = mapped_column(Integer, default=3)
    expected_information: Mapped[str] = mapped_column(Text, default="")
    keywords: Mapped[list] = mapped_column(JSONType, default=list)
    value_type: Mapped[str] = mapped_column(String(20), default="text")
    suggested_question: Mapped[str] = mapped_column(Text, default="")
    generation_method: Mapped[str] = mapped_column(String(40), default="template")


class CoverageResult(Base, TimestampMixin):
    __tablename__ = "coverage_results"

    id: Mapped[str] = mapped_column(UUIDStr, primary_key=True, default=new_id)
    research_session_id: Mapped[str] = mapped_column(
        UUIDStr, ForeignKey("research_sessions.id", ondelete="CASCADE"), index=True
    )
    category_id: Mapped[str] = mapped_column(
        UUIDStr, ForeignKey("information_categories.id", ondelete="CASCADE"), unique=True
    )
    status: Mapped[str] = mapped_column(String(30))
    explanation: Mapped[str] = mapped_column(Text, default="")
    evidence_claim_ids: Mapped[list] = mapped_column(JSONType, default=list)
    source_refs: Mapped[list] = mapped_column(JSONType, default=list)
    mention_chunk_refs: Mapped[list] = mapped_column(JSONType, default=list)
    reasoning: Mapped[dict] = mapped_column(JSONType, default=dict)


class Finding(Base, TimestampMixin):
    __tablename__ = "findings"
    __table_args__ = (UniqueConstraint("research_session_id", "ref", name="uq_finding_ref"),)

    id: Mapped[str] = mapped_column(UUIDStr, primary_key=True, default=new_id)
    research_session_id: Mapped[str] = mapped_column(
        UUIDStr, ForeignKey("research_sessions.id", ondelete="CASCADE"), index=True
    )
    ref: Mapped[str] = mapped_column(String(30))
    finding_type: Mapped[str] = mapped_column(String(30), index=True)
    title: Mapped[str] = mapped_column(String(500))
    description: Mapped[str] = mapped_column(Text)
    severity: Mapped[str] = mapped_column(String(20), default="medium")
    confidence: Mapped[float] = mapped_column(Float, default=0.5)
    evidence_references: Mapped[dict] = mapped_column(JSONType, default=dict)
    epistemic_status: Mapped[str] = mapped_column(String(30), default="inference")
    verification_status: Mapped[str] = mapped_column(String(30), default="unresolved")
    reasoning: Mapped[dict] = mapped_column(JSONType, default=dict)
    verification_issues: Mapped[list] = mapped_column(JSONType, default=list)
    user_note: Mapped[str | None] = mapped_column(Text, nullable=True)


class VerificationTask(Base, TimestampMixin):
    __tablename__ = "verification_tasks"

    id: Mapped[str] = mapped_column(UUIDStr, primary_key=True, default=new_id)
    research_session_id: Mapped[str] = mapped_column(
        UUIDStr, ForeignKey("research_sessions.id", ondelete="CASCADE"), index=True
    )
    finding_id: Mapped[str | None] = mapped_column(
        UUIDStr, ForeignKey("findings.id", ondelete="SET NULL"), nullable=True
    )
    title: Mapped[str] = mapped_column(String(500))
    reason: Mapped[str] = mapped_column(Text)
    priority: Mapped[str] = mapped_column(String(10), index=True)
    priority_reasoning: Mapped[dict] = mapped_column(JSONType, default=dict)
    recommended_source_type: Mapped[str] = mapped_column(String(40), default="official_source")
    suggested_question: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="PENDING")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class PipelineStage(Base):
    __tablename__ = "pipeline_stages"
    __table_args__ = (UniqueConstraint("research_session_id", "stage", name="uq_stage"),)

    id: Mapped[str] = mapped_column(UUIDStr, primary_key=True, default=new_id)
    research_session_id: Mapped[str] = mapped_column(
        UUIDStr, ForeignKey("research_sessions.id", ondelete="CASCADE"), index=True
    )
    stage: Mapped[str] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(20), default="pending")
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    stats: Mapped[dict] = mapped_column(JSONType, default=dict)


class AnalysisReport(Base, TimestampMixin):
    __tablename__ = "analysis_reports"

    id: Mapped[str] = mapped_column(UUIDStr, primary_key=True, default=new_id)
    research_session_id: Mapped[str] = mapped_column(
        UUIDStr, ForeignKey("research_sessions.id", ondelete="CASCADE"), unique=True
    )
    score: Mapped[dict] = mapped_column(JSONType, default=dict)
    report: Mapped[dict] = mapped_column(JSONType, default=dict)
    errors: Mapped[list] = mapped_column(JSONType, default=list)
