from fastapi import HTTPException

from app.api.routes.health import health, readiness
from app.core.config import get_settings


def test_health_reports_ok() -> None:
    assert health() == {"status": "ok", "service": "averis-api"}


def test_readiness_is_ready_in_local_mode() -> None:
    get_settings.cache_clear()
    payload = readiness()
    assert payload["status"] == "ready"
    assert payload["saas_mode"] is False
    assert payload["original_upload_retained"] is False


def test_readiness_fails_closed_when_saas_mode_lacks_supabase(monkeypatch) -> None:
    monkeypatch.setenv("SAAS_MODE", "true")
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_PUBLISHABLE_KEY", raising=False)
    monkeypatch.delenv("SUPABASE_ANON_KEY", raising=False)
    get_settings.cache_clear()

    try:
        readiness()
    except HTTPException as exc:
        assert exc.status_code == 503
    else:
        raise AssertionError("Readiness must fail closed without Supabase config")
    finally:
        monkeypatch.delenv("SAAS_MODE", raising=False)
        get_settings.cache_clear()
