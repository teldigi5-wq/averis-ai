from app.services.references import (
    audit_citation_consistency,
    extract_author_year_citations,
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


def test_audit_flags_unmatched_citations_and_uncited_references() -> None:
    document = "Smith (2020) supports the method, while Missing (2024) reports another result."
    references = """Smith, J. (2020). Network security evidence.
Jones, A. (2021). Academic integrity systems."""
    audit = audit_citation_consistency(document, references)
    assert audit.matched_citation_count == 1
    assert [(item.author_key, item.year) for item in audit.unmatched_citations] == [("missing", "2024")]
    assert [(item.author_key, item.year) for item in audit.uncited_references] == [("jones", "2021")]


def test_empty_reference_block_returns_no_entries() -> None:
    assert parse_reference_block("   \n\n  ") == []
