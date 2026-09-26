from pydantic import BaseModel, Field

from app.schemas.source import SourceResult, source_result_from_metadata
from app.services.reference_verification import ReferenceVerification
from app.services.references import CitationAudit, CitationMention, ParsedReference


class ReferenceParseRequest(BaseModel):
    references_text: str = Field(min_length=1, max_length=25_000)


class CitationAuditRequest(BaseModel):
    document_text: str = Field(min_length=1, max_length=150_000)
    references_text: str = Field(min_length=1, max_length=25_000)


class ReferenceVerificationRequest(BaseModel):
    references_text: str = Field(min_length=1, max_length=25_000)
    limit: int = Field(default=5, ge=1, le=10)


class ParsedReferenceResult(BaseModel):
    index: int
    raw: str
    doi: str | None = None
    year: str | None = None
    author_key: str | None = None
    warnings: list[str] = Field(default_factory=list)


class CitationMentionResult(BaseModel):
    raw: str
    author_key: str
    year: str
    start: int


class ReferenceVerificationResult(BaseModel):
    reference: ParsedReferenceResult
    status: str
    match_method: str | None = None
    bibliographic_match_score: float | None = None
    source: SourceResult | None = None
    issues: list[str] = Field(default_factory=list)


class ReferenceParseResponse(BaseModel):
    references: list[ParsedReferenceResult]
    count: int
    scope_note: str


class CitationAuditResponse(BaseModel):
    references: list[ParsedReferenceResult]
    citations: list[CitationMentionResult]
    unmatched_citations: list[CitationMentionResult]
    uncited_references: list[ParsedReferenceResult]
    matched_citation_count: int
    scope_note: str


class ReferenceVerificationResponse(BaseModel):
    provider: str = "crossref"
    checked_count: int
    results: list[ReferenceVerificationResult]
    cost_policy: str = "public-no-key"
    scope_note: str


def _reference(reference: ParsedReference) -> ParsedReferenceResult:
    return ParsedReferenceResult(
        index=reference.index,
        raw=reference.raw,
        doi=reference.doi,
        year=reference.year,
        author_key=reference.author_key,
        warnings=list(reference.warnings),
    )


def _citation(citation: CitationMention) -> CitationMentionResult:
    return CitationMentionResult(
        raw=citation.raw,
        author_key=citation.author_key,
        year=citation.year,
        start=citation.start,
    )


def parse_response(references: list[ParsedReference]) -> ReferenceParseResponse:
    return ReferenceParseResponse(
        references=[_reference(reference) for reference in references],
        count=len(references),
        scope_note=(
            "Heuristic bibliography parsing for review. DOI/year/author detection can be incomplete, "
            "especially for numeric citation styles or unusual formatting."
        ),
    )


def audit_response(audit: CitationAudit) -> CitationAuditResponse:
    return CitationAuditResponse(
        references=[_reference(reference) for reference in audit.references],
        citations=[_citation(citation) for citation in audit.citations],
        unmatched_citations=[_citation(citation) for citation in audit.unmatched_citations],
        uncited_references=[_reference(reference) for reference in audit.uncited_references],
        matched_citation_count=audit.matched_citation_count,
        scope_note=(
            "Current consistency checks cover common author-year citations only. Findings are review aids, "
            "not proof that a citation or reference is invalid."
        ),
    )


def verification_response(results: list[ReferenceVerification]) -> ReferenceVerificationResponse:
    return ReferenceVerificationResponse(
        checked_count=len(results),
        results=[
            ReferenceVerificationResult(
                reference=_reference(result.reference),
                status=result.status,
                match_method=result.match_method,
                bibliographic_match_score=result.bibliographic_match_score,
                source=source_result_from_metadata(result.source) if result.source else None,
                issues=list(result.issues),
            )
            for result in results
        ],
        scope_note=(
            "Crossref evidence can confirm DOI metadata or suggest bibliographic candidates, but a missing or "
            "low-scoring candidate is not proof that a reference is fabricated. Review the cited work manually."
        ),
    )
