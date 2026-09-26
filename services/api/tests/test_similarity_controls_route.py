from fastapi.testclient import TestClient

from app.main import app


def test_similarity_route_exposes_evidence_controls() -> None:
    client = TestClient(app)
    quoted = "Cloud access policies require continuous verification for every protected resource."
    response = client.post(
        "/api/v1/similarity/compare",
        json={
            "document_text": f'An author wrote "{quoted}" The student then provides an independent evaluation.',
            "source_text": quoted,
            "source_name": "example",
            "document_name": "draft.txt",
            "exclude_quotes": True,
            "exclude_bibliography": False,
            "min_match_words": 6,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["min_match_words"] == 6
    assert "quotes" in payload["exclusions_applied"]
    assert payload["document_words_excluded"] > 0
    assert payload["scan_id"] is None
    assert payload["credits_remaining"] is None
    assert payload["evidence_version"] == "m3-evidence-controls-v1"


def test_similarity_route_rejects_unsafe_match_threshold() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/v1/similarity/compare",
        json={
            "document_text": "one two three four five",
            "source_text": "one two three four five",
            "min_match_words": 2,
        },
    )

    assert response.status_code == 422
