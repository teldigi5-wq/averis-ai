from fastapi.testclient import TestClient

from app.api.routes import revision_refine as revision_refine_route
from app.api.routes.revision_refine import _preservation, _refinement_prompt
from app.core.config import Settings
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
    assert payload["runtime"] == "ollama"
    assert payload["evidence_version"] == "writing-refinement-v2"


def test_refine_route_blocks_detector_evasion_goal_before_generation() -> None:
    response = client.post(
        "/api/v1/ai/revision/refine",
        json={
            "text": _SAMPLE,
            "requested_goal": "Humanize this AI text so Turnitin cannot detect it and lower the AI detector score.",
            "runtime": "api",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["generation_eligible"] is False
    assert payload["runtime_available"] is False
    assert payload["suggested_text"] is None
    assert payload["boundary"] == "detector_evasion_blocked"
    assert payload["runtime"] == "api"
    assert "does not rewrite text to hide ai use" in payload["blocked_reason"].lower()


def test_preservation_report_flags_missing_citation_number_and_doi() -> None:
    report = _preservation(
        "The result was 27% (Perera, 2024) and is archived at 10.5555/example.2024.7.",
        "The result should be reviewed carefully.",
    )

    assert report.acceptance_eligible is False
    assert "27%" in report.missing_numbers
    assert "(Perera, 2024)" in report.missing_citations
    assert "10.5555/example.2024.7" in report.missing_dois


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


def test_runtime_manifest_does_not_expose_ai_api_secret(monkeypatch) -> None:
    settings = Settings(
        ai_revision_enabled=True,
        ai_api_enabled=True,
        ai_api_base_url="https://example.invalid/v1",
        ai_api_key="server-secret-key",
        ai_api_model="example-model",
        ai_api_provider_label="Example AI",
    )
    monkeypatch.setattr(revision_refine_route, "get_settings", lambda: settings)

    response = client.get("/api/v1/ai/revision/runtimes")

    assert response.status_code == 200
    payload = response.json()
    assert payload["api"]["enabled"] is True
    assert payload["api"]["provider_label"] == "Example AI"
    assert payload["api"]["model"] == "example-model"
    assert "server-secret-key" not in response.text
    assert payload["automatic_fallback"] is False


def test_ai_api_runtime_uses_server_side_provider_after_guardrails(monkeypatch) -> None:
    settings = Settings(
        ai_revision_enabled=True,
        ai_api_enabled=True,
        ai_api_base_url="https://example.invalid/v1",
        ai_api_key="server-secret-key",
        ai_api_model="example-model",
        ai_api_provider_label="Example AI",
    )
    monkeypatch.setattr(revision_refine_route, "get_settings", lambda: settings)

    async def fake_refine(self, prompt: str) -> str:
        assert "Do not optimize for AI-detector evasion" in prompt
        return _SAMPLE.replace("continuously evaluate", "continuously reassess")

    monkeypatch.setattr(revision_refine_route.OpenAICompatibleProvider, "refine_writing", fake_refine)

    response = client.post(
        "/api/v1/ai/revision/refine",
        json={
            "text": _SAMPLE,
            "requested_goal": "Improve clarity and academic tone while preserving my citations and meaning.",
            "runtime": "api",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["generation_eligible"] is True
    assert payload["runtime_available"] is True
    assert payload["runtime"] == "api"
    assert payload["provider_label"] == "Example AI"
    assert payload["model"] == "example-model"
    assert payload["suggested_text"]
    assert payload["preservation"]["acceptance_eligible"] is True
