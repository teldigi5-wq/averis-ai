from __future__ import annotations

import httpx


class OpenAICompatibleProvider:
    """Minimal server-side client for OpenAI-compatible chat-completions APIs.

    The provider is deliberately vendor-neutral. Secrets stay in API environment
    variables and are never returned to the browser. Route-level policy,
    authentication, rate limiting and preservation checks remain outside this
    transport adapter.
    """

    def __init__(
        self,
        base_url: str,
        api_key: str,
        model: str,
        *,
        timeout_seconds: float = 30.0,
        provider_label: str = "OpenAI-compatible API",
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model
        self.timeout_seconds = timeout_seconds
        self.provider_label = provider_label

    async def health(self) -> dict[str, object]:
        if not self.base_url or not self.api_key or not self.model:
            return {
                "provider": "openai_compatible",
                "provider_label": self.provider_label,
                "configured_model": self.model or None,
                "configured": False,
                "reachable": False,
            }

        try:
            async with httpx.AsyncClient(timeout=min(self.timeout_seconds, 5.0)) as client:
                response = await client.get(
                    f"{self.base_url}/models",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                )
                response.raise_for_status()
            return {
                "provider": "openai_compatible",
                "provider_label": self.provider_label,
                "configured_model": self.model,
                "configured": True,
                "reachable": True,
            }
        except (httpx.HTTPError, OSError):
            return {
                "provider": "openai_compatible",
                "provider_label": self.provider_label,
                "configured_model": self.model,
                "configured": True,
                "reachable": False,
                "note": "The configured AI API did not respond to the runtime health check.",
            }

    async def refine_writing(self, prompt: str) -> str | None:
        if not self.base_url or not self.api_key or not self.model:
            return None

        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                response = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": self.model,
                        "messages": [
                            {
                                "role": "system",
                                "content": (
                                    "Follow the academic-integrity and preservation rules in the user prompt exactly. "
                                    "Return only the requested revision text."
                                ),
                            },
                            {"role": "user", "content": prompt},
                        ],
                        "temperature": 0.2,
                        "max_tokens": 1800,
                    },
                )
                response.raise_for_status()
                payload = response.json()
        except (httpx.HTTPError, OSError, ValueError):
            return None

        if not isinstance(payload, dict):
            return None
        choices = payload.get("choices")
        if not isinstance(choices, list) or not choices:
            return None
        first = choices[0]
        if not isinstance(first, dict):
            return None
        message = first.get("message")
        if not isinstance(message, dict):
            return None
        value = message.get("content")
        if not isinstance(value, str):
            return None
        cleaned = value.strip()
        return cleaned[:20_000] if cleaned else None
