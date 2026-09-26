from fastapi import APIRouter

from app.ai.providers.ollama import OllamaProvider
from app.core.config import get_settings

router = APIRouter(prefix="/ai", tags=["ai"])


@router.get("/status")
async def ai_status() -> dict[str, object]:
    settings = get_settings()
    if settings.ai_provider.casefold() != "ollama":
        return {
            "provider": settings.ai_provider,
            "reachable": False,
            "note": "Only the Ollama health adapter is implemented in Milestone 1.",
        }

    provider = OllamaProvider(settings.ollama_base_url, settings.ollama_model)
    return await provider.health()
