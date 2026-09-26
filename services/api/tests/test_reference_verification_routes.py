from fastapi.testclient import TestClient

from app.api.routes import references
from app.main import app
from app.services.source_metadata import SourceMetadata


class FakeCrossref:
    async def resolve_doi(self, doi: str) -> SourceMetadata | None:
        return SourceMetadata(
            provider="crossref",
            external_id=doi,
            title="Verified scholarly source",
            doi=doi,
            published_year=2024,
            authors=("Ada Student",),
        )

    async def search(self, query: str, *, limit: int = 1) -> list[SourceMetadata]:
        return [
            SourceMetadata(
                provider="crossref",
                external_id="10.9000/candidate",
                title="Citation Verification Systems",
                doi="10.9000/candidate",
                published_year=2024,
                authors=("Ada Student",),
            )
        ]


def test_reference_verify_endpoint_returns_external_evidence(monkeypatch) -> None:
    monkeypatch.setattr(references, "_crossref_client", lambda: FakeCrossref())
    client = TestClient(app)
    response = client.post(
        "/api/v1/references/verify",
        json={
            "references_text": "Student, A. (2024). Verified scholarly source. https://doi.org/10.9000/VERIFIED",
            "limit": 5,
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["provider"] == "crossref"
    assert payload["cost_policy"] == "public-no-key"
    assert payload["checked_count"] == 1
    assert payload["results"][0]["status"] == "verified_doi"
    assert payload["results"][0]["source"]["doi"] == "10.9000/verified"
    assert "not proof" in payload["scope_note"].lower()


def test_reference_verify_endpoint_bounds_limit() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/v1/references/verify",
        json={"references_text": "Student, A. (2024). Example.", "limit": 11},
    )
    assert response.status_code == 422
