from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, HttpUrl, field_validator


class ResearchCreate(BaseModel):
    research_question: str = Field(min_length=5, max_length=2000)
    title: str | None = Field(None, max_length=300)
    research_objective: str | None = Field(None, max_length=3000)
    topic: str | None = Field(None, max_length=300)
    as_of_date: date | None = None


class SourceItem(BaseModel):
    url: str = Field(min_length=4, max_length=2048)
    source_type: str | None = None


class SourcesAdd(BaseModel):
    sources: list[SourceItem] = Field(min_length=1, max_length=25)


class TaskPatch(BaseModel):
    status: Literal["PENDING", "IN_PROGRESS", "COMPLETED"] | None = None
    notes: str | None = Field(None, max_length=4000)


class FindingPatch(BaseModel):
    verification_status: Literal["unresolved", "reviewed", "resolved"] | None = None
    user_note: str | None = Field(None, max_length=4000)
