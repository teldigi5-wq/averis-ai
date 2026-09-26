import pytest

from app.services.similarity import compare_texts


def test_identical_text_produces_strong_similarity() -> None:
    text = (
        "Machine learning can improve intrusion detection systems. "
        "Security teams can use these systems to identify suspicious behaviour."
    )
    report = compare_texts(text, text, "same")
    assert report.similarity_percent >= 95
    assert report.matched_passages
    assert report.document_hash == report.source_hash
    assert report.minhash_candidate_score == 100.0
    assert report.vector_candidate_score == 100.0
    assert report.candidate_provider == "hashing-lexical-v1"
    assert report.evidence_version == "m3-evidence-controls-v1"
    assert report.exclusions_applied == []
    assert report.min_match_words == 3
    assert report.document_words_original == report.document_words_analyzed
    assert report.document_words_excluded == 0


def test_unrelated_text_remains_low() -> None:
    left = "Network switches forward Ethernet frames using learned MAC addresses."
    right = "Photosynthesis converts light energy into chemical energy inside plants."
    report = compare_texts(left, right, "different")
    assert report.similarity_percent < 30
    assert report.minhash_candidate_score is not None
    assert report.minhash_candidate_score < 30
    assert report.vector_candidate_score is not None
    assert report.vector_candidate_score < 50


def test_quote_exclusion_reduces_quote_only_evidence() -> None:
    quoted = "Identity-aware access controls reduce lateral movement across distributed environments."
    document = (
        f'The literature states "{quoted}" '
        "This paper then evaluates a separate classroom deployment with original observations."
    )

    baseline = compare_texts(document, quoted, "quoted-source")
    filtered = compare_texts(
        document,
        quoted,
        "quoted-source",
        exclude_quotes=True,
    )

    assert baseline.similarity_percent > filtered.similarity_percent
    assert "quotes" in filtered.exclusions_applied
    assert filtered.document_words_excluded is not None
    assert filtered.document_words_excluded >= len(quoted.split())
    assert all("Identity-aware access controls" not in match.document_sentence for match in filtered.matched_passages)


def test_bibliography_exclusion_removes_reference_section_evidence() -> None:
    source = "Zero trust architecture requires continuous identity verification across enterprise systems."
    document = (
        "The main discussion evaluates student authentication usability in a laboratory setting.\n\n"
        "References\n"
        f"Smith, A. (2024). {source}"
    )

    baseline = compare_texts(document, source, "reference-entry")
    filtered = compare_texts(
        document,
        source,
        "reference-entry",
        exclude_bibliography=True,
    )

    assert baseline.similarity_percent > filtered.similarity_percent
    assert "bibliography" in filtered.exclusions_applied
    assert "References" not in " ".join(match.document_sentence for match in filtered.matched_passages)


def test_minimum_match_words_suppresses_short_exact_match_from_primary_score() -> None:
    short = "alpha beta gamma delta"

    baseline = compare_texts(short, short, "short", min_match_words=3)
    strict = compare_texts(short, short, "short", min_match_words=5)

    assert baseline.similarity_percent >= 95
    assert strict.similarity_percent == 0
    assert strict.shingle_jaccard == 0
    assert strict.sentence_match_score == 0
    assert strict.matched_passages == []
    # Candidate retrieval is shown separately and may still recognize lexical similarity.
    assert strict.vector_candidate_score == 100.0


def test_minimum_match_words_validation() -> None:
    with pytest.raises(ValueError):
        compare_texts("one two three", "one two three", "invalid", min_match_words=2)
