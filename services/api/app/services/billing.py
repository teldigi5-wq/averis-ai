from __future__ import annotations

import hashlib
import hmac
import json
from dataclasses import dataclass
from typing import Any

import httpx
from fastapi import HTTPException, status

from app.core.config import get_settings
from app.services.auth import AuthContext


# Cancelled subscriptions remain entitled only until the provider reaches the
# eventual expired state. Payment failures and paused subscriptions fail closed.
ENTITLED_STATUSES = {"on_trial", "active", "cancelled"}
PLAN_ALLOWANCE = {"free": 5, "student": 50, "pro": 200}


@dataclass(frozen=True)
class BillingSnapshot:
    plan: str = "free"
    subscription_status: str = "none"
    cadence: str | None = None
    renews_at: str | None = None
    ends_at: str | None = None
    provider_subscription_id: str | None = None

    @property
    def cloud_allowed(self) -> bool:
        return self.plan in {"student", "pro"} and self.subscription_status in ENTITLED_STATUSES


def _variant_map() -> dict[str, tuple[str, str]]:
    settings = get_settings()
    pairs = {
        settings.billing_variant_student_monthly: ("student", "monthly"),
        settings.billing_variant_student_yearly: ("student", "yearly"),
        settings.billing_variant_pro_monthly: ("pro", "monthly"),
        settings.billing_variant_pro_yearly: ("pro", "yearly"),
    }
    return {str(key): value for key, value in pairs.items() if key}


def billing_configured() -> bool:
    settings = get_settings()
    return bool(
        settings.billing_enabled
        and settings.lemon_squeezy_api_key
        and settings.lemon_squeezy_webhook_secret
        and settings.lemon_squeezy_store_id
        and settings.supabase_secret_key
        and len(_variant_map()) == 4
    )


def _user_headers(auth: AuthContext) -> dict[str, str]:
    settings = get_settings()
    if not auth.access_token or not settings.supabase_public_key:
        raise HTTPException(status_code=503, detail="Billing account lookup is not configured.")
    return {
        "Authorization": f"Bearer {auth.access_token}",
        "apikey": settings.supabase_public_key,
        "Accept": "application/json",
    }


def _admin_headers() -> dict[str, str]:
    settings = get_settings()
    secret = (settings.supabase_secret_key or "").strip()
    if not secret:
        raise RuntimeError("SUPABASE_SECRET_KEY is required for billing webhook persistence")
    return {
        "Authorization": f"Bearer {secret}",
        "apikey": secret,
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


async def get_billing_snapshot(auth: AuthContext) -> BillingSnapshot:
    if auth.development_bypass:
        return BillingSnapshot()

    settings = get_settings()
    if not settings.supabase_url:
        raise HTTPException(status_code=503, detail="Billing account lookup is unavailable.")

    params = {
        "user_id": f"eq.{auth.user_id}",
        "select": "plan,status,cadence,renews_at,ends_at,provider_subscription_id",
        "order": "updated_at.desc",
        "limit": "1",
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{settings.supabase_url.rstrip('/')}/rest/v1/subscriptions",
                headers=_user_headers(auth),
                params=params,
            )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail="Billing status is temporarily unavailable.") from exc

    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail="Averis could not read subscription status.")
    rows = response.json()
    if not rows:
        return BillingSnapshot()
    row = rows[0]
    return BillingSnapshot(
        plan=row.get("plan") or "free",
        subscription_status=row.get("status") or "none",
        cadence=row.get("cadence"),
        renews_at=row.get("renews_at"),
        ends_at=row.get("ends_at"),
        provider_subscription_id=str(row.get("provider_subscription_id")) if row.get("provider_subscription_id") else None,
    )


async def create_checkout(auth: AuthContext, *, plan: str, cadence: str) -> str:
    settings = get_settings()
    if not billing_configured():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Subscriptions are not activated yet.")

    variant_lookup = {
        ("student", "monthly"): settings.billing_variant_student_monthly,
        ("student", "yearly"): settings.billing_variant_student_yearly,
        ("pro", "monthly"): settings.billing_variant_pro_monthly,
        ("pro", "yearly"): settings.billing_variant_pro_yearly,
    }
    variant_id = variant_lookup.get((plan, cadence))
    if not variant_id:
        raise HTTPException(status_code=400, detail="Unsupported subscription plan.")

    redirect_url = settings.billing_return_url.rstrip("/") + "/pricing/?checkout=success"
    body = {
        "data": {
            "type": "checkouts",
            "attributes": {
                "product_options": {"redirect_url": redirect_url, "enabled_variants": [int(variant_id)]},
                "checkout_data": {
                    "email": auth.email,
                    "custom": {"user_id": auth.user_id, "plan": plan, "cadence": cadence},
                },
            },
            "relationships": {
                "store": {"data": {"type": "stores", "id": str(settings.lemon_squeezy_store_id)}},
                "variant": {"data": {"type": "variants", "id": str(variant_id)}},
            },
        }
    }
    headers = {
        "Authorization": f"Bearer {settings.lemon_squeezy_api_key}",
        "Accept": "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json",
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post("https://api.lemonsqueezy.com/v1/checkouts", headers=headers, json=body)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail="Payment checkout is temporarily unavailable.") from exc
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail="Payment provider could not create the checkout.")
    payload = response.json()
    url = payload.get("data", {}).get("attributes", {}).get("url")
    if not isinstance(url, str) or not url.startswith("https://"):
        raise HTTPException(status_code=502, detail="Payment provider returned an invalid checkout URL.")
    return url


async def create_portal_url(auth: AuthContext) -> str:
    settings = get_settings()
    snapshot = await get_billing_snapshot(auth)
    if not snapshot.provider_subscription_id or not settings.lemon_squeezy_api_key:
        raise HTTPException(status_code=404, detail="No managed subscription was found.")
    headers = {"Authorization": f"Bearer {settings.lemon_squeezy_api_key}", "Accept": "application/vnd.api+json"}
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                f"https://api.lemonsqueezy.com/v1/subscriptions/{snapshot.provider_subscription_id}",
                headers=headers,
            )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail="Billing portal is temporarily unavailable.") from exc
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail="Payment provider could not open the billing portal.")
    url = response.json().get("data", {}).get("attributes", {}).get("urls", {}).get("customer_portal")
    if not isinstance(url, str) or not url.startswith("https://"):
        raise HTTPException(status_code=502, detail="Payment provider returned an invalid portal URL.")
    return url


def verify_webhook(raw_body: bytes, signature: str | None) -> dict[str, Any]:
    settings = get_settings()
    secret = (settings.lemon_squeezy_webhook_secret or "").encode("utf-8")
    if not secret or not signature:
        raise HTTPException(status_code=401, detail="Missing billing webhook signature.")
    expected = hmac.new(secret, raw_body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature.strip()):
        raise HTTPException(status_code=401, detail="Invalid billing webhook signature.")
    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=400, detail="Invalid billing webhook payload.") from exc
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid billing webhook payload.")
    return payload


def _assert_expected_store(attrs: dict[str, Any]) -> None:
    expected = str(get_settings().lemon_squeezy_store_id or "")
    received = attrs.get("store_id")
    if received is not None and expected and str(received) != expected:
        raise HTTPException(status_code=400, detail="Billing webhook store does not match Averis configuration.")


async def _lookup_user_by_subscription(subscription_id: str) -> tuple[str, str] | None:
    settings = get_settings()
    params = {
        "provider_subscription_id": f"eq.{subscription_id}",
        "select": "user_id,plan",
        "limit": "1",
    }
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(
            f"{settings.supabase_url.rstrip('/')}/rest/v1/subscriptions",
            headers=_admin_headers(),
            params=params,
        )
    if response.status_code >= 400:
        return None
    rows = response.json()
    if not rows:
        return None
    return str(rows[0]["user_id"]), str(rows[0].get("plan") or "free")


async def _apply_profile_plan(user_id: str, plan: str, *, reset_credits: bool) -> None:
    settings = get_settings()
    allowance = PLAN_ALLOWANCE.get(plan, 5)
    body: dict[str, Any] = {"plan": plan, "monthly_credit_allowance": allowance}
    if reset_credits:
        body["credits_remaining"] = allowance
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.patch(
            f"{settings.supabase_url.rstrip('/')}/rest/v1/profiles",
            headers={**_admin_headers(), "Prefer": "return=minimal"},
            params={"user_id": f"eq.{user_id}"},
            json=body,
        )
    if response.status_code >= 400:
        raise RuntimeError("failed to update billing entitlement profile")


async def persist_webhook(payload: dict[str, Any]) -> None:
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_secret_key:
        raise HTTPException(status_code=503, detail="Billing persistence is not configured.")

    meta = payload.get("meta") if isinstance(payload.get("meta"), dict) else {}
    event_name = str(meta.get("event_name") or "")
    custom = meta.get("custom_data") if isinstance(meta.get("custom_data"), dict) else {}
    data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    attrs = data.get("attributes") if isinstance(data.get("attributes"), dict) else {}
    _assert_expected_store(attrs)

    if event_name == "subscription_payment_success":
        subscription_id = attrs.get("subscription_id")
        if subscription_id:
            found = await _lookup_user_by_subscription(str(subscription_id))
            if found:
                await _apply_profile_plan(found[0], found[1], reset_credits=True)
        return

    if not event_name.startswith("subscription_") or data.get("type") != "subscriptions":
        return

    subscription_id = str(data.get("id") or "")
    variant_id = str(attrs.get("variant_id") or "")
    variant_plan = _variant_map().get(variant_id)
    user_id = str(custom.get("user_id") or "")
    if not user_id and subscription_id:
        found = await _lookup_user_by_subscription(subscription_id)
        if found:
            user_id = found[0]
    if not user_id or not subscription_id:
        raise HTTPException(status_code=400, detail="Billing webhook cannot be linked to an Averis user.")

    # An unknown provider variant is never promoted to a paid Averis plan.
    plan, cadence = variant_plan or ("free", "monthly")
    provider_status = str(attrs.get("status") or "unknown")
    effective_plan = plan if provider_status in ENTITLED_STATUSES else "free"
    row = {
        "user_id": user_id,
        "provider": "lemon_squeezy",
        "provider_subscription_id": subscription_id,
        "provider_customer_id": str(attrs.get("customer_id") or ""),
        "provider_variant_id": variant_id,
        "plan": effective_plan,
        "cadence": cadence,
        "status": provider_status,
        "renews_at": attrs.get("renews_at"),
        "ends_at": attrs.get("ends_at"),
    }
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(
            f"{settings.supabase_url.rstrip('/')}/rest/v1/subscriptions",
            headers={**_admin_headers(), "Prefer": "resolution=merge-duplicates,return=minimal"},
            params={"on_conflict": "provider_subscription_id"},
            json=row,
        )
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail="Averis could not persist subscription state.")

    reset = event_name == "subscription_created"
    await _apply_profile_plan(user_id, effective_plan, reset_credits=reset or effective_plan == "free")
