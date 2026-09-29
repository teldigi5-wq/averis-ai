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

    crossref_base_url: str = "https://api.crossref.org"
    crossref_mailto: str | None = None
    crossref_timeout_seconds: float = 8.0

    saas_mode: bool = False
    supabase_url: str | None = None
    supabase_publishable_key: str | None = None
    supabase_anon_key: str | None = None
    # Server-only key used only by trusted webhook handlers. Never expose this
    # through NEXT_PUBLIC_* or browser code.
    supabase_secret_key: str | None = None

    @property
    def supabase_public_key(self) -> str | None:
        return self.supabase_publishable_key or self.supabase_anon_key

    # Optional zero-monthly-fee subscription rail. Disabled until a merchant
    # account/store is approved and every server-side value is configured.
    billing_enabled: bool = False
    lemon_squeezy_api_key: str | None = None
    lemon_squeezy_webhook_secret: str | None = None
    lemon_squeezy_store_id: str | None = None
    billing_variant_student_monthly: str | None = None
    billing_variant_student_yearly: str | None = None
    billing_variant_pro_monthly: str | None = None
    billing_variant_pro_yearly: str | None = None
    billing_return_url: str = "http://localhost:3000"

    @property
    def cors_allowed_origins(self) -> list[str]:
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
