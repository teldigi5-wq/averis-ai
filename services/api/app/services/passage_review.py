from __future__ import annotations

from dataclasses import dataclass

from app.services.quote_context import QuoteContextReview, QuotePassageReview
from app.services.reference_linkage import ReferenceLinkageReview


@dataclass(frozen=True)
class PassageReviewItem:
    document_sentence: str
    match_score: float
    priority: str
    reasons: tuple[str, ...]
    quote_detected: bool
    citation_detected: bool
    citation_marker: str | None
    reference_link_status: str
    verified_reference_count: int
    metadata_review_reference_count: int


@dataclass(frozen=True)
class PassageReviewMatrix:
    passages_reviewed: int
    high_attention_count: int
    attention_count: int
    contextualized_count: int
    items: tuple[PassageReviewItem, ...]
    scope_note: str


def _link_map(reference_linkage: ReferenceLinkageReview | None):
    if reference_linkage is None:
        return {}
    return {link.document_sentence: link for link in reference_linkage.links}


def _priority_for_passage(
    passage: QuotePassageReview,
    *,
    reference_link_status: str,
    metadata_review_count: int,
    verification_unavailable_count: int,
    high_match_threshold: float,
) -> tuple[str, tuple[str, ...]]:
    reasons: list[str] = []

    if passage.quote_detected and not passage.citation_detected:
        reasons.append("quoted_without_citation_marker")

    if not passage.quote_detected and passage.match_score >= high_match_threshold:
        reasons.append("high_overlap_unquoted")

    if not passage.citation_detected:
        reasons.append("citation_marker_missing")

    if reference_link_status == "marker_unlinked":
        reasons.append("citation_not_linked_to_bibliography")
    elif reference_link_status == "ambiguous_link":
        reasons.append("citation_link_ambiguous")

    if metadata_review_count > 0:
        reasons.append("reference_metadata_review")
    if verification_unavailable_count > 0:
        reasons.append("reference_verification_unavailable")

    high_attention = {
        "quoted_without_citation_marker",
        "high_overlap_unquoted",
    }
    if any(reason in high_attention for reason in reasons):
        return "high_attention", tuple(reasons)
    if reasons:
        return "attention", tuple(reasons)
    return "contextualized", ()


def build_passage_review_matrix(
    quote_review: QuoteContextReview,
    reference_linkage: ReferenceLinkageReview | None = None,
    *,
    high_match_threshold: float = 85.0,
) -> PassageReviewMatrix:
    """Synthesize passage context into a deterministic human-review queue.

    This matrix does not change similarity scores and does not declare plagiarism,
    misconduct, or authorship. It only prioritizes already-observed evidence so a
    student or reviewer can inspect the most important passages first.
    """
    if high_match_threshold < 0 or high_match_threshold > 100:
        raise ValueError("high_match_threshold must be between 0 and 100")

    links = _link_map(reference_linkage)
    items: list[PassageReviewItem] = []

    for passage in quote_review.passages:
        link = links.get(passage.document_sentence)
        reference_link_status = link.link_status if link is not None else "not_evaluated"
        verified_count = 0
        metadata_review_count = 0
        unavailable_count = 0

        if link is not None:
            for reference in link.references:
                if reference.verification_status == "verified_doi":
                    verified_count += 1
                elif reference.verification_status == "verified_doi_metadata_review":
                    metadata_review_count += 1
                elif reference.verification_status == "verification_unavailable":
                    unavailable_count += 1

        priority, reasons = _priority_for_passage(
            passage,
            reference_link_status=reference_link_status,
            metadata_review_count=metadata_review_count,
            verification_unavailable_count=unavailable_count,
            high_match_threshold=high_match_threshold,
        )

        items.append(
            PassageReviewItem(
                document_sentence=passage.document_sentence,
                match_score=passage.match_score,
                priority=priority,
                reasons=reasons,
                quote_detected=passage.quote_detected,
                citation_detected=passage.citation_detected,
                citation_marker=passage.citation_marker,
                reference_link_status=reference_link_status,
                verified_reference_count=verified_count,
                metadata_review_reference_count=metadata_review_count,
            )
        )

    rank = {"high_attention": 0, "attention": 1, "contextualized": 2}
    items.sort(key=lambda item: (rank[item.priority], -item.match_score, item.document_sentence))

    high_count = sum(1 for item in items if item.priority == "high_attention")
    attention_count = sum(1 for item in items if item.priority == "attention")
    contextualized_count = sum(1 for item in items if item.priority == "contextualized")

    return PassageReviewMatrix(
        passages_reviewed=len(items),
        high_attention_count=high_count,
        attention_count=attention_count,
        contextualized_count=contextualized_count,
        items=tuple(items),
        scope_note=(
            "Review priority is a deterministic triage of matched-passage context. It does not alter the similarity score "
            "and is not a plagiarism, misconduct, or authorship verdict."
        ),
    )
