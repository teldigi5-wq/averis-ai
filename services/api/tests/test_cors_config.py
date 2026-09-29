import pytest

from app.core.config import Settings


def test_cors_origin_normalizes_trailing_slash() -> None:
    settings = Settings(app_env="beta", web_origin="https://teldigi5-wq.github.io/")
    assert settings.cors_allowed_origins == ["https://teldigi5-wq.github.io"]


def test_beta_uses_only_explicit_origins() -> None:
    settings = Settings(app_env="beta", web_origin="https://teldigi5-wq.github.io")
    assert settings.cors_allowed_origins == ["https://teldigi5-wq.github.io"]


def test_multiple_explicit_origins_are_supported_without_wildcard() -> None:
    settings = Settings(
        app_env="beta",
        web_origin="https://teldigi5-wq.github.io/, https://averis.example.net",
    )
    assert settings.cors_allowed_origins == [
        "https://teldigi5-wq.github.io",
        "https://averis.example.net",
    ]


def test_multiple_origins_are_trimmed_and_deduplicated() -> None:
    settings = Settings(
        app_env="production",
        web_origin=" https://teldigi5-wq.github.io/ , https://averis.example.net/ , https://averis.example.net ",
    )
    assert settings.cors_allowed_origins == [
        "https://teldigi5-wq.github.io",
        "https://averis.example.net",
    ]


def test_beta_rejects_wildcard_origin() -> None:
    settings = Settings(app_env="beta", web_origin="*")
    with pytest.raises(ValueError, match="Wildcard WEB_ORIGIN"):
        _ = settings.cors_allowed_origins


def test_production_rejects_http_origin() -> None:
    settings = Settings(app_env="production", web_origin="http://example.com")
    with pytest.raises(ValueError, match="must use HTTPS"):
        _ = settings.cors_allowed_origins


def test_production_rejects_empty_origin() -> None:
    settings = Settings(app_env="production", web_origin=" , ")
    with pytest.raises(ValueError, match="must explicitly name"):
        _ = settings.cors_allowed_origins


def test_development_still_allows_local_http() -> None:
    settings = Settings(app_env="development", web_origin="http://localhost:3000/")
    assert settings.cors_allowed_origins == ["http://localhost:3000"]
