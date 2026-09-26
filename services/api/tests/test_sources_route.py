from fastapi.testclient import TestClient

from app.api.routes import sources
from app.main import app
from app.services.source_metadata import SourceMetadata


class FakeCrossrefClient:
    async def search(self, query: str, *, limit: int = 5) -> list[SourceMetadata]:
        assert query == "network security"
        assert limit == 2
        return [
            SourceMetadata(
                provider="crossref",
                external_id="10.1000/test.1",
                title="Network Security Evidence",
                doi="10.1000/test.1",
                published_year=2026,
                authors=("Ada Lovelace",),
                metadata={"score": 51.25},
            )
        ]

    async def resolve_doi(self, doi: str) -> SourceMetadata | None:
        if doi == "10.1000/missing":
            return None
        return SourceMetadata(
            provider="crossref",
            external_id=doi,
            title="Resolved Source",
            doi=doi,
            metadata={},
        )


def test_source_search_returns_bounded_normalized_results(monkeypatch) -> None:
    monkeypatch.setattr(sources, "_client", lambda: FakeCrossrefClient())
    client = TestClient(app)
    response = client.get("/api/v1/sources/search", params={"q": "network security", "limit": 2})
    assert response.status_code == 200
    payload = response.json()
    assert payload["provider"] == "crossref"
    assert payload["cost_policy"] == "public-no-key"
    assert payload["results"][0]["doi"] == "10.1000/test.1"
    assert payload["results"][0]["relevance_score"] == 51.25


def test_source_resolve_returns_record(monkeypatch) -> None:
    monkeypatch.setattr(sources, "_client", lambda: FakeCrossrefClient())
    client = TestClient(app)
    response = client.get("/api/v1/sources/resolve", params={"doi": "https://doi.org/10.1000/TEST.2"})
    assert response.status_code == 200
    assert response.json()["result"]["doi"] == "10.1000/test.2"


def test_source_resolve_returns_404_for_missing_record(monkeypatch) -> None:
    monkeypatch.setattr(sources, "_client", lambda: FakeCrossrefClient())
    client = TestClient(app)
    response = client.get("/api/v1/sources/resolve", params={"doi": "10.1000/missing"})
    assert response.status_code == 404


def test_source_resolve_rejects_invalid_doi(monkeypatch) -> None:
    monkeypatch.setattr(sources, "_client", lambda: FakeCrossrefClient())
    client = TestClient(app)
    response = client.get("/api/v1/sources/resolve", params={"doi": "invalid-doi"})
    assert response.status_code == 422
