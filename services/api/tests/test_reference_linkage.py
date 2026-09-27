import asyncio

from app.schemas.similarity import PassageMatch
from app.services.citation_context import analyze_citation_coverage
from app.services.reference_linkage import link_citations_to_references, verify_linked_dois
from app.services.source_metadata import SourceMetadata


def test_links_author_year_marker_to_supplied_reference() -> None:
    document = (
        "Continuous verification is required for every protected resource and access request (Perera, 2024). "
        "The assignment then compares the operational effect of this requirement."
    )
    matches = [
        PassageMatch(
            document_sentence="Continuous verification is required for every protected resource and access request (Perera, 2024).",
            source_sentence="Continuous verification is required for every protected resource and access request.",
            score=94.0,
        )
    ]
    coverage = analyze_citation_coverage(document, matches)
    review = link_citations_to_references(
        coverage.passages,
        "Perera, K. (2024). Zero trust operations. Journal of Cloud Security. https://doi.org/10.1234/example.2024.5",
    )

    assert review.supplied_reference_count == 1
    assert review.linked_passage_count == 1
    assert review.unlinked_citation_count == 0
    link = review.links[0]
    assert link.link_status == "linked"
    assert link.references[0].index == 1
    assert link.references[0].doi == "10.1234/example.2024.5"


def test_links_numeric_marker_by_bibliography_position() -> None:
    document = "The control should be evaluated continuously [2]."
    matches = [
        PassageMatch(
            document_sentence=document,
            source_sentence="The control should be evaluated continuously.",
            score=91.0,
        )
    ]
    coverage = analyze_citation_coverage(document, matches)
    references = "1. Silva, A. (2021). First source.\n2. Fernando, B. (2023). Second source."
    review = link_citations_to_references(coverage.passages, references)

    assert review.linked_passage_count == 1
    assert review.links[0].references[0].index == 2
    assert "Second source" in review.links[0].references[0].raw


class _FakeCrossref:
    async def resolve_doi(self, doi: str):
        assert doi == "10.1234/example.2024.5"
        return SourceMetadata(
            provider="crossref",
            external_id=doi,
            title="Zero trust operations",
            doi=doi,
            published_year=2024,
            authors=("K Perera",),
        )


def test_attaches_crossref_metadata_to_linked_doi() -> None:
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

    verified = asyncio.run(verify_linked_dois(review, crossref=_FakeCrossref()))  # type: ignore[arg-type]

    assert verified.doi_verified_reference_count == 1
    reference = verified.links[0].references[0]
    assert reference.verification_status == "verified_doi"
    assert reference.verified_source is not None
    assert reference.verified_source.title == "Zero trust operations"
