from pydantic import BaseModel, Field


class SimilarityCompareRequest(BaseModel):
    document_text: str = Field(min_length=1)
    source_text: str = Field(min_length=1)
    source_name: str = "reference"
    document_name: str = "submission"
    exclude_quotes: bool = False
    exclude_bibliography: bool = False
    min_match_words: int = Field(default=3, ge=3, le=50)


class PassageMatch(BaseModel):
    document_sentence: str
    source_sentence: str
    score: float


class SimilarityReport(BaseModel):
    source_name: str
    similarity_percent: float
    shingle_jaccard: float
    sentence_match_score: float
    matched_passages: list[PassageMatch]
    evidence_note: str
    scan_id: str | None = None
    credits_remaining: int | None = None

    # M3 evidence controls are transparent metadata, not hidden score changes.
    exclusions_applied: list[str] = Field(default_factory=list)
    min_match_words: int = 3
    document_words_original: int | None = None
    document_words_analyzed: int | None = None
    document_words_excluded: int | None = None

    # M2 candidate-retrieval foundation. These signals are intentionally kept
    # separate from similarity_percent until a real semantic model is certified.
    document_hash: str | None = None
    source_hash: str | None = None
    minhash_candidate_score: float | None = None
    vector_candidate_score: float | None = None
    candidate_provider: str | None = None
    evidence_version: str = "m1-evidence-v1"


class ContributionSourceInput(BaseModel):
    source_name: str = Field(min_length=1, max_length=250)
    source_text: str = Field(min_length=1, max_length=40_000)


class SourceContributionRequest(BaseModel):
    document_text: str = Field(min_length=1, max_length=80_000)
    sources: list[ContributionSourceInput] = Field(min_length=1, max_length=5)
    exclude_quotes: bool = False
    exclude_bibliography: bool = False
    min_match_words: int = Field(default=3, ge=3, le=50)


class SourceContributionPassage(BaseModel):
    document_sentence: str
    source_sentence: str
    score: float
    matched_words: int


class SourceContribution(BaseModel):
    source_name: str
    matched_sentence_count: int
    matched_word_count: int
    document_coverage_percent: float
    average_passage_score: float
    passages: list[SourceContributionPassage] = Field(default_factory=list)


class SourceContributionReport(BaseModel):
    contributions: list[SourceContribution]
    document_words_original: int
    document_words_analyzed: int
    document_words_excluded: int
    total_matched_words: int
    matched_document_coverage_percent: float
    exclusions_applied: list[str] = Field(default_factory=list)
    min_match_words: int
    evidence_note: str
    evidence_version: str = "m3-source-contributions-v1"
