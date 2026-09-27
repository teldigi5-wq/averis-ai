from io import BytesIO
import zipfile

import fitz
import pytest
from docx import Document

from app.services.document_parser import (
    UnsafeDocumentError,
    UnreadableDocumentError,
    canonical_media_type,
    extract_text,
    sanitize_filename,
)


def _pdf_bytes(text: str, *, encrypted: bool = False) -> bytes:
    pdf = fitz.open()
    page = pdf.new_page()
    page.insert_text((72, 72), text)
    if encrypted:
        payload = pdf.tobytes(
            encryption=fitz.PDF_ENCRYPT_AES_256,
            owner_pw="owner-password",
            user_pw="user-password",
        )
    else:
        payload = pdf.tobytes()
    pdf.close()
    return payload


def _docx_bytes(text: str) -> bytes:
    buffer = BytesIO()
    document = Document()
    document.add_paragraph(text)
    document.save(buffer)
    return buffer.getvalue()


def test_valid_txt_pdf_and_docx_extract() -> None:
    assert extract_text("notes.txt", b"plain UTF-8 text") == "plain UTF-8 text"
    assert "PDF evidence" in extract_text("paper.pdf", _pdf_bytes("PDF evidence"))
    assert extract_text("draft.docx", _docx_bytes("DOCX evidence")) == "DOCX evidence"


def test_txt_rejects_binary_and_invalid_utf8() -> None:
    with pytest.raises(UnsafeDocumentError, match="binary"):
        extract_text("notes.txt", b"hello\x00world")

    with pytest.raises(UnreadableDocumentError, match="UTF-8"):
        extract_text("notes.txt", b"\xff\xfe\xfd")


def test_pdf_requires_real_signature() -> None:
    with pytest.raises(UnreadableDocumentError, match="signature"):
        extract_text("paper.pdf", b"this is not a PDF")


def test_encrypted_pdf_is_rejected_cleanly() -> None:
    with pytest.raises(UnsafeDocumentError, match="Encrypted or password-protected"):
        extract_text("locked.pdf", _pdf_bytes("secret", encrypted=True))


def test_docx_requires_real_office_structure() -> None:
    buffer = BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("random.txt", "not a Word package")

    with pytest.raises(UnreadableDocumentError, match="Office document structure"):
        extract_text("fake.docx", buffer.getvalue())


def test_docx_rejects_archive_path_traversal() -> None:
    buffer = BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", "<Types />")
        archive.writestr("word/document.xml", "<w:document />")
        archive.writestr("../escape.txt", "escape")

    with pytest.raises(UnsafeDocumentError, match="unsafe archive path"):
        extract_text("unsafe.docx", buffer.getvalue())


def test_docx_rejects_extreme_compression_ratio() -> None:
    buffer = BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", "<Types />")
        archive.writestr("word/document.xml", "A" * 2_000_000)

    with pytest.raises(UnsafeDocumentError, match="suspiciously compressed"):
        extract_text("bomb.docx", buffer.getvalue())


def test_filename_sanitization_and_canonical_media_type() -> None:
    assert sanitize_filename(r"..\\..\\student<draft>.PDF") == "student_draft_.PDF"
    assert canonical_media_type("student.PDF") == "application/pdf"
    assert canonical_media_type("notes.txt") == "text/plain"
