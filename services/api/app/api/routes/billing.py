from __future__ import annotations

from fastapi import APIRouter, Depends, Header, Request

from app.schemas.billing import (
    BillingCheckoutRequest,
    BillingCheckoutResponse,
    BillingPortalResponse,
    BillingStatusResponse,
)
from app.services.auth import AuthContext, require_user
from app.services.billing import (
    PLAN_ALLOWANCE,
    billing_configured,
    create_checkout,
    create_portal_url,
    get_billing_snapshot,
    persist_webhook,
    reconcile_profile_entitlement,
    verify_webhook,
)

router = APIRouter(prefix="/billing", tags=["billing"])


@router.get("/status", response_model=BillingStatusResponse)
async def billing_status(auth: AuthContext = Depends(require_user)) -> BillingStatusResponse:
    snapshot = await get_billing_snapshot(auth)
    await reconcile_profile_entitlement(auth, snapshot=snapshot)
    effective_plan = snapshot.effective_plan
    return BillingStatusResponse(
        billing_enabled=billing_configured(),
        plan=effective_plan if effective_plan in {"free", "student", "pro"} else "free",
        subscription_status=snapshot.subscription_status,
        cadence=snapshot.cadence if snapshot.cadence in {"monthly", "yearly"} else None,
        renews_at=snapshot.renews_at,
        ends_at=snapshot.ends_at,
        can_use_cloud_ai=snapshot.cloud_allowed,
        monthly_credit_allowance=PLAN_ALLOWANCE.get(effective_plan, 5),
    )


@router.post("/checkout", response_model=BillingCheckoutResponse)
async def billing_checkout(
    payload: BillingCheckoutRequest,
    auth: AuthContext = Depends(require_user),
) -> BillingCheckoutResponse:
    url = await create_checkout(auth, plan=payload.plan, cadence=payload.cadence)
    return BillingCheckoutResponse(checkout_url=url)


@router.get("/portal", response_model=BillingPortalResponse)
async def billing_portal(auth: AuthContext = Depends(require_user)) -> BillingPortalResponse:
    return BillingPortalResponse(portal_url=await create_portal_url(auth))


@router.post("/webhook")
async def billing_webhook(
    request: Request,
    creem_signature: str | None = Header(default=None, alias="creem-signature"),
) -> dict[str, bool]:
    raw_body = await request.body()
    payload = verify_webhook(raw_body, creem_signature)
    await persist_webhook(payload)
    return {"ok": True}
