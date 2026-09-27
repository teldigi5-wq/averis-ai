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
    assert payload["evidence_version"] == "ai-evidence-v5"
    assert payload["ai_enabled"] is False
    assert payload["writing"]["word_count"] > 20
    assert payload["source_evidence"]["exact_overlap_percent"] > 0
    assert payload["source_evidence"]["semantic_calibrated"] is False
    assert payload["source_evidence"]["semantic_calibration_id"] is None
    assert payload["source_evidence"]["overlap_review_band"] in {"low review", "review", "high review"}
    assert payload["citation_review"] is not None
    assert payload["citation_review"]["matched_passage_count"] >= 1
    assert payload["citation_review"]["uncited_match_count"] >= 1
    assert payload["quote_review"] is not None
    assert payload["quote_review"]["matched_passage_count"] >= 1
    assert payload["quote_review"]["high_match_unquoted_count"] >= 1
    assert payload["reference_linkage"] is None
    assert payload["revision_actions"]
    assert any("citation" in action.casefold() or "attribution" in action.casefold() for action in payload["revision_actions"])
    assert "not proof of authorship" in payload["caution"].lower()
    assert "uncalibrated semantic scores do not change review bands" in payload["caution"].lower()
    assert "quote detection" in payload["caution"].lower()


def test_revision_route_links_nearby_citation_to_supplied_bibliography() -> None:
    document = (
        "Cloud security programs should verify every access request and continuously evaluate resource trust (Perera, 2024). "
        "Teams should document exceptions and review privileges before approval."
    )
    response = client.post(
        "/api/v1/ai/revision/analyze",
        json={
            "text": document,
            "source_text": "Cloud security programs should verify every access request and continuously evaluate resource trust.",
            "source_name": "Course source",
            "references_text": "Perera, K. (2024). Zero trust operations. Journal of Cloud Security.",
            "verify_linked_references": False,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    linkage = payload["reference_linkage"]
    assert linkage is not None
    assert linkage["supplied_reference_count"] == 1
    assert linkage["linked_passage_count"] >= 1
    linked = [item for item in linkage["links"] if item["link_status"] == "linked"]
    assert linked
    assert linked[0]["references"][0]["verification_status"] == "linked_local_only"
    assert any("Reference Audit" in action for action in payload["revision_actions"])


def test_revision_route_reports_quoted_match_context() -> None:
    document = (
        '"Cloud security programs should verify every access request and continuously evaluate resource trust." '
        "(Perera, 2024) Teams should document exceptions and review privileges before approval."
    )
    response = client.post(
        "/api/v1/ai/revision/analyze",
        json={
            "text": document,
            "source_text": "Cloud security programs should verify every access request and continuously evaluate resource trust.",
            "source_name": "Course source",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    quote_review = payload["quote_review"]
    assert quote_review is not None
    assert quote_review["quoted_passage_count"] >= 1
    assert quote_review["quoted_with_citation_count"] >= 1


def test_revision_route_rejects_tiny_samples() -> None:
    response = client.post(
        "/api/v1/ai/revision/analyze",
        json={"text": "Too short."},
    )

    assert response.status_code == 422
