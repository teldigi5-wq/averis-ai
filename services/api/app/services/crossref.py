from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from urllib.parse import quote

import httpx

from app.services.source_metadata import SourceMetadata, normalize_doi, source_from_crossref


@dataclass(frozen=True)
class CrossrefLookupError(RuntimeError):
    message: str
    upstream_status: int | None = None
    retryable: bool = True

    def __str__(self) -> str:
        return self.message


class CrossrefClient:
    def __init__(
        self,
        *,
        base_url: str = "https://api.crossref.org",
        mailto: str | None = None,
        timeout_seconds: float = 8.0,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.mailto = mailto.strip() if mailto and mailto.strip() else None
        self.timeout_seconds = timeout_seconds
        self._client = client

    @property
    def _headers(self) -> dict[str, str]:
        return {
            "Accept": "application/json",
            "User-Agent": "Averis/0.4 (+https://github.com/teldigi5-wq/averis-ai)",
        }

    async def _get(self, path: str, *, params: dict[str, str | int] | None = None) -> httpx.Response:
        request_params = dict(params or {})
        if self.mailto:
            request_params["mailto"] = self.mailto

        try:
            if self._client is not None:
                response = await self._client.get(
                    f"{self.base_url}{path}",
                    params=request_params,
                    headers=self._headers,
                    timeout=self.timeout_seconds,
                )
            else:
                async with httpx.AsyncClient(follow_redirects=True) as client:
                    response = await client.get(
                        f"{self.base_url}{path}",
                        params=request_params,
                        headers=self._headers,
                        timeout=self.timeout_seconds,
                    )
        except httpx.HTTPError as exc:
            raise CrossrefLookupError("Crossref is temporarily unavailable.") from exc

        if response.status_code == 429:
            raise CrossrefLookupError(
                "Crossref is temporarily rate-limited.",
                upstream_status=429,
                retryable=True,
            )
        if response.status_code >= 500:
            raise CrossrefLookupError(
                "Crossref returned a temporary upstream error.",
                upstream_status=response.status_code,
                retryable=True,
            )
        if response.status_code >= 400 and response.status_code != 404:
            raise CrossrefLookupError(
                "Crossref rejected the lookup request.",
                upstream_status=response.status_code,
                retryable=False,
            )
        return response

    @staticmethod
    def _json(response: httpx.Response) -> dict[str, Any]:
        try:
            payload = response.json()
        except ValueError as exc:
            raise CrossrefLookupError(
                "Crossref returned an invalid response.",
                upstream_status=response.status_code,
                retryable=True,
            ) from exc
        if not isinstance(payload, dict):
            raise CrossrefLookupError(
                "Crossref returned an unexpected response shape.",
                upstream_status=response.status_code,
                retryable=True,
            )
        return payload

    async def search(self, query: str, *, limit: int = 5) -> list[SourceMetadata]:
        cleaned = query.strip()
        if not cleaned:
            return []
        bounded_limit = max(1, min(limit, 5))
        response = await self._get(
            "/works",
            params={
                "query.bibliographic": cleaned,
                "rows": bounded_limit,
            },
        )
        payload = self._json(response)
        message = payload.get("message")
        if not isinstance(message, dict):
            raise CrossrefLookupError("Crossref returned an unexpected search response.")
        items = message.get("items")
        if not isinstance(items, list):
            return []
        return [source_from_crossref(item) for item in items[:bounded_limit] if isinstance(item, dict)]

    async def resolve_doi(self, doi: str) -> SourceMetadata | None:
        normalized = normalize_doi(doi)
        if normalized is None:
            return None
        encoded = quote(normalized, safe="")
        response = await self._get(f"/works/{encoded}")
        if response.status_code == 404:
            return None
        payload = self._json(response)
        message = payload.get("message")
        if not isinstance(message, dict):
            raise CrossrefLookupError("Crossref returned an unexpected DOI response.")
        return source_from_crossref(message)
