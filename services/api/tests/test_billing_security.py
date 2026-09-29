from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException

from app.core.config import get_settings
from app.services import billing
from app.services.auth import AuthContext
from app.services.billing import BillingSnapshot, _product_map, billing_configured, verify_webhook


def _reset_settings() -> None:
    get_settings.cache_clear()


def _set_complete_creem_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BILLING_ENABLED", "true")
    monkeypatch.setenv("BILLING_PROVIDER", "creem")
    monkeypatch.setenv("CREEM_API_BASE_URL", "https://test-api.creem.io")
    monkeypatch.setenv("CREEM_API_KEY", "creem_test_placeholder_key_for_tests")
    monkeypatch.setenv("CREEM_WEBHOOK_SECRET", "test-signing-secret")
    monkeypatch.setenv("CREEM_PRODUCT_STUDENT_MONTHLY", "prod_student_month")
    monkeypatch.setenv("CREEM_PRODUCT_STUDENT_YEARLY", "prod_student_year")
    monkeypatch.setenv("CREEM_PRODUCT_PRO_MONTHLY", "prod_pro_month")
    monkeypatch.setenv("CREEM_PRODUCT_PRO_YEARLY", "prod_pro_year")
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "publishable-test-key")
    monkeypatch.setenv("SUPABASE_SECRET_KEY", "server-secret-placeholder-for-tests")


def test_billing_is_disabled_without_server_credentials(monkeypatch: pytest.MonkeyPatch) -> None:
    _set_complete_creem_env(monkeypatch)
    monkeypatch.delenv("CREEM_API_KEY", raising=False)
    _reset_settings()
    try:
        assert billing_configured() is False
    finally:
        _reset_settings()


def test_billing_is_configured_with_four_distinct_test_products(monkeypatch: pytest.MonkeyPatch) -> None:
    _set_complete_creem_env(monkeypatch)
    _reset_settings()
    try:
        assert billing_configured() is True
        assert _product_map() == {
            "prod_student_month": ("student", "monthly"),
            "prod_student_year": ("student", "yearly"),
            "prod_pro_month": ("pro", "monthly"),
            "prod_pro_year": ("pro", "yearly"),
        }
    finally:
        _reset_settings()


def test_duplicate_product_ids_fail_closed(monkeypatch: pytest.MonkeyPatch) -> None:
    _set_complete_creem_env(monkeypatch)
    monkeypatch.setenv("CREEM_PRODUCT_PRO_YEARLY", "prod_pro_month")
    _reset_settings()
    try:
        assert len(_product_map()) == 3
        assert billing_configured() is False
    finally:
        _reset_settings()


def test_unapproved_creem_api_host_fails_closed(monkeypatch: pytest.MonkeyPatch) -> None:
    _set_complete_creem_env(monkeypatch)
    monkeypatch.setenv("CREEM_API_BASE_URL", "https://example.invalid")
    _reset_settings()
    try:
        assert billing_configured() is False
    finally:
        _reset_settings()


def test_webhook_rejects_invalid_signature(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CREEM_WEBHOOK_SECRET", "test-signing-secret")
    _reset_settings()
    raw = json.dumps({"eventType": "checkout.completed"}).encode()
    try:
        with pytest.raises(HTTPException) as error:
            verify_webhook(raw, "deadbeef")
        assert error.value.status_code == 401
    finally:
        _reset_settings()


def test_webhook_accepts_matching_hmac_sha256(monkeypatch: pytest.MonkeyPatch) -> None:
    secret = "test-signing-secret"
    monkeypatch.setenv("CREEM_WEBHOOK_SECRET", secret)
    _reset_settings()
    payload = {
        "id": "evt_test",
        "eventType": "subscription.paid",
        "object": {"id": "sub_test", "object": "subscription"},
    }
    raw = json.dumps(payload, separators=(",", ":")).encode()
    signature = hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
    try:
        assert verify_webhook(raw, signature) == payload
    finally:
        _reset_settings()


def test_webhook_requires_signature(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CREEM_WEBHOOK_SECRET", "test-signing-secret")
    _reset_settings()
    try:
        with pytest.raises(HTTPException) as error:
            verify_webhook(b"{}", None)
        assert error.value.status_code == 401
    finally:
        _reset_settings()


@pytest.mark.parametrize(
    "provider_status",
    ["past_due", "unpaid", "paused", "expired", "refunded", "none"],
)
def test_non_entitled_subscription_states_do_not_unlock_cloud(provider_status: str) -> None:
    assert BillingSnapshot(plan="student", subscription_status=provider_status).cloud_allowed is False


@pytest.mark.parametrize("provider_status", ["active", "trialing"])
def test_active_subscription_states_unlock_cloud(provider_status: str) -> None:
    assert BillingSnapshot(plan="student", subscription_status=provider_status).cloud_allowed is True


@pytest.mark.parametrize("provider_status", ["scheduled_cancel", "canceled"])
def test_cancel_pending_subscription_stays_entitled_until_period_end(provider_status: str) -> None:
    future = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    snapshot = BillingSnapshot(
        plan="student",
        subscription_status=provider_status,
        ends_at=future,
    )
    assert snapshot.cloud_allowed is True
    assert snapshot.effective_plan == "student"


@pytest.mark.parametrize("provider_status", ["scheduled_cancel", "canceled"])
def test_cancel_pending_subscription_fails_closed_after_period_end(provider_status: str) -> None:
    past = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
    snapshot = BillingSnapshot(
        plan="student",
        subscription_status=provider_status,
        ends_at=past,
    )
    assert snapshot.cloud_allowed is False
    assert snapshot.effective_plan == "free"


def test_ended_cancel_reconciliation_persists_free_downgrade(monkeypatch: pytest.MonkeyPatch) -> None:
    past = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
    snapshot = BillingSnapshot(
        plan="student",
        subscription_status="canceled",
        ends_at=past,
        provider_subscription_id="sub_test",
        provider_customer_id="cust_test",
    )
    calls: list[tuple[str, str]] = []

    async def fake_downgrade(subscription_id: str, *, provider_status: str) -> None:
        calls.append((subscription_id, provider_status))

    monkeypatch.setattr(billing, "_downgrade_subscription", fake_downgrade)
    result = asyncio.run(
        billing.reconcile_profile_entitlement(
            AuthContext(user_id="user_test", email=None, access_token="token"),
            snapshot=snapshot,
        )
    )

    assert calls == [("sub_test", "canceled")]
    assert result.plan == "free"
    assert result.provider_subscription_id == "sub_test"
