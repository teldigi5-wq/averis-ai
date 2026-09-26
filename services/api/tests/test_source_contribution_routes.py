from fastapi.testclient import TestClient

from app.main import app


def test_source_contribution_route_returns_unique_coverage() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/v1/similarity/contributions",
        json={
            "document_text": (
                "Network teams inspect suspicious traffic before escalation. "
                "Database engineers tune indexes to reduce application latency."
            ),
            "sources": [
                {
                    "source_name": "Security source",
                    "source_text": "Network teams inspect suspicious traffic before escalation.",
                },
                {
                    "source_name": "Database source",
                    "source_text": "Database engineers tune indexes to reduce application latency.",
                },
            ],
            "min_match_words": 5,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["matched_document_coverage_percent"] == 100.0
    assert payload["evidence_version"] == "m3-source-contributions-v1"
    assert len(payload["contributions"]) == 2
    assert sum(item["matched_sentence_count"] for item in payload["contributions"]) == 2
    assert "plagiarism percentage" in payload["evidence_note"]


def test_source_contribution_route_rejects_more_than_five_sources() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/v1/similarity/contributions",
        json={
            "document_text": "A sufficiently long sentence exists for this bounded request.",
            "sources": [
                {"source_name": f"Source {index}", "source_text": "A sufficiently long source sentence exists here."}
                for index in range(6)
            ],
        },
    )
    assert response.status_code == 422
