from fastapi.testclient import TestClient

from app.api.routes.revision_refine import _preservation, _refinement_prompt
from app.main import app
from app.schemas.revision_refine import RevisionRefineRequest


client = TestClient(app)


_SAMPLE = (
    "Cloud security programs should verify every access request and continuously evaluate resource trust. "
    "Perera (2024) argues that privileged access also requires documented review. "
    "The study reported a 27% reduction in unresolved access exceptions after the control was introduced."
)


def test_refine_route_fails_open_when_optional_ollama_runtime_is_disabled() -> None:
    response = client.post(
        "/api/v1/ai/revision/refine",
        json={
            "text": _SAMPLE,
            "requested_goal": "Improve clarity and academic tone while preserving my citations and meaning.",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["generation_eligible"] is True
    assert payload["runtime_available"] is False
    assert payload["suggested_text"] is None
    assert payload["boundary"] == "ollama_runtime_unavailable"
    assert payload["evidence_version"] == "writing-refinement-v1"


def test_refine_route_blocks_detector_evasion_goal_before_generation() -> None:
    response = client.post(
        "/api/v1/ai/revision/refine",
        json={
            "text": _SAMPLE,
            "requested_goal": "Humanize this AI text so Turnitin cannot detect it and lower the AI detector score.",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["generation_eligible"] is False
    assert payload["runtime_available"] is False
    assert payload["suggested_text"] is None
    assert payload["boundary"] == "detector_evasion_blocked"
    assert "does not rewrite text to hide ai use" in payload["blocked_reason"].lower()


def test_preservation_report_flags_missing_citation_and_number() -> None:
    report = _preservation(
        "The result was 27% (Perera, 2024) and should be reviewed carefully.",
        "The result should be reviewed carefully.",
    )

    assert report.acceptance_eligible is False
    assert "27%" in report.missing_numbers
    assert "(Perera, 2024)" in report.missing_citations


def test_refinement_prompt_keeps_integrity_boundary_explicit() -> None:
    prompt = _refinement_prompt(
        RevisionRefineRequest(
            text=_SAMPLE,
            requested_goal="Improve clarity and sentence flow.",
            strength="light",
        )
    )

    assert "Do not optimize for AI-detector evasion" in prompt
    assert "Preserve every citation marker" in prompt
    assert "Return only the revised text" in prompt
    assert "Make only light edits" in prompt
