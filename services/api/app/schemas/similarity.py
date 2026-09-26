from pydantic import BaseModel, Field


class SimilarityCompareRequest(BaseModel):
    document_text: str = Field(min_length=1)
    source_text: str = Field(min_length=1)
    source_name: str = "reference"
    document_name: str = "submission"


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

    # M2 candidate-retrieval foundation. These signals are intentionally kept
    # separate from similarity_percent until a real semantic model is certified.
    document_hash: str | None = None
    source_hash: str | None = None
    minhash_candidate_score: float | None = None
    vector_candidate_score: float | None = None
    candidate_provider: str | None = None
    evidence_version: str = "m1-evidence-v1"
