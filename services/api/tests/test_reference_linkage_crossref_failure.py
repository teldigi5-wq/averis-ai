import asyncio

from app.schemas.similarity import PassageMatch
from app.services.citation_context import analyze_citation_coverage
from app.services.crossref import CrossrefLookupError
from app.services.reference_linkage import link_citations_to_references, verify_linked_dois


class _FailingCrossref:
    async def resolve_doi(self, doi: str):
        raise CrossrefLookupError("Crossref temporarily unavailable", retryable=True)


def test_crossref_failure_keeps_local_reference_linkage() -> None:
    document = "Continuous verification supports protected resources (Perera, 2024)."
    matches = [
        PassageMatch(
            document_sentence=document,
            source_sentence="Continuous verification supports protected resources.",
            score=93.0,
        )
    ]
    coverage = analyze_citation_coverage(document, matches)
    review = link_citations_to_references(
        coverage.passages,
        "Perera, K. (2024). Zero trust operations. doi:10.1234/example.2024.5",
    )

    result = asyncio.run(verify_linked_dois(review, crossref=_FailingCrossref()))  # type: ignore[arg-type]

    assert result.linked_passage_count == 1
    assert result.verification_unavailable_count == 1
    assert result.links[0].references[0].verification_status == "verification_unavailable"
    assert result.links[0].references[0].verified_source is None
