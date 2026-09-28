from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Averis"
    app_env: str = "development"
    web_origin: str = "http://localhost:3000"
    ai_provider: str = "ollama"
    ai_revision_enabled: bool = False
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "qwen3:4b"
    ollama_embedding_model: str = "nomic-embed-text"
    ollama_timeout_seconds: float = 8.0

    # Optional server-side OpenAI-compatible cloud runtime. It is intentionally
    # disabled by default and never falls back to another provider/model.
    ai_cloud_enabled: bool = False
    ai_api_base_url: str = "https://api.groq.com/openai/v1"
    ai_api_key: str | None = None
    ai_api_model: str = "openai/gpt-oss-20b"
    ai_cloud_timeout_seconds: float = 30.0

    @property
    def cloud_ai_configured(self) -> bool:
        return bool(
            self.ai_cloud_enabled
            and self.ai_api_base_url.strip()
            and (self.ai_api_key or "").strip()
            and self.ai_api_model.strip()
        )

    # Semantic evidence is displayed as a candidate signal even when these are
    # unset. It may influence review bands only after a labeled benchmark has
    # produced and documented both thresholds plus a calibration identifier.
    ai_semantic_review_threshold: float | None = None
    ai_semantic_high_review_threshold: float | None = None
    ai_semantic_calibration_id: str | None = None

    @property
    def semantic_review_thresholds(self) -> tuple[float, float] | None:
        review = self.ai_semantic_review_threshold
        high = self.ai_semantic_high_review_threshold
        calibration_id = (self.ai_semantic_calibration_id or "").strip()
        if review is None or high is None or not calibration_id:
            return None
        if not (0.0 <= review <= high <= 100.0):
            return None
        return review, high

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

        WEB_ORIGIN is deployment-controlled and may contain one origin or a
        comma-separated list. This keeps the API portable across a primary
        production host and a temporary migration/preview host without using a
        wildcard CORS policy. The canonical Averis Vercel domain remains
        allowed in beta/production while the zero-cost hosting migration is in
        progress.
        """
        candidates = self.web_origin.split(",")
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
