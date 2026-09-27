from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_revision_route_returns_deterministic_metrics_when_ai_flag_is_off() -> None:
    response = client.post(
        "/api/v1/ai/revision/analyze",
        json={
            "text": (
                "Cloud security programs should verify every access request and continuously evaluate resource trust. "
                "Teams should also document exceptions, review privileges, and record why a control is necessary. "
                "A student can then compare these controls with the evidence required by the assignment."
            ),
            "source_text": (
                "Cloud security programs should verify every access request and continuously evaluate resource trust. "
                "Privileged access should be reviewed and documented."
            ),
            "source_name": "Course source",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["evidence_version"] == "ai-evidence-v3"
    assert payload["ai_enabled"] is False
    assert payload["writing"]["word_count"] > 20
    assert payload["source_evidence"]["exact_overlap_percent"] > 0
    assert payload["source_evidence"]["semantic_calibrated"] is False
    assert payload["source_evidence"]["semantic_calibration_id"] is None
    assert payload["source_evidence"]["overlap_review_band"] in {"low review", "review", "high review"}
    assert payload["citation_review"] is not None
    assert payload["citation_review"]["matched_passage_count"] >= 1
    assert payload["citation_review"]["uncited_match_count"] >= 1
    assert payload["revision_actions"]
    assert any("citation" in action.casefold() or "attribution" in action.casefold() for action in payload["revision_actions"])
    assert "not proof of authorship" in payload["caution"].lower()
    assert "uncalibrated semantic scores do not change review bands" in payload["caution"].lower()


def test_revision_route_rejects_tiny_samples() -> None:
    response = client.post(
        "/api/v1/ai/revision/analyze",
        json={"text": "Too short."},
    )

    assert response.status_code == 422
