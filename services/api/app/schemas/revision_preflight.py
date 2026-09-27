from pydantic import BaseModel, Field

from app.schemas.revision import WritingStyleMetrics


class RevisionPreflightRequest(BaseModel):
    text: str = Field(min_length=50, max_length=80_000)
    source_text: str | None = Field(default=None, max_length=40_000)
    source_name: str = Field(default="Comparison source", min_length=1, max_length=250)
    requested_goal: str = Field(
        default="Improve clarity, structure and attribution while preserving my own meaning.",
        min_length=3,
        max_length=500,
    )


class RevisionPreflightSourceEvidence(BaseModel):
    source_name: str
    similarity_percent: float
    exact_overlap_percent: float
    fuzzy_passage_percent: float
    matched_passage_count: int
    strongest_passage_score: float | None = None
    review_band: str
    evidence_note: str


class RevisionPreflightResponse(BaseModel):
    writing: WritingStyleMetrics
    source_evidence: RevisionPreflightSourceEvidence | None = None
    generation_eligible: bool
    boundary: str
    blocked_reason: str | None = None
    evidence_first_actions: list[str] = Field(default_factory=list)
    caution: str = (
        "Writing-style metrics are revision signals, not an AI-authorship probability. "
        "Similarity evidence is context for human review, not an automatic plagiarism or misconduct verdict."
    )
    evidence_version: str = "revision-preflight-v1"
