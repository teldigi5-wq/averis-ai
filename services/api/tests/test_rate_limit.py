import asyncio

import pytest
from fastapi import HTTPException

from app.services import rate_limit
from app.services.auth import AuthContext


class _Settings:
    supabase_url = "https://example.invalid"
    supabase_public_key = "test-public-value"


class _Response:
    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code

    def json(self):
        return self._payload


class _AsyncClient:
    response = _Response([{"allowed": True, "remaining": 4, "retry_after_seconds": 1800}])

    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def post(self, *args, **kwargs):
        return self.response


def _auth(*, development_bypass=False):
    return AuthContext(
        user_id="test-user",
        email=None,
        access_token=None if development_bypass else "synthetic-session-value",
        development_bypass=development_bypass,
    )


def test_rate_limit_bypasses_local_development(monkeypatch) -> None:
    def should_not_load_settings():
        raise AssertionError("development bypass must not access external configuration")

    monkeypatch.setattr(rate_limit, "get_settings", should_not_load_settings)
    result = asyncio.run(
        rate_limit.enforce_rate_limit(
            _auth(development_bypass=True),
            rate_limit.SOURCE_SEARCH,
        )
    )
    assert result is None


def test_rate_limit_returns_remaining_capacity(monkeypatch) -> None:
    _AsyncClient.response = _Response(
        [{"allowed": True, "remaining": 4, "retry_after_seconds": 1234}]
    )
    monkeypatch.setattr(rate_limit, "get_settings", lambda: _Settings())
    monkeypatch.setattr(rate_limit.httpx, "AsyncClient", _AsyncClient)

    receipt = asyncio.run(
        rate_limit.enforce_rate_limit(_auth(), rate_limit.REFERENCE_VERIFY)
    )
    assert receipt is not None
    assert receipt.allowed is True
    assert receipt.remaining == 4
    assert receipt.retry_after_seconds == 1234


def test_rate_limit_rejects_exhausted_bucket(monkeypatch) -> None:
    _AsyncClient.response = _Response(
        [{"allowed": False, "remaining": 0, "retry_after_seconds": 777}]
    )
    monkeypatch.setattr(rate_limit, "get_settings", lambda: _Settings())
    monkeypatch.setattr(rate_limit.httpx, "AsyncClient", _AsyncClient)

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(rate_limit.enforce_rate_limit(_auth(), rate_limit.SOURCE_SEARCH))

    assert exc_info.value.status_code == 429
    assert exc_info.value.headers == {"Retry-After": "777"}
    assert "too many source search requests" in exc_info.value.detail.lower()


def test_rate_limit_payload_validation() -> None:
    with pytest.raises(ValueError):
        rate_limit._receipt([])
