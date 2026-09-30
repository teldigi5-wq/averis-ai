from __future__ import annotations

import pytest

from app.core.config import get_settings
from app.services import billing


def _reset_settings() -> None:
    get_settings.cache_clear()


def test_admin_headers_use_secret_only_as_apikey(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SUPABASE_SECRET_KEY", "sb_secret_test_placeholder")
    _reset_settings()
    try:
        headers = billing._admin_headers()
    finally:
        _reset_settings()

    assert headers["apikey"] == "sb_secret_test_placeholder"
    assert "Authorization" not in headers
    assert headers["Content-Type"] == "application/json"
    assert headers["Accept"] == "application/json"


def test_admin_headers_fail_closed_without_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SUPABASE_SECRET_KEY", raising=False)
    _reset_settings()
    try:
        with pytest.raises(RuntimeError, match="SUPABASE_SECRET_KEY"):
            billing._admin_headers()
    finally:
        _reset_settings()
