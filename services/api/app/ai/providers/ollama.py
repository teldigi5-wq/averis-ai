import httpx

from app.ai.providers.base import AIProvider


class OllamaProvider(AIProvider):
    def __init__(self, base_url: str, model: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model

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
