from app.schemas.similarity import PassageMatch
from app.services.citation_context import analyze_citation_coverage


def test_citation_coverage_detects_author_year_and_numeric_markers() -> None:
    first = "Continuous verification should be applied to protected access requests."
    second = "Least privilege reduces the impact of compromised accounts."
    document = f"{first} (Perera, 2024) The report continues. {second} [12]"
    matches = [
        PassageMatch(document_sentence=first, source_sentence=first, score=98.0),
        PassageMatch(document_sentence=second, source_sentence=second, score=91.0),
    ]

    review = analyze_citation_coverage(document, matches, context_chars=40)

    assert review.matched_passage_count == 2
    assert review.citation_detected_count == 2
    assert review.uncited_match_count == 0
    assert review.citation_coverage_percent == 100.0
    assert all(item.citation_detected for item in review.passages)


def test_citation_coverage_surfaces_uncited_matches() -> None:
    sentence = "The framework requires continuous monitoring of privileged sessions."
    matches = [PassageMatch(document_sentence=sentence, source_sentence=sentence, score=95.0)]

    review = analyze_citation_coverage(sentence, matches)

    assert review.matched_passage_count == 1
    assert review.citation_detected_count == 0
    assert review.uncited_match_count == 1
    assert review.citation_coverage_percent == 0.0
    assert review.passages[0].citation_marker is None
