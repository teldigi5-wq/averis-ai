from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_reference_parse_endpoint_returns_review_metadata() -> None:
    response = client.post(
        "/api/v1/references/parse",
        json={
            "references_text": (
                "Smith, J. (2020). Network security evidence. https://doi.org/10.1000/ABC.1\n"
                "Jones, A. (2021). Academic integrity systems."
            )
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == 2
    assert payload["references"][0]["doi"] == "10.1000/abc.1"
    assert "review" in payload["scope_note"].lower()


def test_reference_audit_endpoint_reports_consistency_findings() -> None:
    response = client.post(
        "/api/v1/references/audit",
        json={
            "document_text": "Smith (2020) supports this. Missing (2024) is also cited.",
            "references_text": (
                "Smith, J. (2020). Network security evidence.\n"
                "Jones, A. (2021). Academic integrity systems."
            ),
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["matched_citation_count"] == 1
    assert payload["matched_author_year_citation_count"] == 1
    assert payload["matched_numeric_citation_count"] == 0
    assert payload["citation_styles_detected"] == ["author-year"]
    assert payload["unmatched_citations"][0]["author_key"] == "missing"
    assert payload["uncited_references"][0]["author_key"] == "jones"
    assert "author-year" in payload["scope_note"]


def test_reference_audit_endpoint_reports_numeric_citation_findings() -> None:
    response = client.post(
        "/api/v1/references/audit",
        json={
            "document_text": "Prior work [1] is extended by [2-4].",
            "references_text": (
                "[1] First source.\n"
                "[2] Second source.\n"
                "[3] Third source."
            ),
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["citation_styles_detected"] == ["numeric-bracket"]
    assert payload["matched_numeric_citation_count"] == 1
    assert payload["numeric_citations"][0]["numbers"] == [1]
    assert payload["numeric_citations"][1]["numbers"] == [2, 3, 4]
    assert payload["unmatched_numeric_citations"][0]["missing_reference_numbers"] == [4]
    assert "square-bracket" in payload["scope_note"]


def test_reference_endpoint_enforces_payload_limit() -> None:
    response = client.post(
        "/api/v1/references/parse",
        json={"references_text": "x" * 25_001},
    )
    assert response.status_code == 422
