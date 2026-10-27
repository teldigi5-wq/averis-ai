"""Fail-closed CPython TLS patch floor for CVE-2026-115557.

This is independent of the Dockerfile: Vercel's managed FastAPI runtime does
not use Docker images and may choose a Python patch version outside this repo.
Do not expose interpreter versions from public endpoints or swallow this error.
"""
from __future__ import annotations

import sys
from collections.abc import Sequence

# Security releases announcing the compromised eMudhra certificate denylist.
_PATCH_FLOORS: dict[tuple[int, int], int] = {
    (3, 11): 18,
    (3, 12): 16,
    (3, 13): 18,
    (3, 14): 10,
    (3, 15): 2,
}


def require_patched_python_tls(version: Sequence[int] | None = None) -> None:
    actual = tuple(sys.version_info[:3] if version is None else version[:3])
    floor = _PATCH_FLOORS.get(actual[:2])
    if floor is None or len(actual) != 3 or actual[2] < floor:
        raise RuntimeError(
            "Averis API refuses an unsupported or unpatched CPython TLS runtime "
            "(CVE-2026-115557); promote only after approved host verification"
        )
