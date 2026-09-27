from __future__ import annotations

from dataclasses import dataclass, replace

from app.services.citation_context import CitationPassageReview
from app.services.crossref import CrossrefClient, CrossrefLookupError
from app.services.references import (
    ParsedReference,
    extract_author_year_citations,
    extract_numeric_citations,
    parse_reference_block,
)
from app.services.source_metadata import SourceMetadata


@dataclass(frozen=True)
class LinkedReference:
    index: int
    raw: str
    doi: str | None
    year: str | None
    author_key: str | None
    verification_status: str
    verified_source: SourceMetadata | None = None


@dataclass(frozen=True)
class CitationReferenceLink:
    document_sentence: str
    match_score: float
    citation_marker: str | None
    link_status: str
    references: tuple[LinkedReference, ...]


@dataclass(frozen=True)
class ReferenceLinkageReview:
    supplied_reference_count: int
    linked_passage_count: int
    unlinked_citation_count: int
    doi_verified_reference_count: int
    verification_unavailable_count: int
    links: tuple[CitationReferenceLink, ...]
    scope_note: str


def _local_reference(reference: ParsedReference) -> LinkedReference:
    return LinkedReference(
        index=reference.index,
        raw=reference.raw,
        doi=reference.doi,
        year=reference.year,
        author_key=reference.author_key,
        verification_status="linked_local_only",
    )


def _references_for_marker(marker: str, references: list[ParsedReference]) -> list[ParsedReference]:
    author_year = extract_author_year_citations(marker, max_mentions=8)
    if author_year:
        keys = {(mention.author_key, mention.year) for mention in author_year}
        return [
            reference
            for reference in references
            if reference.author_key
            and reference.year
            and (reference.author_key, reference.year) in keys
        ]

    numeric = extract_numeric_citations(marker, max_mentions=8)
    if numeric:
        indexes: set[int] = set()
        for mention in numeric:
            indexes.update(mention.numbers)
        return [reference for reference in references if reference.index in indexes]

    return []


def link_citations_to_references(
    passages: list[CitationPassageReview],
    reference_text: str,
    *,
    max_references: int = 50,
) -> ReferenceLinkageReview:
    """Link nearby citation markers to entries in the supplied bibliography.

    This is intentionally conservative. A successful link means only that the
    marker shape can be mapped to a bibliography entry by author/year or numeric
    position. It does not prove that the reference supports the matched passage.
    """
    references = parse_reference_block(reference_text, max_entries=max_references)
    links: list[CitationReferenceLink] = []
    linked_passages = 0
    unlinked_citations = 0

    for passage in passages:
        marker = passage.citation_marker
        if not marker:
            links.append(
                CitationReferenceLink(
                    document_sentence=passage.document_sentence,
                    match_score=passage.match_score,
                    citation_marker=None,
                    link_status="no_marker",
                    references=(),
                )
            )
            continue

        matched = _references_for_marker(marker, references)
        if matched:
            linked_passages += 1
            status = "linked" if len(matched) == 1 else "ambiguous_link"
            links.append(
                CitationReferenceLink(
                    document_sentence=passage.document_sentence,
                    match_score=passage.match_score,
                    citation_marker=marker,
                    link_status=status,
                    references=tuple(_local_reference(reference) for reference in matched),
                )
            )
        else:
            unlinked_citations += 1
            links.append(
                CitationReferenceLink(
                    document_sentence=passage.document_sentence,
                    match_score=passage.match_score,
                    citation_marker=marker,
                    link_status="marker_unlinked",
                    references=(),
                )
            )

    return ReferenceLinkageReview(
        supplied_reference_count=len(references),
        linked_passage_count=linked_passages,
        unlinked_citation_count=unlinked_citations,
        doi_verified_reference_count=0,
        verification_unavailable_count=0,
        links=tuple(links),
        scope_note=(
            "Citation-to-reference linkage maps common author-year or numeric markers to the supplied bibliography. "
            "A link is not proof that the cited work supports the sentence, and references without verified DOI metadata "
            "remain local-only evidence until separately checked."
        ),
    )


async def verify_linked_dois(
    review: ReferenceLinkageReview,
    *,
    crossref: CrossrefClient,
    max_lookups: int = 5,
) -> ReferenceLinkageReview:
    """Attach bounded Crossref evidence for distinct DOI-bearing linked references.

    Crossref outages never fail the parent revision analysis. They are reported
    as verification-unavailable evidence so the student can retry Reference Audit.
    """
    remaining = max(0, max_lookups)
    cache: dict[str, tuple[str, SourceMetadata | None]] = {}
    verified = 0
    unavailable = 0
    updated_links: list[CitationReferenceLink] = []

    for link in review.links:
        updated_references: list[LinkedReference] = []
        for reference in link.references:
            if not reference.doi:
                updated_references.append(reference)
                continue

            if reference.doi not in cache:
                if remaining <= 0:
                    cache[reference.doi] = ("not_checked_limit", None)
                else:
                    remaining -= 1
                    try:
                        source = await crossref.resolve_doi(reference.doi)
                    except CrossrefLookupError:
                        cache[reference.doi] = ("verification_unavailable", None)
                    else:
                        if source is None:
                            cache[reference.doi] = ("doi_not_found", None)
                        else:
                            cache[reference.doi] = ("verified_doi", source)

            status, source = cache[reference.doi]
            if status == "verified_doi":
                verified += 1
            elif status == "verification_unavailable":
                unavailable += 1
            updated_references.append(
                replace(
                    reference,
                    verification_status=status,
                    verified_source=source,
                )
            )

        updated_links.append(replace(link, references=tuple(updated_references)))

    # Count distinct linked reference identities rather than repeated passage uses.
    verified_keys = {
        (reference.index, reference.doi)
        for link in updated_links
        for reference in link.references
        if reference.verification_status == "verified_doi"
    }
    unavailable_keys = {
        (reference.index, reference.doi)
        for link in updated_links
        for reference in link.references
        if reference.verification_status == "verification_unavailable"
    }

    return replace(
        review,
        doi_verified_reference_count=len(verified_keys),
        verification_unavailable_count=len(unavailable_keys),
        links=tuple(updated_links),
    )
