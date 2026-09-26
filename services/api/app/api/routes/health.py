from fastapi import APIRouter, HTTPException, status

from app.core.config import get_settings

router = APIRouter(tags=["system"])


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "averis-api"}


@router.get("/readiness")
def readiness() -> dict[str, str | bool]:
    settings = get_settings()
    supabase_configured = bool(
        settings.supabase_url and settings.supabase_public_key
    )

    if settings.saas_mode and not supabase_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Averis SaaS mode is enabled but Supabase is not configured.",
        )

    return {
        "status": "ready",
        "service": "averis-api",
        "saas_mode": settings.saas_mode,
        "supabase_configured": supabase_configured,
        "original_upload_retained": False,
    }
