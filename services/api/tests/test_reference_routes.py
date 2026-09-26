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
    assert payload["unmatched_citations"][0]["author_key"] == "missing"
    assert payload["uncited_references"][0]["author_key"] == "jones"
    assert "author-year" in payload["scope_note"]


def test_reference_endpoint_enforces_payload_limit() -> None:
    response = client.post(
        "/api/v1/references/parse",
        json={"references_text": "x" * 25_001},
    )
    assert response.status_code == 422
