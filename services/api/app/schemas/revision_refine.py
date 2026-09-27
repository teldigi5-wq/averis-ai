from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class RevisionRefineRequest(BaseModel):
    text: str = Field(min_length=50, max_length=12_000)
    requested_goal: str = Field(
        default="Improve clarity, academic tone and sentence flow while preserving my meaning and citations.",
        min_length=3,
        max_length=500,
    )
    source_text: str | None = Field(default=None, max_length=40_000)
    source_name: str = Field(default="Comparison source", min_length=1, max_length=250)
    strength: Literal["light", "balanced"] = "balanced"


class RefinementSourceEvidence(BaseModel):
    source_name: str
    similarity_percent: float
    exact_overlap_percent: float
    fuzzy_passage_percent: float
    review_band: str


class RefinementPreservationReport(BaseModel):
    citations_before: list[str] = Field(default_factory=list)
    citations_after: list[str] = Field(default_factory=list)
    missing_citations: list[str] = Field(default_factory=list)
    numbers_before: list[str] = Field(default_factory=list)
    numbers_after: list[str] = Field(default_factory=list)
    missing_numbers: list[str] = Field(default_factory=list)
    length_change_percent: float
    acceptance_eligible: bool


class RevisionRefineResponse(BaseModel):
    generation_eligible: bool
    runtime_available: bool
    boundary: str
    blocked_reason: str | None = None
    original_text: str
    suggested_text: str | None = None
    preservation: RefinementPreservationReport | None = None
    source_evidence_before: RefinementSourceEvidence | None = None
    source_evidence_after: RefinementSourceEvidence | None = None
    caution: str = (
        "This feature is for clarity, structure, academic tone and source-grounded revision. "
        "It is not designed to hide AI use, lower detector scores or bypass academic-integrity systems. "
        "Review every suggestion and re-run evidence before accepting it."
    )
    evidence_version: str = "writing-refinement-v1"
