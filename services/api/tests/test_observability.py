import json
import logging
import re

from fastapi.testclient import TestClient

from app.main import app


def _request_events(caplog) -> list[dict[str, object]]:
    events: list[dict[str, object]] = []
    for record in caplog.records:
        if record.name != "averis.request":
            continue
        events.append(json.loads(record.getMessage()))
    return events


def test_request_id_is_echoed_and_logged_without_query_content(caplog) -> None:
    client = TestClient(app)
    with caplog.at_level(logging.INFO, logger="averis.request"):
        response = client.get(
            "/health?document_text=private-assignment-text",
            headers={"X-Request-ID": "student-support-1234"},
        )

    assert response.status_code == 200
    assert response.headers["X-Request-ID"] == "student-support-1234"

    events = _request_events(caplog)
    assert events
    event = events[-1]
    assert event["request_id"] == "student-support-1234"
    assert event["method"] == "GET"
    assert event["path"] == "/health"
    assert event["status_code"] == 200
    assert event["outcome"] == "ok"
    assert "private-assignment-text" not in json.dumps(events)


def test_invalid_request_id_is_replaced_with_server_id(caplog) -> None:
    client = TestClient(app)
    with caplog.at_level(logging.INFO, logger="averis.request"):
        response = client.get("/health", headers={"X-Request-ID": "unsafe id !!!"})

    request_id = response.headers["X-Request-ID"]
    assert re.fullmatch(r"[0-9a-f]{32}", request_id)
    assert request_id != "unsafe id !!!"
    assert _request_events(caplog)[-1]["request_id"] == request_id


def test_handled_error_gets_request_id_and_warning_log(caplog) -> None:
    client = TestClient(app)
    with caplog.at_level(logging.WARNING, logger="averis.request"):
        response = client.get("/route-that-does-not-exist?token=do-not-log-this")

    assert response.status_code == 404
    assert response.headers.get("X-Request-ID")
    events = _request_events(caplog)
    assert events[-1]["status_code"] == 404
    assert events[-1]["outcome"] == "handled_error"
    assert events[-1]["path"] == "/route-that-does-not-exist"
    assert "do-not-log-this" not in json.dumps(events)


def test_cors_exposes_request_id_to_browser() -> None:
    client = TestClient(app)
    response = client.get("/health", headers={"Origin": "http://localhost:3000"})

    exposed = response.headers.get("access-control-expose-headers", "").lower()
    assert "x-request-id" in exposed
