from __future__ import annotations

from urllib.parse import urlparse

import httpx

from app.ai.providers.base import AIProvider


class CloudAIProviderError(RuntimeError):
    """Safe, user-presentable cloud runtime failure without upstream payload leakage."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


class CloudAIProvider(AIProvider):
    """OpenAI-compatible server-side cloud inference adapter.

    The API key is accepted only by the backend constructor and is never returned
    from health/status methods. Averis performs no provider/model fallback here:
    exactly one deployment-configured base URL and model are used per request.
    """

    def __init__(
        self,
        base_url: str,
        api_key: str,
        model: str,
        *,
        timeout_seconds: float = 30.0,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key.strip()
        self.model = model.strip()
        self.timeout_seconds = max(1.0, timeout_seconds)
        self._validate_base_url()

    def _validate_base_url(self) -> None:
        parsed = urlparse(self.base_url)
        local_hosts = {"localhost", "127.0.0.1", "::1"}
        if parsed.scheme == "https" and parsed.netloc:
            return
        if parsed.scheme == "http" and parsed.hostname in local_hosts:
            return
        raise ValueError("Cloud AI base URL must use HTTPS (HTTP is allowed only for localhost development).")

    @property
    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    async def health(self) -> dict[str, object]:
        try:
            async with httpx.AsyncClient(timeout=min(self.timeout_seconds, 4.0)) as client:
                response = await client.get(f"{self.base_url}/models", headers=self._headers)
                response.raise_for_status()
            return {
                "provider": "cloud",
                "configured_model": self.model,
                "reachable": True,
            }
        except (httpx.HTTPError, OSError, ValueError):
            return {
                "provider": "cloud",
                "configured_model": self.model,
                "reachable": False,
                "note": "Cloud AI is optional; evidence analysis remains available without it.",
            }

    async def refine_writing(self, prompt: str) -> str:
        body = {
            "model": self.model,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are Averis Writing Refinement. Follow the supplied academic-integrity "
                        "rules exactly and return only the requested revision proposal."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.2,
            "max_tokens": 1800,
            "stream": False,
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                response = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers=self._headers,
                    json=body,
                )
                response.raise_for_status()
                payload = response.json()
        except httpx.TimeoutException as exc:
            raise CloudAIProviderError(
                "cloud_timeout",
                "The configured Cloud AI provider timed out. No fallback model was used.",
            ) from exc
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 429:
                raise CloudAIProviderError(
                    "cloud_rate_limited",
                    "The configured Cloud AI free-tier limit is currently exhausted. No paid fallback was used.",
                ) from exc
            raise CloudAIProviderError(
                "cloud_upstream_error",
                "The configured Cloud AI provider rejected the request. No fallback model was used.",
            ) from exc
        except (httpx.RequestError, OSError) as exc:
            raise CloudAIProviderError(
                "cloud_unreachable",
                "The configured Cloud AI provider is currently unreachable. No fallback model was used.",
            ) from exc
        except ValueError as exc:
            raise CloudAIProviderError(
                "cloud_invalid_response",
                "The configured Cloud AI provider returned an invalid response.",
            ) from exc

        try:
            choices = payload["choices"]
            value = choices[0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise CloudAIProviderError(
                "cloud_invalid_response",
                "The configured Cloud AI provider returned an invalid response.",
            ) from exc

        if not isinstance(value, str) or not value.strip():
            raise CloudAIProviderError(
                "cloud_invalid_response",
                "The configured Cloud AI provider returned an empty response.",
            )
        return value.strip()[:20_000]
