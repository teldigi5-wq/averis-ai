from app.services.auth import _bearer_token


def test_bearer_token_parses_valid_header() -> None:
    assert _bearer_token("Bearer abc.def.ghi") == "abc.def.ghi"


def test_bearer_token_rejects_wrong_scheme() -> None:
    assert _bearer_token("Basic abc") is None


def test_bearer_token_rejects_empty_header() -> None:
    assert _bearer_token(None) is None

import asyncio
from types import SimpleNamespace
import pytest
from fastapi import HTTPException
from app.services import auth as auth_module


@pytest.mark.parametrize("environment", ["beta", "production", "staging"])
def test_anonymous_dev_identity_is_blocked_outside_development(monkeypatch, environment: str) -> None:
    monkeypatch.setattr(
        auth_module, "get_settings",
        lambda: SimpleNamespace(saas_mode=False, app_env=environment),
    )
    with pytest.raises(HTTPException) as caught:
        asyncio.run(auth_module.require_user(None))
    assert caught.value.status_code == 503


def test_local_development_can_keep_offline_identity(monkeypatch) -> None:
    monkeypatch.setattr(
        auth_module, "get_settings",
        lambda: SimpleNamespace(saas_mode=False, app_env="development"),
    )
    result = asyncio.run(auth_module.require_user(None))
    assert result.development_bypass is True
    assert result.user_id == "local-development"
