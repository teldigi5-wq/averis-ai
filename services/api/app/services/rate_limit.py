from __future__ import annotations

from dataclasses import dataclass

import httpx
from fastapi import HTTPException, status

from app.core.config import get_settings
from app.services.auth import AuthContext


@dataclass(frozen=True)
class RateLimitPolicy:
    action: str
    hourly_limit: int


@dataclass(frozen=True)
class RateLimitReceipt:
    allowed: bool
    remaining: int
    retry_after_seconds: int


DOCUMENT_EXTRACT = RateLimitPolicy("document_extract", 30)
SIMILARITY_COMPARE = RateLimitPolicy("similarity_compare", 12)
SOURCE_SEARCH = RateLimitPolicy("source_search", 30)
SOURCE_RESOLVE = RateLimitPolicy("source_resolve", 30)
REFERENCE_PARSE = RateLimitPolicy("reference_parse", 60)
REFERENCE_AUDIT = RateLimitPolicy("reference_audit", 30)
REFERENCE_VERIFY = RateLimitPolicy("reference_verify", 12)
AI_REVISION = RateLimitPolicy("ai_revision", 12)


def _receipt(payload: object) -> RateLimitReceipt:
    row = payload[0] if isinstance(payload, list) and payload else payload
    if not isinstance(row, dict):
        raise ValueError("Rate-limit RPC returned an invalid payload.")

    return RateLimitReceipt(
        allowed=bool(row.get("allowed")),
        remaining=max(0, int(row.get("remaining", 0))),
        retry_after_seconds=max(1, int(row.get("retry_after_seconds", 3600))),
    )


async def enforce_rate_limit(auth: AuthContext, policy: RateLimitPolicy) -> RateLimitReceipt | None:
    """Enforce one distributed, per-user hourly rate limit through Supabase.

    The database RPC owns the atomic counter so Vercel/serverless instance churn
    cannot reset limits. Local development bypasses external accounting entirely.
    """
    if auth.development_bypass:
        return None

    settings = get_settings()
    if not auth.access_token or not settings.supabase_url or not settings.supabase_public_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Request limiting is not configured.",
        )

    headers = {
        "Authorization": f"Bearer {auth.access_token}",
        "apikey": settings.supabase_public_key,
        "Content-Type": "application/json",
    }
    body = {
        "p_action": policy.action,
        "p_limit": policy.hourly_limit,
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"{settings.supabase_url.rstrip('/')}/rest/v1/rpc/consume_api_rate_limit",
                headers=headers,
                json=body,
            )
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Request limiting is temporarily unavailable.",
        ) from exc

    if response.status_code >= 400:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Averis could not verify the request limit.",
        )

    try:
        receipt = _receipt(response.json())
    except (TypeError, ValueError, KeyError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Averis received an invalid request-limit response.",
        ) from exc

    if not receipt.allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many {policy.action.replace('_', ' ')} requests. Try again later.",
            headers={"Retry-After": str(receipt.retry_after_seconds)},
        )

    return receipt
