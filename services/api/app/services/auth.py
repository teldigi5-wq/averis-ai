from dataclasses import dataclass
from typing import Annotated

import httpx
from fastapi import Header, HTTPException, status

from app.core.config import get_settings


@dataclass(frozen=True)
class AuthContext:
    user_id: str
    email: str | None
    access_token: str | None
    development_bypass: bool = False


def _bearer_token(authorization: str | None) -> str | None:
    if not authorization:
        return None
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return None
    return token.strip()


async def require_user(
    authorization: Annotated[str | None, Header()] = None,
) -> AuthContext:
    settings = get_settings()

    if not settings.saas_mode:
        return AuthContext(
            user_id="local-development",
            email=None,
            access_token=None,
            development_bypass=True,
        )

    if not settings.supabase_url or not settings.supabase_public_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Averis SaaS mode is enabled but Supabase is not configured.",
        )

    token = _bearer_token(authorization)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sign in to use Averis scans.",
        )

    headers = {
        "Authorization": f"Bearer {token}",
        "apikey": settings.supabase_public_key,
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{settings.supabase_url.rstrip('/')}/auth/v1/user",
                headers=headers,
            )
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service is temporarily unavailable.",
        ) from exc

    if response.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Your Averis session is invalid or expired.",
        )

    payload = response.json()
    user_id = payload.get("id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unable to identify the signed-in user.",
        )

    return AuthContext(
        user_id=str(user_id),
        email=payload.get("email"),
        access_token=token,
    )
