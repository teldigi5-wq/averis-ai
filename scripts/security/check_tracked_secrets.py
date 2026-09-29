#!/usr/bin/env python3
"""Fail CI when tracked files contain high-confidence privileged secret material.

This is intentionally conservative. Public browser-safe identifiers such as
Supabase `sb_publishable_...` keys are not secrets and are not rejected.
"""

from __future__ import annotations

from pathlib import Path
import re
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[2]
SELF = Path(__file__).resolve()

FORBIDDEN_TRACKED_PATHS = (
    re.compile(r"(^|/)\.env$"),
    re.compile(r"(^|/)\.env\.(?!example$|template$)[^/]+$"),
    re.compile(r"(^|/)\.vercel/project\.json$"),
)

SECRET_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("private key block", re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----")),
    ("GitHub classic token", re.compile(r"\bgh[pousr]_[A-Za-z0-9]{30,}\b")),
    ("GitHub fine-grained token", re.compile(r"\bgithub_pat_[A-Za-z0-9_]{30,}\b")),
    ("Groq API key", re.compile(r"\bgsk_[A-Za-z0-9]{30,}\b")),
    ("Supabase secret key", re.compile(r"\bsb_secret_[A-Za-z0-9_-]{20,}\b")),
    ("AWS access key", re.compile(r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b")),
    ("Slack token", re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{20,}\b")),
    ("Stripe live secret", re.compile(r"\bsk_live_[A-Za-z0-9]{20,}\b")),
)

SERVICE_ROLE_ASSIGNMENT = re.compile(
    r"(?im)\bSUPABASE_SERVICE_ROLE_KEY\s*=\s*['\"]?([^\s'\"#]+)"
)
PLACEHOLDER_MARKERS = ("<", "${", "your_", "example", "placeholder", "changeme", "replace_me")


def tracked_files() -> list[Path]:
    result = subprocess.run(
        ["git", "ls-files", "-z"],
        cwd=ROOT,
        check=True,
        stdout=subprocess.PIPE,
    )
    paths: list[Path] = []
    for raw in result.stdout.split(b"\0"):
        if not raw:
            continue
        paths.append(ROOT / raw.decode("utf-8", errors="strict"))
    return paths


def looks_like_placeholder(value: str) -> bool:
    lowered = value.lower()
    return any(marker in lowered for marker in PLACEHOLDER_MARKERS)


def main() -> int:
    findings: list[str] = []

    for path in tracked_files():
        relative = path.relative_to(ROOT).as_posix()
        for pattern in FORBIDDEN_TRACKED_PATHS:
            if pattern.search(relative):
                findings.append(f"forbidden tracked credential/config path: {relative}")

        if path == SELF or not path.is_file():
            continue

        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue

        for label, pattern in SECRET_PATTERNS:
            if pattern.search(text):
                findings.append(f"{label}: {relative}")

        for match in SERVICE_ROLE_ASSIGNMENT.finditer(text):
            value = match.group(1).strip()
            if value and not looks_like_placeholder(value):
                findings.append(f"non-placeholder SUPABASE_SERVICE_ROLE_KEY assignment: {relative}")

    if findings:
        print("Tracked secret hygiene check FAILED:", file=sys.stderr)
        for finding in sorted(set(findings)):
            print(f" - {finding}", file=sys.stderr)
        print("Remove/revoke the credential before merging.", file=sys.stderr)
        return 1

    print("Tracked secret hygiene check passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
