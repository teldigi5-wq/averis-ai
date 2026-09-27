from app.schemas.similarity import PassageMatch
from app.services.citation_context import analyze_citation_coverage
from app.services.quote_context import analyze_quote_context


def _coverage(document: str, sentence: str, *, score: float = 94.0):
    matches = [
        PassageMatch(
            document_sentence=sentence,
            source_sentence="Continuous verification is required for every protected resource and access request.",
            score=score,
        )
    ]
    return analyze_citation_coverage(document, matches)


def test_detects_curly_quoted_passage_with_citation_marker() -> None:
    sentence = "“Continuous verification is required for every protected resource and access request” (Perera, 2024)."
    review = analyze_quote_context(sentence, _coverage(sentence, sentence).passages)

    assert review.quoted_passage_count == 1
    assert review.quoted_with_citation_count == 1
    assert review.quoted_without_citation_count == 0
    assert review.passages[0].quote_detected is True
    assert review.passages[0].context_status == "quoted_with_marker"


def test_flags_quoted_match_without_nearby_citation() -> None:
    sentence = '"Continuous verification is required for every protected resource and access request."'
    review = analyze_quote_context(sentence, _coverage(sentence, sentence).passages)

    assert review.quoted_without_citation_count == 1
    assert review.unquoted_without_citation_count == 0
    assert review.passages[0].quote_style == "straight_double"


def test_counts_high_overlap_unquoted_match_without_calling_it_misconduct() -> None:
    sentence = "Continuous verification is required for every protected resource and access request (Perera, 2024)."
    review = analyze_quote_context(sentence, _coverage(sentence, sentence, score=91.0).passages)

    assert review.quoted_passage_count == 0
    assert review.unquoted_with_citation_count == 1
    assert review.high_match_unquoted_count == 1
    assert review.passages[0].context_status == "unquoted_with_marker"
    assert "not a misconduct verdict" in review.scope_note


def test_low_match_unquoted_passage_does_not_raise_high_match_count() -> None:
    sentence = "Continuous verification is required for every protected resource and access request."
    review = analyze_quote_context(sentence, _coverage(sentence, sentence, score=72.0).passages)

    assert review.unquoted_without_citation_count == 1
    assert review.high_match_unquoted_count == 0
