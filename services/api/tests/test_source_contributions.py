from app.services.source_contributions import calculate_source_contributions


def test_contributions_assign_each_document_sentence_to_one_source() -> None:
    document = (
        "Network security teams inspect suspicious traffic before escalation. "
        "Database engineers tune query indexes to reduce application latency."
    )
    report = calculate_source_contributions(
        document_text=document,
        sources=[
            ("Security paper", "Network security teams inspect suspicious traffic before escalation."),
            ("Database paper", "Database engineers tune query indexes to reduce application latency."),
        ],
        min_match_words=5,
    )

    assert report.total_matched_words == report.document_words_analyzed
    assert report.matched_document_coverage_percent == 100.0
    assert len(report.contributions) == 2
    assert all(item.matched_sentence_count == 1 for item in report.contributions)
    assert round(sum(item.document_coverage_percent for item in report.contributions), 1) == 100.0
    assert all(item.average_passage_score == 100.0 for item in report.contributions)


def test_overlapping_sources_do_not_double_count_same_sentence() -> None:
    document = "Security analysts investigate suspicious authentication activity before escalation."
    source = "Security analysts investigate suspicious authentication activity before escalation."
    report = calculate_source_contributions(
        document_text=document,
        sources=[("First source", source), ("Duplicate source", source)],
    )

    by_name = {item.source_name: item for item in report.contributions}
    assert report.matched_document_coverage_percent == 100.0
    assert by_name["First source"].matched_sentence_count == 1
    assert by_name["Duplicate source"].matched_sentence_count == 0
    assert sum(item.matched_word_count for item in report.contributions) == report.total_matched_words


def test_contributions_apply_quote_and_bibliography_controls() -> None:
    document = (
        '"Quoted evidence should not count when excluded."\n'
        "Original discussion remains unmatched by either supplied source.\n"
        "References\n"
        "Bibliography evidence sentence appears only in the source."
    )
    report = calculate_source_contributions(
        document_text=document,
        sources=[
            (
                "Quoted and bibliography source",
                "Quoted evidence should not count when excluded. Bibliography evidence sentence appears only in the source.",
            )
        ],
        exclude_quotes=True,
        exclude_bibliography=True,
    )

    assert set(report.exclusions_applied) == {"quotes", "bibliography"}
    assert report.document_words_excluded > 0
    assert report.total_matched_words == 0
    assert report.matched_document_coverage_percent == 0.0
