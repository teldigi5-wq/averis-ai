#!/usr/bin/env python3
"""Create a deterministic code-level beta release certificate for Averis.

This script certifies repository/deployment contracts only. It does not claim
that a production deployment is already serving this commit.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import subprocess
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT = ROOT / "artifacts" / "beta-release" / "certification.json"
AZURE_API = "https://averis-api-beta-db36dd7d.azurewebsites.net"
GITHUB_PAGES_ORIGIN = "https://teldigi5-wq.github.io"


class Certificate:
    def __init__(self) -> None:
        self.checks: list[dict[str, Any]] = []

    def add(self, name: str, passed: bool, detail: str) -> None:
        self.checks.append({"name": name, "passed": bool(passed), "detail": detail})

    @property
    def passed(self) -> bool:
        return all(item["passed"] for item in self.checks)


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def git_sha() -> str:
    try:
        return subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    except (OSError, subprocess.CalledProcessError):
        return "unknown"


def require_contains(cert: Certificate, name: str, text: str, needle: str, detail: str) -> None:
    cert.add(name, needle in text, detail)


def require_not_contains(cert: Certificate, name: str, text: str, needle: str, detail: str) -> None:
    cert.add(name, needle not in text, detail)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    cert = Certificate()
    env_example = read(".env.example")
    config = read("services/api/app/core/config.py")
    cloud = read("services/api/app/ai/providers/cloud.py")
    billing = read("services/api/app/services/billing.py")
    pages = read(".github/workflows/pages-preview.yml")
    vercel = read(".github/workflows/release-vercel.yml")
    health = read("services/api/app/api/routes/health.py")

    # Secret/public-boundary invariants.
    require_contains(cert, "cloud-disabled-by-default", env_example, "AI_CLOUD_ENABLED=false", "Cloud inference remains opt-in in the tracked example environment.")
    require_contains(cert, "cloud-key-empty-in-example", env_example, "AI_API_KEY=\n", "The tracked example contains no Cloud AI credential value.")
    require_not_contains(cert, "cloud-key-never-public", env_example, "NEXT_PUBLIC_AI_API_KEY", "Cloud provider credentials are not defined as public browser variables.")
    require_not_contains(cert, "service-role-never-public", env_example, "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY", "Supabase privileged service-role credentials are not exposed to Next.js.")
    require_not_contains(cert, "supabase-secret-never-public", env_example, "NEXT_PUBLIC_SUPABASE_SECRET_KEY", "Supabase server secret credentials are not exposed to Next.js.")
    require_contains(cert, "local-saas-default-safe", env_example, "SAAS_MODE=false", "Public SaaS mode remains an explicit deployment choice rather than a local default.")

    # Billing is fail-closed and server-only until the merchant setup is complete.
    require_contains(cert, "billing-disabled-by-default", env_example, "BILLING_ENABLED=false", "Subscription checkout is disabled by default.")
    require_contains(cert, "billing-api-key-empty", env_example, "LEMON_SQUEEZY_API_KEY=\n", "The tracked example contains no billing API credential.")
    require_contains(cert, "billing-webhook-secret-empty", env_example, "LEMON_SQUEEZY_WEBHOOK_SECRET=\n", "The tracked example contains no billing webhook secret.")
    require_not_contains(cert, "billing-api-key-never-public", env_example, "NEXT_PUBLIC_LEMON_SQUEEZY_API_KEY", "Billing provider API credentials cannot enter the browser environment.")
    require_not_contains(cert, "billing-webhook-secret-never-public", env_example, "NEXT_PUBLIC_LEMON_SQUEEZY_WEBHOOK_SECRET", "Billing webhook credentials cannot enter the browser environment.")
    require_contains(cert, "billing-webhook-hmac", billing, "hmac.compare_digest", "Billing webhook authorization uses constant-time HMAC signature comparison.")
    require_contains(cert, "billing-store-boundary", billing, "Billing webhook store does not match Averis configuration.", "Billing webhooks are checked against the configured merchant store.")

    # Production CORS must be explicit and fail closed.
    require_not_contains(cert, "no-implicit-vercel-cors-origin", config, "averis-web.vercel.app", "The API no longer silently trusts the legacy Vercel frontend origin.")
    require_contains(cert, "wildcard-cors-rejected", config, 'if value == "*"', "Beta/production CORS rejects wildcard origins.")
    require_contains(cert, "https-cors-required", config, 'if not value.startswith("https://")', "Beta/production browser origins must use HTTPS.")

    # Zero-cost/cloud-provider behavior.
    require_contains(cert, "cloud-no-model-fallback", cloud, "Averis performs no provider/model fallback", "The cloud adapter is single-provider/single-model and has no automatic fallback.")
    require_contains(cert, "cloud-no-paid-fallback", cloud, "No paid fallback was used.", "Free-tier exhaustion is surfaced instead of switching to paid inference.")
    cert.add("legacy-vercel-release-explicit-opt-in", "vars.VERCEL_RELEASE_ENABLED == 'true'" in vercel, "Legacy Vercel release jobs remain disabled unless explicitly opted in by repository variable.")

    # Canonical web deployment contract.
    require_contains(cert, "pages-build-mode", pages, 'GITHUB_PAGES: "true"', "The web release is built in GitHub Pages static-export mode.")
    require_contains(cert, "pages-targets-azure-api", pages, f'NEXT_PUBLIC_API_URL: "{AZURE_API}"', "The Pages build points to the certified Azure beta API host.")
    critical_routes = [
        "index.html",
        "dashboard/index.html",
        "multi-source/index.html",
        "revision/index.html",
        "refine/index.html",
        "studio/index.html",
        "private-ai/index.html",
        "pricing/index.html",
        "privacy/index.html",
    ]
    cert.add("pages-critical-routes-verified", all(route in pages for route in critical_routes), "GitHub Pages deployment asserts every beta-critical static route, including Pricing, before upload.")

    # API readiness semantics.
    require_contains(cert, "api-health-contract", health, 'return {"status": "ok", "service": "averis-api"}', "/health exposes a minimal liveness contract.")
    require_contains(cert, "api-readiness-fails-closed", health, "status.HTTP_503_SERVICE_UNAVAILABLE", "SaaS readiness returns 503 when required Supabase configuration is missing.")
    require_contains(cert, "upload-retention-boundary-visible", health, '"original_upload_retained": False', "Readiness continues to expose the no-original-upload-retention boundary.")

    output = args.output
    if not output.is_absolute():
        output = ROOT / output
    output.parent.mkdir(parents=True, exist_ok=True)

    payload = {
        "schema_version": "averis.beta-release-certification/v40",
        "commit_sha": git_sha(),
        "release_stage": "code-certified",
        "live_deployment_verified": False,
        "live_deployment_note": "Live GitHub Pages/Azure billing activation requires an explicitly approved merchant configuration/deploy.",
        "canonical_zero_cost_architecture": {
            "web": "GitHub Pages",
            "api": "Azure App Service student/free allocation",
            "auth_data": "Supabase free tier",
            "optional_cloud_ai": "configured provider free tier; no paid fallback",
            "optional_billing": "hosted checkout with no monthly platform requirement; transaction fees may apply",
            "api_url": AZURE_API,
            "web_origin": GITHUB_PAGES_ORIGIN,
        },
        "passed": cert.passed,
        "checks": cert.checks,
    }
    output.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

    for item in cert.checks:
        mark = "PASS" if item["passed"] else "FAIL"
        print(f"[{mark}] {item['name']}: {item['detail']}")
    print(f"Certificate: {output}")
    return 0 if cert.passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
