import fitz

from app.services.report_pdf import build_integrity_report_pdf
from app.services.similarity import compare_texts


def test_integrity_report_pdf_contains_evidence_summary() -> None:
    document = (
        'A student wrote "quoted material should be optional evidence." '
        "Network security teams review suspicious traffic before escalation."
    )
    source = "Network security teams review suspicious traffic before escalation."
    report = compare_texts(
        document,
        source,
        "Reference article",
        exclude_quotes=True,
        min_match_words=5,
    )

    payload = build_integrity_report_pdf(document_name="assignment.pdf", report=report)
    assert payload.startswith(b"%PDF")
    assert len(payload) > 1000

    pdf = fitz.open(stream=payload, filetype="pdf")
    assert pdf.page_count >= 1
    text = "\n".join(page.get_text() for page in pdf)
    assert "AVERIS INTEGRITY REPORT" in text
    assert "Document: assignment.pdf" in text
    assert "Similarity:" in text
    assert "Minimum match size: 5 words" in text
    assert "quotes" in text
    assert "not by itself proof of plagiarism" in text
    assert "Network security teams review suspicious traffic" in text
    pdf.close()


def test_integrity_report_pdf_handles_no_passage_matches() -> None:
    report = compare_texts(
        "Ethernet switches learn MAC addresses.",
        "Plants convert sunlight into stored chemical energy.",
        "Different source",
    )
    payload = build_integrity_report_pdf(document_name="draft.txt", report=report)
    pdf = fitz.open(stream=payload, filetype="pdf")
    text = "\n".join(page.get_text() for page in pdf)
    assert "No strong sentence-level passage matches" in text
    assert "Evidence version: m3-evidence-controls-v1" in text
    pdf.close()
