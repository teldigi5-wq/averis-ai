from pydantic import BaseModel, Field

from app.schemas.similarity import PassageMatch


class RevisionAnalyzeRequest(BaseModel):
    text: str = Field(min_length=50, max_length=80_000)
    source_text: str | None = Field(default=None, max_length=40_000)
    source_name: str = Field(default="Comparison source", min_length=1, max_length=250)
    references_text: str | None = Field(default=None, max_length=25_000)
    verify_linked_references: bool = True
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


class CitationPassageReview(BaseModel):
    document_sentence: str
    match_score: float
    citation_detected: bool
    citation_marker: str | None = None


class CitationCoverageMetrics(BaseModel):
    matched_passage_count: int
    citation_detected_count: int
    uncited_match_count: int
    citation_coverage_percent: float
    passages: list[CitationPassageReview] = Field(default_factory=list)
    scope_note: str


class LinkedReferenceEvidence(BaseModel):
    index: int
    raw: str
    doi: str | None = None
    year: str | None = None
    author_key: str | None = None
    verification_status: str
    verified_title: str | None = None
    verified_doi: str | None = None
    verified_year: int | None = None
    verified_authors: list[str] = Field(default_factory=list)


class CitationReferenceLinkEvidence(BaseModel):
    document_sentence: str
    match_score: float
    citation_marker: str | None = None
    link_status: str
    references: list[LinkedReferenceEvidence] = Field(default_factory=list)


class ReferenceLinkageMetrics(BaseModel):
    supplied_reference_count: int
    linked_passage_count: int
    unlinked_citation_count: int
    doi_verified_reference_count: int
    verification_unavailable_count: int
    links: list[CitationReferenceLinkEvidence] = Field(default_factory=list)
    scope_note: str


class SourceEvidenceMetrics(BaseModel):
    exact_overlap_percent: float
    fuzzy_passage_percent: float
    minhash_candidate_percent: float | None = None
    lexical_vector_percent: float | None = None
    semantic_similarity_percent: float | None = None
    semantic_provider: str | None = None
    semantic_calibrated: bool = False
    semantic_calibration_id: str | None = None
    overlap_review_band: str
    matched_passages: list[PassageMatch] = Field(default_factory=list)
    semantic_passages: list[PassageMatch] = Field(default_factory=list)


class RevisionAnalyzeResponse(BaseModel):
    writing: WritingStyleMetrics
    source_evidence: SourceEvidenceMetrics | None = None
    citation_review: CitationCoverageMetrics | None = None
    reference_linkage: ReferenceLinkageMetrics | None = None
    revision_actions: list[str]
    ai_enabled: bool
    ai_provider: str
    semantic_model: str | None = None
    coach_summary: str | None = None
    caution: str
    evidence_version: str = "ai-evidence-v4"
