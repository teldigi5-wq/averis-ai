#!/usr/bin/env python3
"""Public, secret-free smoke checks for the live Averis beta.

The probe intentionally validates only externally observable release contracts:
GitHub Pages routes, Azure health/readiness, the revision runtime OpenAPI shape,
and the explicit CORS allow/block boundary.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

DEFAULT_PAGES_BASE = "https://teldigi5-wq.github.io/averis-ai"
DEFAULT_API_BASE = "https://averis-api-beta-db36dd7d.azurewebsites.net"
DEFAULT_ALLOWED_ORIGIN = "https://teldigi5-wq.github.io"
DEFAULT_BLOCKED_ORIGIN = "https://example.com"
USER_AGENT = "Averis-Live-Beta-Smoke/1.0"
TIMEOUT_SECONDS = 20
RETRIES = 3

PAGES_ROUTES = (
    "/",
    "/dashboard/",
    "/multi-source/",
    "/revision/",
    "/refine/",
    "/studio/",
    "/private-ai/",
    "/privacy/",
)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_base(value: str) -> str:
    return value.rstrip("/")


def request(
    url: str,
    *,
    method: str = "GET",
    headers: dict[str, str] | None = None,
) -> tuple[int, dict[str, str], bytes]:
    merged_headers = {"User-Agent": USER_AGENT, **(headers or {})}
    last_error: Exception | None = None

    for attempt in range(RETRIES):
        req = Request(url, method=method, headers=merged_headers)
        try:
            with urlopen(req, timeout=TIMEOUT_SECONDS) as response:
                return response.status, dict(response.headers.items()), response.read()
        except HTTPError as exc:
            body = exc.read()
            response_headers = dict(exc.headers.items()) if exc.headers else {}
            if 500 <= exc.code < 600 and attempt < RETRIES - 1:
                last_error = exc
                time.sleep(2**attempt)
                continue
            return exc.code, response_headers, body
        except (URLError, TimeoutError, OSError) as exc:
            last_error = exc
            if attempt < RETRIES - 1:
                time.sleep(2**attempt)
                continue
            break

    raise RuntimeError(f"request failed after {RETRIES} attempts: {url}: {last_error}")


def json_request(url: str) -> tuple[int, dict[str, str], dict[str, Any]]:
    status, headers, raw = request(url)
    try:
        data = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"expected JSON from {url}: {exc}") from exc
    if not isinstance(data, dict):
        raise RuntimeError(f"expected a JSON object from {url}")
    return status, headers, data


def header(headers: dict[str, str], name: str) -> str | None:
    target = name.casefold()
    for key, value in headers.items():
        if key.casefold() == target:
            return value
    return None


def record(
    checks: list[dict[str, Any]],
    name: str,
    ok: bool,
    *,
    details: dict[str, Any] | None = None,
    error: str | None = None,
) -> None:
    entry: dict[str, Any] = {"name": name, "ok": ok}
    if details:
        entry["details"] = details
    if error:
        entry["error"] = error
    checks.append(entry)
    state = "PASS" if ok else "FAIL"
    print(f"[{state}] {name}")
    if error:
        print(f"       {error}")


def check_pages(pages_base: str, checks: list[dict[str, Any]]) -> None:
    for route in PAGES_ROUTES:
        url = f"{pages_base}{route}"
        name = f"pages:{route}"
        try:
            status, _, body = request(url)
            text = body.decode("utf-8", errors="replace")
            ok = status == 200 and "Averis" in text
            record(
                checks,
                name,
                ok,
                details={"status": status, "url": url},
                error=None if ok else "expected HTTP 200 and Averis marker in HTML",
            )
        except Exception as exc:  # noqa: BLE001 - smoke runner must report all failures
            record(checks, name, False, details={"url": url}, error=str(exc))


def check_api(api_base: str, checks: list[dict[str, Any]]) -> None:
    health_url = f"{api_base}/health"
    try:
        status, _, data = json_request(health_url)
        ok = status == 200 and data.get("status") == "ok" and data.get("service") == "averis-api"
        record(
            checks,
            "api:health",
            ok,
            details={"status": status, "payload": data},
            error=None if ok else "health contract drifted",
        )
    except Exception as exc:  # noqa: BLE001
        record(checks, "api:health", False, details={"url": health_url}, error=str(exc))

    readiness_url = f"{api_base}/readiness"
    try:
        status, _, data = json_request(readiness_url)
        expected = {
            "status": "ready",
            "service": "averis-api",
            "saas_mode": True,
            "supabase_configured": True,
            "original_upload_retained": False,
        }
        ok = status == 200 and all(data.get(key) == value for key, value in expected.items())
        record(
            checks,
            "api:readiness",
            ok,
            details={"status": status, "payload": data},
            error=None if ok else "readiness/privacy contract drifted",
        )
    except Exception as exc:  # noqa: BLE001
        record(checks, "api:readiness", False, details={"url": readiness_url}, error=str(exc))

    openapi_url = f"{api_base}/openapi.json"
    try:
        status, _, spec = json_request(openapi_url)
        paths = spec.get("paths") if isinstance(spec.get("paths"), dict) else {}
        schemas = spec.get("components", {}).get("schemas", {}) if isinstance(spec.get("components"), dict) else {}
        request_schema = schemas.get("RevisionRefineRequest", {}) if isinstance(schemas, dict) else {}
        properties = request_schema.get("properties", {}) if isinstance(request_schema, dict) else {}
        runtime = properties.get("runtime", {}) if isinstance(properties, dict) else {}
        enum_values = runtime.get("enum", []) if isinstance(runtime, dict) else []
        default_runtime = runtime.get("default") if isinstance(runtime, dict) else None
        route_present = "/api/v1/ai/revision/refine" in paths and "post" in paths.get(
            "/api/v1/ai/revision/refine", {}
        )
        runtimes_ok = isinstance(enum_values, list) and {"ollama", "cloud"}.issubset(set(enum_values))
        ok = status == 200 and route_present and runtimes_ok and default_runtime == "ollama"
        record(
            checks,
            "api:revision-runtime-contract",
            ok,
            details={
                "status": status,
                "route_present": route_present,
                "runtime_enum": enum_values,
                "runtime_default": default_runtime,
            },
            error=None if ok else "revision runtime OpenAPI contract drifted",
        )
    except Exception as exc:  # noqa: BLE001
        record(checks, "api:revision-runtime-contract", False, details={"url": openapi_url}, error=str(exc))


def cors_preflight(api_base: str, origin: str) -> tuple[int, dict[str, str]]:
    status, headers, _ = request(
        f"{api_base}/health",
        method="OPTIONS",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    return status, headers


def check_cors(
    api_base: str,
    allowed_origin: str,
    blocked_origin: str,
    checks: list[dict[str, Any]],
) -> None:
    try:
        status, headers = cors_preflight(api_base, allowed_origin)
        allow_origin = header(headers, "Access-Control-Allow-Origin")
        ok = status == 200 and allow_origin == allowed_origin
        record(
            checks,
            "cors:allowed-pages-origin",
            ok,
            details={"status": status, "allow_origin": allow_origin, "origin": allowed_origin},
            error=None if ok else "GitHub Pages origin is not explicitly allowed",
        )
    except Exception as exc:  # noqa: BLE001
        record(checks, "cors:allowed-pages-origin", False, error=str(exc))

    try:
        status, headers = cors_preflight(api_base, blocked_origin)
        allow_origin = header(headers, "Access-Control-Allow-Origin")
        ok = status in {400, 403} and allow_origin is None
        record(
            checks,
            "cors:blocked-untrusted-origin",
            ok,
            details={"status": status, "allow_origin": allow_origin, "origin": blocked_origin},
            error=None if ok else "untrusted origin was not rejected by the CORS preflight boundary",
        )
    except Exception as exc:  # noqa: BLE001
        record(checks, "cors:blocked-untrusted-origin", False, error=str(exc))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pages-base", default=DEFAULT_PAGES_BASE)
    parser.add_argument("--api-base", default=DEFAULT_API_BASE)
    parser.add_argument("--allowed-origin", default=DEFAULT_ALLOWED_ORIGIN)
    parser.add_argument("--blocked-origin", default=DEFAULT_BLOCKED_ORIGIN)
    parser.add_argument("--output", default="live-beta-smoke.json")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    pages_base = normalize_base(args.pages_base)
    api_base = normalize_base(args.api_base)
    checks: list[dict[str, Any]] = []

    started_at = now_iso()
    check_pages(pages_base, checks)
    check_api(api_base, checks)
    check_cors(api_base, args.allowed_origin, args.blocked_origin, checks)

    failures = [check for check in checks if not check["ok"]]
    report = {
        "schema_version": 1,
        "release_stage": "live-beta",
        "started_at": started_at,
        "completed_at": now_iso(),
        "github_sha": os.getenv("GITHUB_SHA"),
        "github_run_id": os.getenv("GITHUB_RUN_ID"),
        "pages_base": pages_base,
        "api_base": api_base,
        "allowed_origin": args.allowed_origin,
        "blocked_origin": args.blocked_origin,
        "checks_total": len(checks),
        "checks_passed": len(checks) - len(failures),
        "checks_failed": len(failures),
        "checks": checks,
    }

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    print(
        f"Live beta smoke: {report['checks_passed']}/{report['checks_total']} passed; "
        f"artifact={output_path}"
    )
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
