from __future__ import annotations

from dataclasses import dataclass
import re

from rapidfuzz import fuzz

from app.services.crossref import CrossrefClient
from app.services.references import ParsedReference, parse_reference_block
from app.services.source_metadata import SourceMetadata


@dataclass(frozen=True)
class ReferenceVerification:
    reference: ParsedReference
    status: str
    match_method: str | None
    bibliographic_match_score: float | None
    source: SourceMetadata | None
    issues: tuple[str, ...]


def _normalize_key(value: str) -> str:
    return re.sub(r"[^\w'’\-]", "", value, flags=re.UNICODE).casefold()


def _source_author_key(source: SourceMetadata) -> str | None:
    if not source.authors:
        return None
    tokens = re.findall(r"[A-Za-zÀ-ÖØ-öø-ÿ'’\-]+", source.authors[0], re.UNICODE)
    return _normalize_key(tokens[-1]) if tokens else None


def _candidate_citation(source: SourceMetadata) -> str:
    parts: list[str] = []
    if source.authors:
        parts.append("; ".join(source.authors))
    if source.published_year:
        parts.append(str(source.published_year))
    parts.append(source.title)
    if source.doi:
        parts.append(source.doi)
    return ". ".join(part for part in parts if part)


def _metadata_issues(reference: ParsedReference, source: SourceMetadata) -> list[str]:
    issues: list[str] = []
    if reference.year and source.published_year:
        if reference.year[:4] != str(source.published_year):
            issues.append("publication_year_mismatch")

    source_author = _source_author_key(source)
    if reference.author_key and source_author and reference.author_key != source_author:
        issues.append("first_author_mismatch")
    return issues


async def verify_reference_block(
    reference_text: str,
    *,
    crossref: CrossrefClient,
    limit: int = 5,
) -> list[ReferenceVerification]:
    bounded_limit = max(1, min(limit, 10))
    references = parse_reference_block(reference_text, max_entries=bounded_limit)
    results: list[ReferenceVerification] = []

    for reference in references:
        if reference.doi:
            source = await crossref.resolve_doi(reference.doi)
            if source is None:
                results.append(
                    ReferenceVerification(
                        reference=reference,
                        status="no_crossref_record",
                        match_method="doi",
                        bibliographic_match_score=None,
                        source=None,
                        issues=("doi_not_found_in_crossref",),
                    )
                )
                continue

            issues = _metadata_issues(reference, source)
            results.append(
                ReferenceVerification(
                    reference=reference,
                    status="verified_doi" if not issues else "verified_doi_metadata_review",
                    match_method="doi",
                    bibliographic_match_score=100.0,
                    source=source,
                    issues=tuple(issues),
                )
            )
            continue

        candidates = await crossref.search(reference.raw, limit=1)
        if not candidates:
            results.append(
                ReferenceVerification(
                    reference=reference,
                    status="no_candidate_found",
                    match_method="bibliographic_search",
                    bibliographic_match_score=None,
                    source=None,
                    issues=("crossref_candidate_not_found",),
                )
            )
            continue

        source = candidates[0]
        score = round(float(fuzz.token_set_ratio(reference.raw, _candidate_citation(source))), 2)
        issues = _metadata_issues(reference, source)
        if score < 75.0:
            issues.append("low_bibliographic_match")

        status = "likely_match" if score >= 75.0 and not issues else "needs_review"
        results.append(
            ReferenceVerification(
                reference=reference,
                status=status,
                match_method="bibliographic_search",
                bibliographic_match_score=score,
                source=source,
                issues=tuple(issues),
            )
        )

    return results
