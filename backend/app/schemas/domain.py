"""Typed domain objects shared by every analysis stage. Pure data: no DB, no I/O."""
from __future__ import annotations

from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

CoverageStatus = Literal["COVERED", "PARTIALLY_COVERED", "NOT_FOUND", "UNCERTAIN", "NEEDS_VERIFICATION"]
FreshnessLabel = Literal["CURRENT", "POTENTIALLY_OUTDATED", "UNDATED", "EXPIRED", "DATE_UNAVAILABLE"]
Severity = Literal["low", "medium", "high"]
Priority = Literal["HIGH", "MEDIUM", "LOW"]
Epistemic = Literal["supported", "inference", "uncertain"]


class SourceDoc(BaseModel):
    ref: str
    url: str
    domain: str | None = None
    title: str | None = None
    source_type: str = "unknown"
    publication_date: date | None = None
    modified_date: date | None = None
    text: str = ""
    extractor: str | None = None
    date_origins: dict[str, str] = Field(default_factory=dict)
    is_demo: bool = False


class ChunkDoc(BaseModel):
    ref: str
    source_ref: str
    content: str
    start: int = 0
    end: int = 0
    page_number: int | None = None
    section_heading: str | None = None


class CategorySpec(BaseModel):
    name: str
    label: str
    description: str = ""
    importance: int = Field(3, ge=1, le=5)
    consequence: int = Field(3, ge=1, le=5)
    expected_information: str = ""
    keywords: list[str] = Field(default_factory=list)
    value_type: Literal["date", "money", "number", "text", "url"] = "text"
    suggested_question: str = ""
    generation_method: str = "template"

    @field_validator("name")
    @classmethod
    def _slug(cls, v: str) -> str:
        import re

        s = re.sub(r"[^a-z0-9]+", "_", v.lower()).strip("_")
        if not s:
            raise ValueError("category name is empty")
        return s[:80]


class EvidenceLocation(BaseModel):
    page_number: int | None = None
    section: str | None = None
    chunk_id: str | None = None
    char_start: int | None = None
    char_end: int | None = None


class ClaimDraft(BaseModel):
    subject: str
    predicate: str
    object: str
    category: str
    original_text: str
    source_ref: str
    evidence_quote: str
    evidence_location: EvidenceLocation = Field(default_factory=EvidenceLocation)
    confidence: float = Field(0.5, ge=0, le=1)
    method: Literal["heuristic", "llm"] = "heuristic"
    qualifiers: dict[str, Any] = Field(default_factory=dict)


class Claim(ClaimDraft):
    ref: str
    quote_verified: bool = False


class CoverageItem(BaseModel):
    category: str
    label: str
    status: CoverageStatus
    explanation: str
    claim_refs: list[str] = Field(default_factory=list)
    source_refs: list[str] = Field(default_factory=list)
    mention_chunk_refs: list[str] = Field(default_factory=list)
    suggested_question: str = ""
    importance: int = 3
    reasoning: dict[str, Any] = Field(default_factory=dict)


class ConflictClaimRef(BaseModel):
    claim_ref: str
    value: str
    source_ref: str


class Conflict(BaseModel):
    conflict_id: str
    subject: str
    predicate: str
    severity: Severity
    claims: list[ConflictClaimRef]
    explanation: str
    method: Literal["deterministic", "semantic_llm"] = "deterministic"
    resolution_status: str = "unresolved"
    relevant_dates: dict[str, dict[str, str | None]] = Field(default_factory=dict)
    recommended_verification: str = ""


class NonConflict(BaseModel):
    """A difference between claims that was examined and judged NOT to be a contradiction."""
    subject: str
    predicate: str
    claim_refs: list[str]
    kind: Literal["scope_difference", "period_difference", "currency_mismatch", "corroboration"]
    explanation: str


class FreshnessAssessment(BaseModel):
    source_ref: str
    label: FreshnessLabel
    reasons: list[str]
    periods_found: list[str] = Field(default_factory=list)
    deadline_dates: list[str] = Field(default_factory=list)
    metadata_date_used: str | None = None
    target_period: str | None = None
    target_period_origin: str | None = None
    evidence_quote: str | None = None


class FindingDraft(BaseModel):
    finding_type: Literal["gap", "contradiction", "freshness", "weak_evidence"]
    title: str
    description: str
    severity: Severity = "medium"
    confidence: float = 0.5
    claim_refs: list[str] = Field(default_factory=list)
    source_refs: list[str] = Field(default_factory=list)
    chunk_refs: list[str] = Field(default_factory=list)
    related_key: str | None = None  # category name / conflict id / source ref this finding is about
    reasoning: dict[str, Any] = Field(default_factory=dict)
    absence_finding: bool = False


class VerifiedFinding(FindingDraft):
    ref: str
    epistemic_status: Epistemic = "inference"
    verification_issues: list[str] = Field(default_factory=list)


class TaskDraft(BaseModel):
    title: str
    reason: str
    priority: Priority
    finding_ref: str | None = None
    recommended_source_type: str = "official_source"
    suggested_question: str | None = None
    priority_reasoning: dict[str, Any] = Field(default_factory=dict)
    status: str = "PENDING"
