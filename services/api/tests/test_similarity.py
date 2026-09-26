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
    assert report.evidence_version == "m2-candidate-foundation-v1"


def test_unrelated_text_remains_low() -> None:
    left = "Network switches forward Ethernet frames using learned MAC addresses."
    right = "Photosynthesis converts light energy into chemical energy inside plants."
    report = compare_texts(left, right, "different")
    assert report.similarity_percent < 30
    assert report.minhash_candidate_score is not None
    assert report.minhash_candidate_score < 30
    assert report.vector_candidate_score is not None
    assert report.vector_candidate_score < 50
