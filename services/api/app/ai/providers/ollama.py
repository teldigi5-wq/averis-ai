from __future__ import annotations

import httpx

from app.ai.providers.base import AIProvider


class OllamaProvider(AIProvider):
    def __init__(self, base_url: str, model: str, *, timeout_seconds: float = 8.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout_seconds = timeout_seconds

    async def health(self) -> dict[str, object]:
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                response = await client.get(f"{self.base_url}/api/tags")
                response.raise_for_status()
            return {
                "provider": "ollama",
                "configured_model": self.model,
                "reachable": True,
            }
        except (httpx.HTTPError, OSError):
            return {
                "provider": "ollama",
                "configured_model": self.model,
                "reachable": False,
                "note": "Core similarity checking still works without the AI provider.",
            }

    async def embed_texts(self, texts: list[str], *, model: str) -> list[list[float]] | None:
        """Return local Ollama embeddings, or None when the optional runtime is unavailable."""
        if not texts:
            return []
        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                response = await client.post(
                    f"{self.base_url}/api/embed",
                    json={"model": model, "input": texts},
                )
                response.raise_for_status()
                payload = response.json()
        except (httpx.HTTPError, OSError, ValueError):
            return None

        embeddings = payload.get("embeddings") if isinstance(payload, dict) else None
        if not isinstance(embeddings, list) or len(embeddings) != len(texts):
            return None

        normalized: list[list[float]] = []
        for vector in embeddings:
            if not isinstance(vector, list):
                return None
            try:
                normalized.append([float(value) for value in vector])
            except (TypeError, ValueError):
                return None
        return normalized

    async def coach(self, prompt: str) -> str | None:
        """Generate a short evidence-grounded coaching note; never rewrite the student's submission."""
        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                response = await client.post(
                    f"{self.base_url}/api/generate",
                    json={
                        "model": self.model,
                        "prompt": prompt,
                        "stream": False,
                        "options": {"temperature": 0.1, "num_predict": 180},
                    },
                )
                response.raise_for_status()
                payload = response.json()
        except (httpx.HTTPError, OSError, ValueError):
            return None

        value = payload.get("response") if isinstance(payload, dict) else None
        if not isinstance(value, str):
            return None
        cleaned = value.strip()
        return cleaned[:1600] if cleaned else None
