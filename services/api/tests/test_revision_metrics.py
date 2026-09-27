from app.services.revision_metrics import (
    analyze_writing_style,
    build_revision_actions,
    cosine_percent,
    overlap_review_band,
)
from app.services.similarity import compare_texts


def test_revision_metrics_surface_repetition_and_uniformity_without_authorship_verdict() -> None:
    text = (
        "This study shows the result. This study shows the method. This study shows the evidence. "
        "This study shows the result. This study shows the method. This study shows the evidence."
    )
    metrics = analyze_writing_style(text)

    assert metrics.word_count > 20
    assert metrics.sentence_count == 6
    assert metrics.repeated_trigram_ratio_percent > 0
    assert 0 <= metrics.style_uniformity_signal <= 100
    assert metrics.style_uniformity_band in {"low review", "review", "high review"}


def test_revision_actions_prioritize_source_attribution_for_close_overlap() -> None:
    source = "Continuous verification is required for every protected cloud resource and every access request."
    document = source + " The report then discusses the operational impact of this control."
    report = compare_texts(document, source, "Example source")
    metrics = analyze_writing_style(document)

    actions = build_revision_actions(metrics, report, semantic_similarity=None)

    assert actions
    assert any("cite" in action.casefold() or "attribution" in action.casefold() for action in actions)
    assert any("original analysis" in action.casefold() for action in actions)


def test_uncalibrated_semantic_score_does_not_change_review_band() -> None:
    document = "Independent student analysis discusses architecture tradeoffs and deployment constraints."
    source = "A completely different source explains agricultural irrigation scheduling and soil moisture."
    report = compare_texts(document, source, "Different source")

    baseline = overlap_review_band(report, None)
    uncalibrated = overlap_review_band(report, 99.9)

    assert baseline == "low review"
    assert uncalibrated == baseline


def test_calibrated_semantic_score_can_raise_review_band() -> None:
    document = "Independent student analysis discusses architecture tradeoffs and deployment constraints."
    source = "A completely different source explains agricultural irrigation scheduling and soil moisture."
    report = compare_texts(document, source, "Different source")

    review = overlap_review_band(
        report,
        74.0,
        semantic_review_threshold=72.0,
        semantic_high_review_threshold=88.0,
    )
    high = overlap_review_band(
        report,
        91.0,
        semantic_review_threshold=72.0,
        semantic_high_review_threshold=88.0,
    )

    assert review == "review"
    assert high == "high review"


def test_cosine_percent_is_bounded_and_handles_invalid_vectors() -> None:
    assert cosine_percent([1.0, 0.0], [1.0, 0.0]) == 100.0
    assert cosine_percent([1.0, 0.0], [0.0, 1.0]) == 0.0
    assert cosine_percent([], []) is None
    assert cosine_percent([1.0], [1.0, 0.0]) is None
