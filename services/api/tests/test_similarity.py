from app.services.similarity import compare_texts


def test_identical_text_produces_strong_similarity() -> None:
    text = (
        "Machine learning can improve intrusion detection systems. "
        "Security teams can use these systems to identify suspicious behaviour."
    )
    report = compare_texts(text, text, "same")
    assert report.similarity_percent >= 95
    assert report.matched_passages


def test_unrelated_text_remains_low() -> None:
    left = "Network switches forward Ethernet frames using learned MAC addresses."
    right = "Photosynthesis converts light energy into chemical energy inside plants."
    report = compare_texts(left, right, "different")
    assert report.similarity_percent < 30
