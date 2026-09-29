from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel


PlanId = Literal["free", "student", "pro"]
BillingCadence = Literal["monthly", "yearly"]


class BillingCheckoutRequest(BaseModel):
    plan: Literal["student", "pro"]
    cadence: BillingCadence


class BillingCheckoutResponse(BaseModel):
    checkout_url: str


class BillingStatusResponse(BaseModel):
    billing_enabled: bool
    plan: PlanId = "free"
    subscription_status: str = "none"
    cadence: BillingCadence | None = None
    renews_at: datetime | None = None
    ends_at: datetime | None = None
    can_use_cloud_ai: bool = False
    monthly_credit_allowance: int = 5


class BillingPortalResponse(BaseModel):
    portal_url: str
