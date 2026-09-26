from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Averis"
    app_env: str = "development"
    web_origin: str = "http://localhost:3000"
    ai_provider: str = "ollama"
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "qwen3:4b"

    # Crossref public REST API. No API key is required. CROSSREF_MAILTO is
    # optional but recommended so Crossref can identify/contact API clients.
    crossref_base_url: str = "https://api.crossref.org"
    crossref_mailto: str | None = None
    crossref_timeout_seconds: float = 8.0

    # Zero-cost SaaS mode is opt-in locally and must be enabled in public
    # deployments. When enabled, the API verifies Supabase Auth sessions and
    # enforces scan credits server-side through the database RPC.
    saas_mode: bool = False
    supabase_url: str | None = None
    supabase_publishable_key: str | None = None
    supabase_anon_key: str | None = None

    @property
    def supabase_public_key(self) -> str | None:
        return self.supabase_publishable_key or self.supabase_anon_key

    @property
    def cors_allowed_origins(self) -> list[str]:
        """Return normalized browser origins allowed to call the API.

        WEB_ORIGIN is the deployment-controlled source of truth. The canonical
        Averis production domain is also retained in beta/production so a
        harmless trailing slash or Vercel alias mismatch cannot break uploads.
        """
        candidates = [self.web_origin]
        if self.app_env.lower() in {"beta", "production"}:
            candidates.append("https://averis-web.vercel.app")

        normalized: list[str] = []
        for origin in candidates:
            value = origin.strip().rstrip("/")
            if value and value not in normalized:
                normalized.append(value)
        return normalized

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
