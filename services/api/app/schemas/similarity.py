from pydantic import BaseModel, Field


class SimilarityCompareRequest(BaseModel):
    document_text: str = Field(min_length=1)
    source_text: str = Field(min_length=1)
    source_name: str = "reference"


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
