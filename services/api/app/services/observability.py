from __future__ import annotations

import json
import logging
import re
from time import perf_counter
from uuid import uuid4

from fastapi import Request


logger = logging.getLogger("averis.request")
_REQUEST_ID = re.compile(r"^[A-Za-z0-9._-]{8,128}$")


def request_id_from_header(value: str | None) -> str:
    """Use a caller correlation ID only when it is safe for headers/logs."""
    candidate = (value or "").strip()
    if candidate and _REQUEST_ID.fullmatch(candidate):
        return candidate
    return uuid4().hex


def start_request_observation(request: Request) -> tuple[str, float]:
    request_id = request_id_from_header(request.headers.get("x-request-id"))
    request.state.request_id = request_id
    return request_id, perf_counter()


def emit_request_log(
    *,
    request_id: str,
    method: str,
    path: str,
    status_code: int,
    started_at: float,
    outcome: str,
    error_type: str | None = None,
) -> None:
    """Emit a bounded JSON log record without request/user/content data."""
    payload: dict[str, object] = {
        "event": "http_request",
        "request_id": request_id,
        "method": method.upper(),
        "path": path,
        "status_code": status_code,
        "duration_ms": round(max(0.0, (perf_counter() - started_at) * 1000), 2),
        "outcome": outcome,
    }
    if error_type:
        payload["error_type"] = error_type

    message = json.dumps(payload, separators=(",", ":"), sort_keys=True)
    if status_code >= 500:
        logger.error(message)
    elif status_code >= 400:
        logger.warning(message)
    else:
        logger.info(message)
