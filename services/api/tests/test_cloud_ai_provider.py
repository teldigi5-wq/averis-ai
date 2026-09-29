import asyncio

import httpx
import pytest

from app.ai.providers.cloud import CloudAIProvider, CloudAIProviderError


class _FakeClient:
    response: httpx.Response
    seen_headers: dict[str, str] | None = None
    seen_json: dict[str, object] | None = None

    def __init__(self, *args: object, **kwargs: object) -> None:
        del args, kwargs

    async def __aenter__(self) -> "_FakeClient":
        return self

    async def __aexit__(self, *args: object) -> None:
        del args

    async def post(self, url: str, *, headers: dict[str, str], json: dict[str, object]) -> httpx.Response:
        assert url == "https://api.example.com/v1/chat/completions"
        type(self).seen_headers = headers
        type(self).seen_json = json
        return type(self).response

    async def get(self, url: str, *, headers: dict[str, str]) -> httpx.Response:
        assert url == "https://api.example.com/v1/models"
        type(self).seen_headers = headers
        return type(self).response


def _provider() -> CloudAIProvider:
    return CloudAIProvider(
        "https://api.example.com/v1",
        "server-only-secret",
        "example-model",
        timeout_seconds=5.0,
    )


def test_cloud_provider_rejects_insecure_remote_base_url() -> None:
    with pytest.raises(ValueError, match="must use HTTPS"):
        CloudAIProvider("http://api.example.com/v1", "secret", "model")


def test_cloud_provider_sends_key_server_side_and_parses_proposal(monkeypatch: pytest.MonkeyPatch) -> None:
    request = httpx.Request("POST", "https://api.example.com/v1/chat/completions")
    _FakeClient.response = httpx.Response(
        200,
        request=request,
        json={"choices": [{"message": {"content": "A clearer academic sentence."}}]},
    )
    monkeypatch.setattr("app.ai.providers.cloud.httpx.AsyncClient", _FakeClient)

    result = asyncio.run(_provider().refine_writing("Revise this text safely."))

    assert result == "A clearer academic sentence."
    assert _FakeClient.seen_headers == {
        "Authorization": "Bearer server-only-secret",
        "Content-Type": "application/json",
    }
    assert _FakeClient.seen_json is not None
    assert _FakeClient.seen_json["model"] == "example-model"


def test_cloud_provider_never_leaks_key_from_health(monkeypatch: pytest.MonkeyPatch) -> None:
    request = httpx.Request("GET", "https://api.example.com/v1/models")
    _FakeClient.response = httpx.Response(200, request=request, json={"data": []})
    monkeypatch.setattr("app.ai.providers.cloud.httpx.AsyncClient", _FakeClient)

    health = asyncio.run(_provider().health())

    assert health["provider"] == "cloud"
    assert health["configured_model"] == "example-model"
    assert health["reachable"] is True
    assert "server-only-secret" not in repr(health)


def test_cloud_provider_surfaces_rate_limit_without_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    request = httpx.Request("POST", "https://api.example.com/v1/chat/completions")
    _FakeClient.response = httpx.Response(429, request=request, json={"error": "limit"})
    monkeypatch.setattr("app.ai.providers.cloud.httpx.AsyncClient", _FakeClient)

    with pytest.raises(CloudAIProviderError) as caught:
        asyncio.run(_provider().refine_writing("Revise this text safely."))

    assert caught.value.code == "cloud_rate_limited"
    assert "No paid fallback" in caught.value.message
