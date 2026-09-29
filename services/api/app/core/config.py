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
        """Return explicit, normalized browser origins allowed to call the API.

        WEB_ORIGIN may contain one origin or a comma-separated list. Production
        and beta deployments fail closed: wildcard origins and non-HTTPS origins
        are rejected instead of silently widening the CORS boundary. There is no
        implicit legacy-host fallback; every public frontend must be named by the
        deployment configuration.
        """
        production_like = self.app_env.lower() in {"beta", "production"}
        normalized: list[str] = []

        for origin in self.web_origin.split(","):
            value = origin.strip().rstrip("/")
            if not value:
                continue
            if production_like:
                if value == "*":
                    raise ValueError("Wildcard WEB_ORIGIN is not allowed in beta/production.")
                if not value.startswith("https://"):
                    raise ValueError("WEB_ORIGIN must use HTTPS in beta/production.")
            if value not in normalized:
                normalized.append(value)

        if production_like and not normalized:
            raise ValueError("WEB_ORIGIN must explicitly name at least one HTTPS origin.")

        return normalized

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
