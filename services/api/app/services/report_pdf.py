from __future__ import annotations

from datetime import datetime, timezone
import textwrap

import fitz

from app.schemas.similarity import SimilarityReport


_PAGE_WIDTH = 595
_PAGE_HEIGHT = 842
_MARGIN_X = 48
_TOP = 58
_BOTTOM = 56


def _safe_text(value: object) -> str:
    text = str(value)
    replacements = {
        "\u2018": "'",
        "\u2019": "'",
        "\u201c": '"',
        "\u201d": '"',
        "\u2013": "-",
        "\u2014": "-",
        "\u2026": "...",
        "\u2192": "->",
        "\u2191": "^",
        "\u2713": "OK",
    }
    for source, target in replacements.items():
        text = text.replace(source, target)
    return text.encode("latin-1", "replace").decode("latin-1")


class _PdfWriter:
    def __init__(self) -> None:
        self.doc = fitz.open()
        self.page: fitz.Page | None = None
        self.y = _TOP
        self.page_number = 0
        self.new_page()

    def new_page(self) -> None:
        self.page = self.doc.new_page(width=_PAGE_WIDTH, height=_PAGE_HEIGHT)
        self.page_number += 1
        self.y = _TOP
        self.page.insert_text((_MARGIN_X, 28), "Averis | Academic Integrity Intelligence", fontsize=8, fontname="helv")
        self.page.insert_text((_PAGE_WIDTH - 92, _PAGE_HEIGHT - 24), f"Page {self.page_number}", fontsize=8, fontname="helv")

    def _ensure(self, needed: float) -> None:
        if self.y + needed > _PAGE_HEIGHT - _BOTTOM:
            self.new_page()

    def line(self, text: object = "", *, size: float = 10, gap: float = 4, indent: float = 0) -> None:
        self._ensure(size + gap + 4)
        assert self.page is not None
        self.page.insert_text((_MARGIN_X + indent, self.y), _safe_text(text), fontsize=size, fontname="helv")
        self.y += size + gap

    def paragraph(self, text: object, *, size: float = 9.5, width: int = 88, gap: float = 7, indent: float = 0) -> None:
        value = _safe_text(text).strip()
        if not value:
            self.y += gap
            return
        for paragraph in value.splitlines() or [value]:
            wrapped = textwrap.wrap(paragraph, width=width) or [""]
            for row in wrapped:
                self.line(row, size=size, gap=2, indent=indent)
            self.y += gap

    def section(self, title: str) -> None:
        self._ensure(30)
        self.y += 5
        self.line(title.upper(), size=12, gap=6)


def build_integrity_report_pdf(*, document_name: str, report: SimilarityReport) -> bytes:
    """Render one evidence-first integrity report entirely in memory.

    The report is generated from a freshly recomputed SimilarityReport. It is not
    persisted by this function and does not turn evidence into a misconduct verdict.
    """
    writer = _PdfWriter()
    generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    writer.line("AVERIS INTEGRITY REPORT", size=20, gap=9)
    writer.paragraph("Evidence-first academic similarity review", size=11, width=70, gap=8)
    writer.line(f"Document: {document_name}", size=10)
    writer.line(f"Source: {report.source_name}", size=10)
    writer.line(f"Generated: {generated_at}", size=9)
    writer.paragraph(
        "This report supports human review. A similarity percentage, matched passage, or excluded section is not by itself proof of plagiarism or academic misconduct.",
        size=9.5,
        width=88,
        gap=12,
    )

    writer.section("Evidence summary")
    writer.line(f"Similarity: {report.similarity_percent}%", size=14, gap=5)
    writer.line(f"Word-shingle overlap: {report.shingle_jaccard}%")
    writer.line(f"Passage strength: {report.sentence_match_score}%")
    writer.line(f"Reviewable passage matches: {len(report.matched_passages)}")
    writer.line(f"Evidence version: {report.evidence_version}")

    writer.section("Analysis controls")
    writer.line(f"Minimum match size: {report.min_match_words} words")
    writer.line(f"Original submission words: {report.document_words_original if report.document_words_original is not None else 'n/a'}")
    writer.line(f"Analyzed words: {report.document_words_analyzed if report.document_words_analyzed is not None else 'n/a'}")
    writer.line(f"Excluded words: {report.document_words_excluded if report.document_words_excluded is not None else 'n/a'}")
    applied = ", ".join(report.exclusions_applied) if report.exclusions_applied else "none detected"
    writer.line(f"Applied text exclusions: {applied}")
    writer.paragraph(
        "Exclusions are reported only when the requested control matched actual text. Quote exclusion does not evaluate citation quality, and bibliography exclusion does not validate reference accuracy.",
        size=9,
        width=90,
    )

    writer.section("Matched passage evidence")
    if not report.matched_passages:
        writer.paragraph("No strong sentence-level passage matches were returned after the selected controls.")
    else:
        for index, match in enumerate(report.matched_passages, start=1):
            writer._ensure(92)
            writer.line(f"Match {index} | {round(match.score, 2)}% passage score", size=10.5, gap=5)
            writer.line("SUBMISSION", size=8.5, gap=3)
            writer.paragraph(match.document_sentence, size=9, width=86, gap=5, indent=8)
            writer.line("SOURCE", size=8.5, gap=3)
            writer.paragraph(match.source_sentence, size=9, width=86, gap=9, indent=8)

    writer.section("Method and scope")
    writer.paragraph(report.evidence_note, size=9, width=90, gap=8)
    writer.paragraph(
        "Candidate MinHash and lexical vector signals are retrieval aids and are intentionally not presented as independent semantic or misconduct verdicts in this report.",
        size=9,
        width=90,
        gap=8,
    )
    writer.paragraph(
        "Averis is an independent pre-submission academic integrity assistant. Final academic-integrity decisions belong to students, educators, and institutions using their own policies and evidence.",
        size=9,
        width=90,
        gap=8,
    )

    writer.doc.set_metadata(
        {
            "title": f"Averis Integrity Report - {_safe_text(document_name)}",
            "author": "Averis",
            "subject": "Evidence-first academic similarity review",
            "creator": "Averis Academic Integrity Intelligence",
        }
    )
    output = writer.doc.tobytes(garbage=4, deflate=True)
    writer.doc.close()
    return output
