from fastapi.testclient import TestClient

from app.main import app


def test_document_route_sanitizes_filename_and_uses_canonical_media_type() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/v1/documents/extract",
        files={"file": ("../../draft.txt", b"student submission text", "application/pdf")},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["filename"] == "draft.txt"
    assert payload["media_type"] == "text/plain"
    assert payload["text"] == "student submission text"


def test_document_route_rejects_spoofed_pdf() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/v1/documents/extract",
        files={"file": ("paper.pdf", b"not really a pdf", "application/pdf")},
    )

    assert response.status_code == 422
    assert "signature" in response.json()["detail"].lower()


def test_document_route_rejects_unsupported_extension() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/v1/documents/extract",
        files={"file": ("program.exe", b"MZ-not-executed", "application/octet-stream")},
    )

    assert response.status_code == 415
    assert "Supported: TXT, PDF, DOCX" in response.json()["detail"]
