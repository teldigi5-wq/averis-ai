from __future__ import annotations

import hashlib
import hmac
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

import httpx
from fastapi import HTTPException, status

from app.core.config import get_settings
from app.services.auth import AuthContext


PLAN_ALLOWANCE = {"free": 5, "student": 50, "pro": 200}
CREEM_ALLOWED_BASE_URLS = {"https://test-api.creem.io", "https://api.creem.io"}
CREEM_PAID_STATUSES = {"active", "trialing"}
CREEM_CANCEL_PENDING_STATUSES = {"scheduled_cancel", "canceled"}
CREEM_FAIL_CLOSED_STATUSES = {"past_due", "unpaid", "paused"}


def _parse_timestamp(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


@dataclass(frozen=True)
class BillingSnapshot:
    plan: str = "free"
    subscription_status: str = "none"
    cadence: str | None = None
    renews_at: str | None = None
    ends_at: str | None = None
    provider_subscription_id: str | None = None
    provider_customer_id: str | None = None

    @property
    def cloud_allowed(self) -> bool:
        if self.plan not in {"student", "pro"}:
            return False
        provider_status = self.subscription_status.lower()
        if provider_status in CREEM_PAID_STATUSES:
            return True
        if provider_status in CREEM_CANCEL_PENDING_STATUSES:
            period_end = _parse_timestamp(self.ends_at)
            return bool(period_end and period_end > datetime.now(timezone.utc))
        return False

    @property
    def effective_plan(self) -> str:
        return self.plan if self.cloud_allowed else "free"


def _creem_api_base_url() -> str:
    value = get_settings().creem_api_base_url.strip().rstrip("/")
    return value if value in CREEM_ALLOWED_BASE_URLS else ""


def _product_map() -> dict[str, tuple[str, str]]:
    settings = get_settings()
    pairs = {
        settings.creem_product_student_monthly: ("student", "monthly"),
        settings.creem_product_student_yearly: ("student", "yearly"),
        settings.creem_product_pro_monthly: ("pro", "monthly"),
        settings.creem_product_pro_yearly: ("pro", "yearly"),
    }
    return {str(key).strip(): value for key, value in pairs.items() if key and str(key).strip()}


def _product_id_for(plan: str, cadence: str) -> str | None:
    for product_id, entitlement in _product_map().items():
        if entitlement == (plan, cadence):
            return product_id
    return None


def billing_configured() -> bool:
    settings = get_settings()
    products = _product_map()
    return bool(
        settings.billing_enabled
        and settings.billing_provider.strip().lower() == "creem"
        and _creem_api_base_url()
        and (settings.creem_api_key or "").strip()
        and (settings.creem_webhook_secret or "").strip()
        and settings.supabase_url
        and settings.supabase_public_key
        and settings.supabase_secret_key
        and len(products) == 4
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


def _creem_headers() -> dict[str, str]:
    key = (get_settings().creem_api_key or "").strip()
    if not key:
        raise RuntimeError("CREEM_API_KEY is required for billing provider requests")
    return {
        "x-api-key": key,
        "Accept": "application/json",
        "Content-Type": "application/json",
    }


async def get_billing_snapshot(auth: AuthContext) -> BillingSnapshot:
    if auth.development_bypass:
        return BillingSnapshot()

    settings = get_settings()
    if not settings.supabase_url:
        raise HTTPException(status_code=503, detail="Billing account lookup is unavailable.")

    params = {
        "user_id": f"eq.{auth.user_id}",
        "provider": "eq.creem",
        "select": "plan,status,cadence,renews_at,ends_at,provider_subscription_id,provider_customer_id",
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
        provider_subscription_id=(
            str(row.get("provider_subscription_id"))
            if row.get("provider_subscription_id")
            else None
        ),
        provider_customer_id=(
            str(row.get("provider_customer_id"))
            if row.get("provider_customer_id")
            else None
        ),
    )


async def reconcile_profile_entitlement(
    auth: AuthContext,
    *,
    snapshot: BillingSnapshot | None = None,
) -> BillingSnapshot:
    """Persist a one-time Free downgrade after a canceled paid period ends.

    Creem cancellation events can arrive before the paid-through timestamp. The
    subscription row remains paid until that timestamp. Once it passes, persist
    the row/profile downgrade so repeated status or scan requests cannot reset
    Free credits over and over.
    """

    current = snapshot or await get_billing_snapshot(auth)
    if (
        current.plan in {"student", "pro"}
        and not current.cloud_allowed
        and current.subscription_status.lower() in CREEM_CANCEL_PENDING_STATUSES
    ):
        if current.provider_subscription_id:
            await _downgrade_subscription(
                current.provider_subscription_id,
                provider_status=current.subscription_status.lower(),
            )
        else:
            await _apply_profile_plan(auth.user_id, "free", reset_credits=True)
        return BillingSnapshot(
            plan="free",
            subscription_status=current.subscription_status,
            cadence=current.cadence,
            renews_at=current.renews_at,
            ends_at=current.ends_at,
            provider_subscription_id=current.provider_subscription_id,
            provider_customer_id=current.provider_customer_id,
        )
    return current


async def create_checkout(auth: AuthContext, *, plan: str, cadence: str) -> str:
    settings = get_settings()
    if not billing_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Subscriptions are not activated yet.",
        )

    product_id = _product_id_for(plan, cadence)
    if not product_id:
        raise HTTPException(status_code=400, detail="Unsupported subscription plan.")

    redirect_url = settings.billing_return_url.rstrip("/") + "/pricing/?checkout=success"
    body = {
        "product_id": product_id,
        "request_id": f"averis_{auth.user_id}_{plan}_{cadence}_{uuid4().hex}",
        "success_url": redirect_url,
        "customer": {"email": auth.email},
        "metadata": {
            "averis_user_id": auth.user_id,
            "averis_plan": plan,
            "averis_cadence": cadence,
        },
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                f"{_creem_api_base_url()}/v1/checkouts",
                headers=_creem_headers(),
                json=body,
            )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail="Payment checkout is temporarily unavailable.") from exc
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail="Payment provider could not create the checkout.")

    url = response.json().get("checkout_url")
    if not isinstance(url, str) or not url.startswith("https://"):
        raise HTTPException(status_code=502, detail="Payment provider returned an invalid checkout URL.")
    return url


async def create_portal_url(auth: AuthContext) -> str:
    if not billing_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Subscriptions are not activated yet.",
        )
    snapshot = await get_billing_snapshot(auth)
    if not snapshot.provider_customer_id:
        raise HTTPException(status_code=404, detail="No managed subscription was found.")

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                f"{_creem_api_base_url()}/v1/customers/billing",
                headers=_creem_headers(),
                json={"customer_id": snapshot.provider_customer_id},
            )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail="Billing portal is temporarily unavailable.") from exc
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail="Payment provider could not open the billing portal.")

    url = response.json().get("customer_portal_link")
    if not isinstance(url, str) or not url.startswith("https://"):
        raise HTTPException(status_code=502, detail="Payment provider returned an invalid portal URL.")
    return url


def verify_webhook(raw_body: bytes, signature: str | None) -> dict[str, Any]:
    secret = (get_settings().creem_webhook_secret or "").encode("utf-8")
    if not secret or not signature:
        raise HTTPException(status_code=401, detail="Missing billing webhook signature.")
    expected = hmac.new(secret, raw_body, hashlib.sha256).hexdigest()
    supplied = signature.strip()
    if len(supplied) != len(expected) or not hmac.compare_digest(expected, supplied):
        raise HTTPException(status_code=401, detail="Invalid billing webhook signature.")
    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=400, detail="Invalid billing webhook payload.") from exc
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid billing webhook payload.")
    return payload


def _object_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _metadata(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _product_id(obj: dict[str, Any]) -> str:
    product = obj.get("product")
    if isinstance(product, dict):
        return str(product.get("id") or "")
    return str(product or "")


def _customer_id(obj: dict[str, Any]) -> str:
    customer = obj.get("customer")
    if isinstance(customer, dict):
        return str(customer.get("id") or "")
    return str(customer or "")


def _validate_checkout_metadata(
    metadata: dict[str, Any],
    *,
    plan: str,
    cadence: str,
) -> str:
    user_id = str(metadata.get("averis_user_id") or "")
    metadata_plan = str(metadata.get("averis_plan") or "")
    metadata_cadence = str(metadata.get("averis_cadence") or "")
    if not user_id:
        raise HTTPException(status_code=400, detail="Billing webhook cannot be linked to an Averis user.")
    if metadata_plan and metadata_plan != plan:
        raise HTTPException(status_code=400, detail="Billing webhook plan metadata does not match the purchased product.")
    if metadata_cadence and metadata_cadence != cadence:
        raise HTTPException(status_code=400, detail="Billing webhook cadence metadata does not match the purchased product.")
    return user_id


async def _lookup_user_by_subscription(
    subscription_id: str,
) -> tuple[str, str, str | None] | None:
    settings = get_settings()
    params = {
        "provider_subscription_id": f"eq.{subscription_id}",
        "provider": "eq.creem",
        "select": "user_id,plan,cadence",
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
    return (
        str(rows[0]["user_id"]),
        str(rows[0].get("plan") or "free"),
        str(rows[0].get("cadence")) if rows[0].get("cadence") else None,
    )


async def _apply_profile_plan(
    user_id: str,
    plan: str,
    *,
    reset_credits: bool,
    event_id: str | None = None,
    event_type: str | None = None,
) -> None:
    settings = get_settings()
    allowance = PLAN_ALLOWANCE.get(plan, 5)

    if event_id:
        # The RPC records the Creem event and applies the profile mutation in a
        # single database transaction. A webhook retry returns false and does
        # not refill or otherwise mutate the user's credits a second time.
        body = {
            "p_event_id": event_id,
            "p_user_id": user_id,
            "p_event_type": event_type or "creem.webhook",
            "p_plan": plan,
            "p_allowance": allowance,
            "p_reset_credits": reset_credits,
        }
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"{settings.supabase_url.rstrip('/')}/rest/v1/rpc/apply_billing_profile_event",
                headers=_admin_headers(),
                json=body,
            )
        if response.status_code >= 400:
            raise RuntimeError("failed to apply idempotent billing entitlement event")
        return

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


async def _upsert_subscription(
    *,
    user_id: str,
    subscription_id: str,
    customer_id: str,
    product_id: str,
    plan: str,
    cadence: str,
    provider_status: str,
    renews_at: Any,
    ends_at: Any,
) -> None:
    settings = get_settings()
    row = {
        "user_id": user_id,
        "provider": "creem",
        "provider_subscription_id": subscription_id,
        "provider_customer_id": customer_id or None,
        "provider_product_id": product_id or None,
        "plan": plan,
        "cadence": cadence,
        "status": provider_status,
        "renews_at": renews_at,
        "ends_at": ends_at,
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


def _effective_plan_for_event(
    *,
    plan: str,
    provider_status: str,
    ends_at: str | None,
) -> str:
    snapshot = BillingSnapshot(
        plan=plan,
        subscription_status=provider_status,
        ends_at=ends_at,
    )
    return snapshot.effective_plan


async def _persist_checkout_completed(obj: dict[str, Any], *, event_id: str) -> None:
    if str(obj.get("status") or "") != "completed":
        return

    product_id = _product_id(obj)
    entitlement = _product_map().get(product_id)
    # Unknown Creem product cannot grant an Averis entitlement.
    if not entitlement:
        return
    plan, cadence = entitlement

    subscription = _object_dict(obj.get("subscription"))
    subscription_id = str(subscription.get("id") or "")
    if not subscription_id:
        raise HTTPException(status_code=400, detail="Completed recurring checkout is missing a subscription ID.")

    metadata = _metadata(obj.get("metadata"))
    user_id = _validate_checkout_metadata(metadata, plan=plan, cadence=cadence)
    provider_status = str(subscription.get("status") or "active")
    ends_at = subscription.get("current_period_end_date")
    effective_plan = _effective_plan_for_event(
        plan=plan,
        provider_status=provider_status,
        ends_at=str(ends_at) if ends_at else None,
    )

    await _upsert_subscription(
        user_id=user_id,
        subscription_id=subscription_id,
        customer_id=_customer_id(obj) or _customer_id(subscription),
        product_id=product_id,
        plan=effective_plan,
        cadence=cadence,
        provider_status=provider_status,
        renews_at=subscription.get("next_transaction_date"),
        ends_at=ends_at,
    )
    await _apply_profile_plan(
        user_id,
        effective_plan,
        reset_credits=True,
        event_id=event_id,
        event_type="checkout.completed",
    )


async def _persist_subscription_event(
    event_type: str,
    obj: dict[str, Any],
    *,
    event_id: str,
) -> None:
    subscription_id = str(obj.get("id") or "")
    if not subscription_id:
        raise HTTPException(status_code=400, detail="Subscription webhook is missing its subscription ID.")

    product_id = _product_id(obj)
    entitlement = _product_map().get(product_id)
    existing = await _lookup_user_by_subscription(subscription_id)
    metadata = _metadata(obj.get("metadata"))

    # checkout.completed is the primary linking event. subscription.paid may
    # recover a missed checkout webhook, but every other subscription event is
    # synchronization-only and cannot establish a new paid Averis entitlement.
    if event_type != "subscription.paid" and not existing:
        return

    if not entitlement:
        # A product switch outside the four canonical Averis products can never
        # preserve or create paid access. Existing linked subscriptions fail
        # closed immediately and can recover on a later canonical paid event.
        if existing:
            await _downgrade_subscription(
                subscription_id,
                provider_status="unknown_product",
                event_id=event_id,
                event_type=event_type,
            )
        return

    mapped_plan, mapped_cadence = entitlement
    if event_type == "subscription.paid":
        plan, cadence = mapped_plan, mapped_cadence
        if existing:
            user_id = existing[0]
        else:
            user_id = _validate_checkout_metadata(
                metadata,
                plan=mapped_plan,
                cadence=mapped_cadence,
            )
    else:
        assert existing is not None
        user_id = existing[0]
        # Synchronization events can revoke/maintain an existing entitlement,
        # but only a paid event can elevate or switch the paid plan.
        plan = existing[1]
        cadence = existing[2] or mapped_cadence

    provider_status = str(obj.get("status") or "unknown")
    ends_at_value = obj.get("current_period_end_date")
    ends_at = str(ends_at_value) if ends_at_value else None

    event_status = event_type.split(".", 1)[-1]
    if event_status in CREEM_FAIL_CLOSED_STATUSES:
        provider_status = event_status

    # Creem documents subscription.expired as a retry-period notification whose
    # object can still be active. Do not revoke solely on that event.
    if event_type == "subscription.expired" and provider_status == "unknown":
        provider_status = "active"

    effective_plan = _effective_plan_for_event(
        plan=plan,
        provider_status=provider_status,
        ends_at=ends_at,
    )

    await _upsert_subscription(
        user_id=user_id,
        subscription_id=subscription_id,
        customer_id=_customer_id(obj),
        product_id=product_id,
        plan=effective_plan if provider_status in CREEM_FAIL_CLOSED_STATUSES else plan,
        cadence=cadence,
        provider_status=provider_status,
        renews_at=obj.get("next_transaction_date"),
        ends_at=ends_at_value,
    )

    reset_credits = event_type == "subscription.paid" or effective_plan == "free"
    await _apply_profile_plan(
        user_id,
        effective_plan,
        reset_credits=reset_credits,
        event_id=event_id,
        event_type=event_type,
    )


async def _downgrade_subscription(
    subscription_id: str,
    *,
    provider_status: str,
    event_id: str | None = None,
    event_type: str | None = None,
) -> None:
    settings = get_settings()
    existing = await _lookup_user_by_subscription(subscription_id)
    if not existing:
        return

    now = datetime.now(timezone.utc).isoformat()
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.patch(
            f"{settings.supabase_url.rstrip('/')}/rest/v1/subscriptions",
            headers={**_admin_headers(), "Prefer": "return=minimal"},
            params={
                "provider_subscription_id": f"eq.{subscription_id}",
                "provider": "eq.creem",
            },
            json={"plan": "free", "status": provider_status, "ends_at": now},
        )
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail="Averis could not persist subscription state.")
    await _apply_profile_plan(
        existing[0],
        "free",
        reset_credits=True,
        event_id=event_id,
        event_type=event_type,
    )


async def _persist_refund(obj: dict[str, Any], *, event_id: str) -> None:
    subscription = _object_dict(obj.get("subscription"))
    subscription_id = str(subscription.get("id") or "")
    if not subscription_id or str(subscription.get("status") or "") != "canceled":
        return
    await _downgrade_subscription(
        subscription_id,
        provider_status="refunded",
        event_id=event_id,
        event_type="refund.created",
    )


async def _persist_dispute(obj: dict[str, Any], *, event_id: str) -> None:
    # Creem dispute payloads include the affected subscription. A chargeback is
    # treated as an immediate fail-closed entitlement event.
    subscription = _object_dict(obj.get("subscription"))
    subscription_id = str(subscription.get("id") or "")
    if not subscription_id:
        return
    await _downgrade_subscription(
        subscription_id,
        provider_status="disputed",
        event_id=event_id,
        event_type="dispute.created",
    )


async def persist_webhook(payload: dict[str, Any]) -> None:
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_secret_key:
        raise HTTPException(status_code=503, detail="Billing persistence is not configured.")

    event_id = str(payload.get("id") or "")
    if not event_id:
        raise HTTPException(status_code=400, detail="Billing webhook event ID is required.")

    event_type = str(payload.get("eventType") or "")
    obj = _object_dict(payload.get("object"))

    if event_type == "checkout.completed":
        await _persist_checkout_completed(obj, event_id=event_id)
        return

    if event_type in {
        "subscription.active",
        "subscription.paid",
        "subscription.scheduled_cancel",
        "subscription.canceled",
        "subscription.past_due",
        "subscription.unpaid",
        "subscription.expired",
        "subscription.update",
        "subscription.trialing",
        "subscription.paused",
    }:
        await _persist_subscription_event(event_type, obj, event_id=event_id)
        return

    if event_type == "refund.created":
        await _persist_refund(obj, event_id=event_id)
        return

    if event_type == "dispute.created":
        await _persist_dispute(obj, event_id=event_id)
