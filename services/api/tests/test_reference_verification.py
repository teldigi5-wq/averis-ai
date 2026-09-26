import asyncio

from app.services.reference_verification import verify_reference_block
from app.services.source_metadata import SourceMetadata


class FakeCrossref:
    async def resolve_doi(self, doi: str) -> SourceMetadata | None:
        if doi == "10.1000/missing":
            return None
        if doi == "10.1000/mismatch":
            return SourceMetadata(
                provider="crossref",
                external_id=doi,
                title="Metadata mismatch example",
                doi=doi,
                published_year=2020,
                authors=("John Smith",),
            )
        return SourceMetadata(
            provider="crossref",
            external_id=doi,
            title="Network Security Evidence",
            doi=doi,
            published_year=2020,
            authors=("John Smith",),
        )

    async def search(self, query: str, *, limit: int = 1) -> list[SourceMetadata]:
        assert limit == 1
        if "No Candidate" in query:
            return []
        if "Photosynthesis" in query:
            return [
                SourceMetadata(
                    provider="crossref",
                    external_id="10.2000/unrelated",
                    title="Quantum materials in extreme environments",
                    doi="10.2000/unrelated",
                    published_year=2018,
                    authors=("Alex Brown",),
                )
            ]
        return [
            SourceMetadata(
                provider="crossref",
                external_id="10.2000/network",
                title="Network Security Evidence",
                doi="10.2000/network",
                published_year=2020,
                authors=("John Smith",),
            )
        ]


def _run(coro):
    return asyncio.run(coro)


def test_doi_reference_is_verified_with_crossref_metadata() -> None:
    results = _run(
        verify_reference_block(
            "Smith, J. (2020). Network Security Evidence. https://doi.org/10.1000/TEST",
            crossref=FakeCrossref(),
        )
    )
    assert results[0].status == "verified_doi"
    assert results[0].match_method == "doi"
    assert results[0].bibliographic_match_score == 100.0
    assert results[0].issues == ()


def test_doi_metadata_mismatch_is_kept_for_manual_review() -> None:
    results = _run(
        verify_reference_block(
            "Smith, J. (2019). Metadata mismatch example. https://doi.org/10.1000/MISMATCH",
            crossref=FakeCrossref(),
        )
    )
    assert results[0].status == "verified_doi_metadata_review"
    assert "publication_year_mismatch" in results[0].issues


def test_missing_doi_record_is_not_called_fake() -> None:
    results = _run(
        verify_reference_block(
            "Smith, J. (2020). Missing DOI record. https://doi.org/10.1000/MISSING",
            crossref=FakeCrossref(),
        )
    )
    assert results[0].status == "no_crossref_record"
    assert results[0].source is None


def test_doi_less_strong_bibliographic_candidate_is_likely_match() -> None:
    results = _run(
        verify_reference_block(
            "Smith, J. (2020). Network Security Evidence.",
            crossref=FakeCrossref(),
        )
    )
    assert results[0].status == "likely_match"
    assert results[0].bibliographic_match_score is not None
    assert results[0].bibliographic_match_score >= 75


def test_low_bibliographic_candidate_requires_review() -> None:
    results = _run(
        verify_reference_block(
            "Green, P. (2024). Photosynthesis pathways in tropical plants.",
            crossref=FakeCrossref(),
        )
    )
    assert results[0].status == "needs_review"
    assert "low_bibliographic_match" in results[0].issues


def test_no_bibliographic_candidate_is_advisory_only() -> None:
    results = _run(
        verify_reference_block(
            "Writer, A. (2023). No Candidate Example.",
            crossref=FakeCrossref(),
        )
    )
    assert results[0].status == "no_candidate_found"
    assert results[0].source is None
