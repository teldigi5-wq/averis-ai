from app.services.references import (
    audit_citation_consistency,
    extract_author_year_citations,
    extract_numeric_citations,
    parse_reference_block,
)


def test_parse_reference_block_extracts_author_year_and_doi() -> None:
    references = """Smith, J. (2020). Network security evidence. Journal of Security. https://doi.org/10.1000/ABC.1
Jones, A. (2021). Academic integrity systems. Computing Review."""
    parsed = parse_reference_block(references)
    assert len(parsed) == 2
    assert parsed[0].author_key == "smith"
    assert parsed[0].year == "2020"
    assert parsed[0].doi == "10.1000/abc.1"
    assert "doi_not_detected" in parsed[1].warnings


def test_parse_reference_block_preserves_wrapped_entry() -> None:
    references = """Smith, J. (2020). A long reference title that wraps
across a second line before the journal details.
Jones, A. (2021). A second reference."""
    parsed = parse_reference_block(references)
    assert len(parsed) == 2
    assert "wraps across a second line" in parsed[0].raw


def test_extract_author_year_citations_supports_parenthetical_and_narrative() -> None:
    text = (
        "Prior work supports this claim (Smith, 2020; Jones et al., 2021). "
        "Brown (2022) reported a related result."
    )
    mentions = extract_author_year_citations(text)
    keys = {(mention.author_key, mention.year) for mention in mentions}
    assert ("smith", "2020") in keys
    assert ("jones", "2021") in keys
    assert ("brown", "2022") in keys


def test_extract_numeric_citations_expands_lists_and_ranges_conservatively() -> None:
    text = (
        "The baseline follows prior work [1]. Related approaches appear in [2, 4] and [5-7]. "
        "The dataset label [2024] is not a citation candidate."
    )
    mentions = extract_numeric_citations(text)
    assert [mention.raw for mention in mentions] == ["[1]", "[2, 4]", "[5-7]"]
    assert [mention.numbers for mention in mentions] == [(1,), (2, 4), (5, 6, 7)]


def test_extract_numeric_citations_rejects_descending_or_unbounded_ranges() -> None:
    text = "Malformed ranges [5-2] and [1-999] should not become citation findings."
    assert extract_numeric_citations(text) == []


def test_audit_flags_unmatched_citations_and_uncited_references() -> None:
    document = "Smith (2020) supports the method, while Missing (2024) reports another result."
    references = """Smith, J. (2020). Network security evidence.
Jones, A. (2021). Academic integrity systems."""
    audit = audit_citation_consistency(document, references)
    assert audit.matched_citation_count == 1
    assert audit.matched_author_year_citation_count == 1
    assert audit.matched_numeric_citation_count == 0
    assert audit.citation_styles_detected == ("author-year",)
    assert [(item.author_key, item.year) for item in audit.unmatched_citations] == [("missing", "2024")]
    assert [(item.author_key, item.year) for item in audit.uncited_references] == [("jones", "2021")]


def test_numeric_audit_uses_reference_order_and_reports_missing_numbers() -> None:
    document = "The method follows [1]. Related work is summarized in [2, 4]. A broader review appears in [3-5]."
    references = """[1] Alpha, A. First source.
[2] Beta, B. Second source.
[3] Gamma, G. Third source.
[4] Delta, D. Fourth source."""

    audit = audit_citation_consistency(document, references)

    assert audit.citation_styles_detected == ("numeric-bracket",)
    assert audit.matched_author_year_citation_count == 0
    assert audit.matched_numeric_citation_count == 2
    assert audit.matched_citation_count == 2
    assert len(audit.numeric_citations) == 3
    assert len(audit.unmatched_numeric_citations) == 1
    finding = audit.unmatched_numeric_citations[0]
    assert finding.citation.raw == "[3-5]"
    assert finding.citation.numbers == (3, 4, 5)
    assert finding.missing_reference_numbers == (5,)
    assert audit.uncited_references == ()


def test_numeric_audit_can_mark_ordered_reference_uncited_without_author_year_metadata() -> None:
    document = "Only the first source is cited [1]."
    references = """[1] First source without a year.
[2] Second source without a year."""

    audit = audit_citation_consistency(document, references)

    assert [reference.index for reference in audit.uncited_references] == [2]


def test_mixed_author_year_and_numeric_styles_share_uncited_reference_accounting() -> None:
    document = "Smith (2020) supports the method. A second source is cited numerically [2]."
    references = """Smith, J. (2020). First source.
[2] Jones, A. Second source."""

    audit = audit_citation_consistency(document, references)

    assert audit.citation_styles_detected == ("author-year", "numeric-bracket")
    assert audit.matched_author_year_citation_count == 1
    assert audit.matched_numeric_citation_count == 1
    assert audit.matched_citation_count == 2
    assert audit.uncited_references == ()


def test_empty_reference_block_returns_no_entries() -> None:
    assert parse_reference_block("   \n\n  ") == []
