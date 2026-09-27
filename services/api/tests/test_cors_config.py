from app.core.config import Settings


def test_cors_origin_normalizes_trailing_slash() -> None:
    settings = Settings(app_env="beta", web_origin="https://averis-web.vercel.app/")
    assert settings.cors_allowed_origins == ["https://averis-web.vercel.app"]


def test_beta_keeps_canonical_production_origin() -> None:
    settings = Settings(app_env="beta", web_origin="https://example.invalid")
    assert settings.cors_allowed_origins == [
        "https://example.invalid",
        "https://averis-web.vercel.app",
    ]


def test_multiple_explicit_origins_are_supported_without_wildcard() -> None:
    settings = Settings(
        app_env="beta",
        web_origin="https://averis.example.net/, https://averis-preview.netlify.app",
    )
    assert settings.cors_allowed_origins == [
        "https://averis.example.net",
        "https://averis-preview.netlify.app",
        "https://averis-web.vercel.app",
    ]


def test_multiple_origins_are_trimmed_and_deduplicated() -> None:
    settings = Settings(
        app_env="production",
        web_origin=" https://averis-web.vercel.app/ , https://averis.example.net/ , https://averis.example.net ",
    )
    assert settings.cors_allowed_origins == [
        "https://averis-web.vercel.app",
        "https://averis.example.net",
    ]


def test_development_does_not_add_production_origin() -> None:
    settings = Settings(app_env="development", web_origin="http://localhost:3000/")
    assert settings.cors_allowed_origins == ["http://localhost:3000"]
