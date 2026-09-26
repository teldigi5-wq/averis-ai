from app.services.source_metadata import (
    normalize_doi,
    source_from_crossref,
    source_from_openalex,
)


def test_normalize_doi_accepts_common_forms() -> None:
    expected = "10.1000/xyz123"
    assert normalize_doi("10.1000/XYZ123") == expected
    assert normalize_doi("doi:10.1000/XYZ123") == expected
    assert normalize_doi("https://doi.org/10.1000/XYZ123") == expected
    assert normalize_doi("not-a-doi") is None


def test_crossref_metadata_is_normalized() -> None:
    record = source_from_crossref(
        {
            "DOI": "10.5555/ABC.DEF",
            "title": ["Evidence-Based Similarity Analysis"],
            "URL": "https://doi.org/10.5555/ABC.DEF",
            "published-online": {"date-parts": [[2026, 4, 2]]},
            "author": [{"given": "Ada", "family": "Lovelace"}],
            "publisher": "Example Press",
            "type": "journal-article",
        }
    )
    assert record.provider == "crossref"
    assert record.doi == "10.5555/abc.def"
    assert record.title == "Evidence-Based Similarity Analysis"
    assert record.published_year == 2026
    assert record.authors == ("Ada Lovelace",)
    assert len(record.identity) == 64


def test_openalex_metadata_is_normalized() -> None:
    record = source_from_openalex(
        {
            "id": "https://openalex.org/W123",
            "display_name": "Transparent Academic Integrity Systems",
            "doi": "https://doi.org/10.7777/AVERIS.1",
            "publication_year": 2025,
            "authorships": [{"author": {"display_name": "Grace Hopper"}}],
            "primary_location": {"landing_page_url": "https://example.org/paper"},
            "type": "article",
            "open_access": {"is_oa": True},
        }
    )
    assert record.provider == "openalex"
    assert record.external_id == "https://openalex.org/W123"
    assert record.doi == "10.7777/averis.1"
    assert record.authors == ("Grace Hopper",)
    assert record.url == "https://example.org/paper"
