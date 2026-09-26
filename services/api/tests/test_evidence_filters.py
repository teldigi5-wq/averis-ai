from app.services.evidence_filters import apply_evidence_filters


def test_quote_exclusion_removes_explicit_double_quoted_span() -> None:
    text = 'The analysis says “quoted evidence should be excluded here”. The conclusion remains original.'
    result = apply_evidence_filters(text, exclude_quotes=True)

    assert "quoted evidence" not in result.text
    assert "The conclusion remains original" in result.text
    assert result.exclusions_applied == ("quotes",)
    assert result.excluded_words > 0
    assert result.analyzed_words < result.original_words


def test_straight_quote_exclusion_does_not_strip_apostrophes() -> None:
    text = 'The student\'s paper says "this exact quoted passage is sourced" and then evaluates it.'
    result = apply_evidence_filters(text, exclude_quotes=True)

    assert "student's paper" in result.text
    assert "exact quoted passage" not in result.text
    assert result.exclusions_applied == ("quotes",)


def test_bibliography_exclusion_requires_standalone_heading() -> None:
    text = "Original discussion remains here.\n\nReferences\nSmith, A. (2024). Matched source title."
    result = apply_evidence_filters(text, exclude_bibliography=True)

    assert result.text == "Original discussion remains here."
    assert result.exclusions_applied == ("bibliography",)

    prose = "This paragraph discusses references and bibliography design in the main argument."
    unchanged = apply_evidence_filters(prose, exclude_bibliography=True)
    assert unchanged.text == prose
    assert unchanged.exclusions_applied == ()


def test_requested_filter_is_not_reported_when_nothing_was_detected() -> None:
    text = "No quoted material or bibliography heading appears in this paragraph."
    result = apply_evidence_filters(
        text,
        exclude_quotes=True,
        exclude_bibliography=True,
    )

    assert result.text == text
    assert result.exclusions_applied == ()
    assert result.excluded_words == 0
