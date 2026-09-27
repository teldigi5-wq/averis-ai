from pydantic import BaseModel, Field

from app.schemas.similarity import PassageMatch


class RevisionAnalyzeRequest(BaseModel):
    text: str = Field(min_length=50, max_length=80_000)
    source_text: str | None = Field(default=None, max_length=40_000)
    source_name: str = Field(default="Comparison source", min_length=1, max_length=250)
    include_ai_coach: bool = True


class WritingStyleMetrics(BaseModel):
    word_count: int
    sentence_count: int
    paragraph_count: int
    lexical_diversity_percent: float
    hapax_ratio_percent: float
    sentence_length_mean: float
    sentence_length_cv_percent: float
    paragraph_length_cv_percent: float
    repeated_trigram_ratio_percent: float
    style_uniformity_signal: float
    style_uniformity_band: str


class SourceEvidenceMetrics(BaseModel):
    exact_overlap_percent: float
    fuzzy_passage_percent: float
    minhash_candidate_percent: float | None = None
    lexical_vector_percent: float | None = None
    semantic_similarity_percent: float | None = None
    semantic_provider: str | None = None
    overlap_review_band: str
    matched_passages: list[PassageMatch] = Field(default_factory=list)
    semantic_passages: list[PassageMatch] = Field(default_factory=list)


class RevisionAnalyzeResponse(BaseModel):
    writing: WritingStyleMetrics
    source_evidence: SourceEvidenceMetrics | None = None
    revision_actions: list[str]
    ai_enabled: bool
    ai_provider: str
    semantic_model: str | None = None
    coach_summary: str | None = None
    caution: str
    evidence_version: str = "ai-evidence-v1"
