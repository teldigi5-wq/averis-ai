from __future__ import annotations

import hashlib
import hmac
import json

import pytest
from fastapi import HTTPException

from app.core.config import get_settings
from app.services.billing import billing_configured, verify_webhook


def _reset_settings() -> None:
    get_settings.cache_clear()


def test_billing_is_disabled_without_server_credentials(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BILLING_ENABLED", "true")
    monkeypatch.delenv("LEMON_SQUEEZY_API_KEY", raising=False)
    monkeypatch.delenv("LEMON_SQUEEZY_WEBHOOK_SECRET", raising=False)
    monkeypatch.delenv("LEMON_SQUEEZY_STORE_ID", raising=False)
    monkeypatch.delenv("SUPABASE_SECRET_KEY", raising=False)
    _reset_settings()
    try:
        assert billing_configured() is False
    finally:
        _reset_settings()


def test_webhook_rejects_invalid_signature(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LEMON_SQUEEZY_WEBHOOK_SECRET", "test-signing-secret")
    _reset_settings()
    raw = json.dumps({"meta": {"event_name": "subscription_created"}}).encode()
    try:
        with pytest.raises(HTTPException) as error:
            verify_webhook(raw, "deadbeef")
        assert error.value.status_code == 401
    finally:
        _reset_settings()


def test_webhook_accepts_matching_hmac_sha256(monkeypatch: pytest.MonkeyPatch) -> None:
    secret = "test-signing-secret"
    monkeypatch.setenv("LEMON_SQUEEZY_WEBHOOK_SECRET", secret)
    _reset_settings()
    payload = {"meta": {"event_name": "subscription_created"}, "data": {"type": "subscriptions", "id": "123"}}
    raw = json.dumps(payload, separators=(",", ":")).encode()
    signature = hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
    try:
        assert verify_webhook(raw, signature) == payload
    finally:
        _reset_settings()


def test_webhook_requires_signature(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LEMON_SQUEEZY_WEBHOOK_SECRET", "test-signing-secret")
    _reset_settings()
    try:
        with pytest.raises(HTTPException) as error:
            verify_webhook(b"{}", None)
        assert error.value.status_code == 401
    finally:
        _reset_settings()
