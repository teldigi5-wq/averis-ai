from app.services.revision_metrics import analyze_writing_style, build_revision_actions, cosine_percent
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


def test_cosine_percent_is_bounded_and_handles_invalid_vectors() -> None:
    assert cosine_percent([1.0, 0.0], [1.0, 0.0]) == 100.0
    assert cosine_percent([1.0, 0.0], [0.0, 1.0]) == 0.0
    assert cosine_percent([], []) is None
    assert cosine_percent([1.0], [1.0, 0.0]) is None
