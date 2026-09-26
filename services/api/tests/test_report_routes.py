import fitz
from fastapi.testclient import TestClient

from app.main import app


def test_integrity_report_route_returns_downloadable_pdf() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/v1/reports/integrity.pdf",
        json={
            "document_text": "Network security teams review suspicious traffic before escalation.",
            "source_text": "Network security teams review suspicious traffic before escalation.",
            "source_name": "Manual evidence source",
            "document_name": "Assignment Final.docx",
            "exclude_quotes": False,
            "exclude_bibliography": False,
            "min_match_words": 5,
        },
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/pdf")
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-averis-evidence-version"] == "m3-evidence-controls-v1"
    assert response.headers["content-disposition"] == 'attachment; filename="Assignment-Final-averis-integrity-report.pdf"'
    assert response.content.startswith(b"%PDF")

    pdf = fitz.open(stream=response.content, filetype="pdf")
    text = "\n".join(page.get_text() for page in pdf)
    assert "Manual evidence source" in text
    assert "Assignment Final.docx" in text
    assert "100.0% passage score" in text
    pdf.close()


def test_integrity_report_route_validates_match_threshold() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/v1/reports/integrity.pdf",
        json={
            "document_text": "Enough document text for validation.",
            "source_text": "Enough source text for validation.",
            "min_match_words": 2,
        },
    )
    assert response.status_code == 422
