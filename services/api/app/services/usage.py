from dataclasses import dataclass

import httpx
from fastapi import HTTPException, status

from app.core.config import get_settings
from app.services.auth import AuthContext
from app.services.billing import billing_configured, reconcile_profile_entitlement


@dataclass(frozen=True)
class ScanUsageReceipt:
    scan_id: str | None
    credits_remaining: int | None


async def record_scan_usage(
    auth: AuthContext,
    *,
    document_name: str,
    source_name: str,
    similarity_percent: float,
) -> ScanUsageReceipt:
    """Atomically consume one credit and record a scan through Supabase RPC.

    Local development deliberately bypasses billing/usage persistence so the
    deterministic analysis engine remains easy to test without external
    services.
    """
    if auth.development_bypass:
        return ScanUsageReceipt(scan_id=None, credits_remaining=None)

    settings = get_settings()
    if not (
        auth.access_token
        and settings.supabase_url
        and settings.supabase_public_key
    ):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Scan accounting is not configured.",
        )

    # Keep paid scan allowances fail-closed after a scheduled/canceled period
    # actually ends. The webhook stores the paid-through timestamp; this check
    # prevents stale profile credits from surviving indefinitely after it.
    if billing_configured():
        await reconcile_profile_entitlement(auth)

    headers = {
        "Authorization": f"Bearer {auth.access_token}",
        "apikey": settings.supabase_public_key,
        "Content-Type": "application/json",
    }
    body = {
        "p_document_name": document_name[:255],
        "p_source_name": source_name[:255],
        "p_similarity_percent": similarity_percent,
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"{settings.supabase_url.rstrip('/')}/rest/v1/rpc/consume_scan_credit",
                headers=headers,
                json=body,
            )
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Scan accounting is temporarily unavailable.",
        ) from exc

    if response.status_code >= 400:
        message = response.text.upper()
        if "INSUFFICIENT_CREDITS" in message:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail="No scan credits remain. Free beta credits have been used.",
            )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Averis could not record scan usage.",
        )

    payload = response.json()
    row = payload[0] if isinstance(payload, list) and payload else payload
    return ScanUsageReceipt(
        scan_id=str(row.get("scan_id")) if row and row.get("scan_id") else None,
        credits_remaining=(
            int(row["credits_remaining"])
            if row and row.get("credits_remaining") is not None
            else None
        ),
    )
