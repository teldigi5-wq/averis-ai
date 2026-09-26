from pydantic import BaseModel, Field

from app.services.references import CitationAudit, CitationMention, ParsedReference


class ReferenceParseRequest(BaseModel):
    references_text: str = Field(min_length=1, max_length=25_000)


class CitationAuditRequest(BaseModel):
    document_text: str = Field(min_length=1, max_length=150_000)
    references_text: str = Field(min_length=1, max_length=25_000)


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
