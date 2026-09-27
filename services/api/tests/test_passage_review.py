from app.services.passage_review import build_passage_review_matrix
from app.services.quote_context import QuoteContextReview, QuotePassageReview
from app.services.reference_linkage import (
    CitationReferenceLink,
    LinkedReference,
    ReferenceLinkageReview,
)


def _quote_review(*passages: QuotePassageReview) -> QuoteContextReview:
    return QuoteContextReview(
        matched_passage_count=len(passages),
        quoted_passage_count=sum(1 for item in passages if item.quote_detected),
        quoted_with_citation_count=sum(1 for item in passages if item.quote_detected and item.citation_detected),
        quoted_without_citation_count=sum(1 for item in passages if item.quote_detected and not item.citation_detected),
        unquoted_with_citation_count=sum(1 for item in passages if not item.quote_detected and item.citation_detected),
        unquoted_without_citation_count=sum(1 for item in passages if not item.quote_detected and not item.citation_detected),
        high_match_unquoted_count=sum(1 for item in passages if not item.quote_detected and item.match_score >= 85),
        passages=list(passages),
        scope_note="test",
    )


def _passage(
    sentence: str,
    score: float,
    *,
    quoted: bool,
    cited: bool,
    marker: str | None = None,
) -> QuotePassageReview:
    return QuotePassageReview(
        document_sentence=sentence,
        match_score=score,
        citation_detected=cited,
        citation_marker=marker,
        quote_detected=quoted,
        quote_style="straight_double" if quoted else None,
        context_status=(
            "quoted_with_marker" if quoted and cited
            else "quoted_without_marker" if quoted
            else "unquoted_with_marker" if cited
            else "unquoted_without_marker"
        ),
    )


def _linkage(*links: CitationReferenceLink) -> ReferenceLinkageReview:
    return ReferenceLinkageReview(
        supplied_reference_count=1,
        linked_passage_count=sum(1 for link in links if link.link_status in {"linked", "ambiguous_link"}),
        unlinked_citation_count=sum(1 for link in links if link.link_status == "marker_unlinked"),
        doi_verified_reference_count=0,
        doi_metadata_review_count=0,
        verification_unavailable_count=0,
        links=tuple(links),
        scope_note="test",
    )


def test_high_overlap_unquoted_passage_is_high_attention() -> None:
    review = build_passage_review_matrix(
        _quote_review(_passage("Borrowed wording.", 94.0, quoted=False, cited=True, marker="(Perera, 2024)"))
    )

    assert review.high_attention_count == 1
    assert review.items[0].priority == "high_attention"
    assert "high_overlap_unquoted" in review.items[0].reasons


def test_quoted_passage_without_marker_is_high_attention() -> None:
    review = build_passage_review_matrix(
        _quote_review(_passage('"Direct wording."', 90.0, quoted=True, cited=False))
    )

    assert review.high_attention_count == 1
    assert "quoted_without_citation_marker" in review.items[0].reasons
    assert "citation_marker_missing" in review.items[0].reasons


def test_unlinked_citation_marker_is_attention_when_match_is_below_high_threshold() -> None:
    sentence = "Moderately similar paraphrase (Perera, 2024)."
    passage = _passage(sentence, 80.0, quoted=False, cited=True, marker="(Perera, 2024)")
    linkage = _linkage(
        CitationReferenceLink(
            document_sentence=sentence,
            match_score=80.0,
            citation_marker="(Perera, 2024)",
            link_status="marker_unlinked",
            references=(),
        )
    )

    review = build_passage_review_matrix(_quote_review(passage), linkage)

    assert review.attention_count == 1
    assert review.items[0].priority == "attention"
    assert "citation_not_linked_to_bibliography" in review.items[0].reasons


def test_metadata_mismatch_is_attention() -> None:
    sentence = "Moderately similar paraphrase (Perera, 2024)."
    passage = _passage(sentence, 80.0, quoted=False, cited=True, marker="(Perera, 2024)")
    reference = LinkedReference(
        index=1,
        raw="Perera, K. (2024). Source.",
        doi="10.1234/example",
        year="2024",
        author_key="perera",
        verification_status="verified_doi_metadata_review",
        verification_issues=("publication_year_mismatch",),
    )
    linkage = _linkage(
        CitationReferenceLink(
            document_sentence=sentence,
            match_score=80.0,
            citation_marker="(Perera, 2024)",
            link_status="linked",
            references=(reference,),
        )
    )

    review = build_passage_review_matrix(_quote_review(passage), linkage)

    assert review.attention_count == 1
    assert review.items[0].metadata_review_reference_count == 1
    assert "reference_metadata_review" in review.items[0].reasons


def test_quoted_cited_clean_link_is_contextualized() -> None:
    sentence = '"Direct wording" (Perera, 2024).'
    passage = _passage(sentence, 82.0, quoted=True, cited=True, marker="(Perera, 2024)")
    reference = LinkedReference(
        index=1,
        raw="Perera, K. (2024). Source.",
        doi="10.1234/example",
        year="2024",
        author_key="perera",
        verification_status="verified_doi",
    )
    linkage = _linkage(
        CitationReferenceLink(
            document_sentence=sentence,
            match_score=82.0,
            citation_marker="(Perera, 2024)",
            link_status="linked",
            references=(reference,),
        )
    )

    review = build_passage_review_matrix(_quote_review(passage), linkage)

    assert review.contextualized_count == 1
    assert review.items[0].priority == "contextualized"
    assert review.items[0].reasons == ()
    assert review.items[0].verified_reference_count == 1


def test_matrix_orders_high_attention_before_attention_before_contextualized() -> None:
    high = _passage("High overlap.", 95.0, quoted=False, cited=False)
    attention = _passage("Missing citation.", 78.0, quoted=False, cited=False)
    contextualized = _passage('"Quoted and cited" (Perera, 2024).', 76.0, quoted=True, cited=True, marker="(Perera, 2024)")

    review = build_passage_review_matrix(_quote_review(contextualized, attention, high))

    assert [item.priority for item in review.items] == ["high_attention", "attention", "contextualized"]
