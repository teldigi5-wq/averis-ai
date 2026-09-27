from __future__ import annotations

from io import BytesIO
from pathlib import PurePosixPath
import re
import unicodedata
import zipfile

import fitz
from docx import Document


SUPPORTED_EXTENSIONS = {".txt", ".pdf", ".docx"}
CANONICAL_MEDIA_TYPES = {
    ".txt": "text/plain",
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}

MAX_FILENAME_CHARACTERS = 140
MAX_EXTRACTED_CHARACTERS = 2_000_000
MAX_PDF_PAGES = 300
MAX_DOCX_ENTRIES = 2_000
MAX_DOCX_UNCOMPRESSED_BYTES = 40 * 1024 * 1024
MAX_DOCX_ENTRY_BYTES = 20 * 1024 * 1024
MAX_DOCX_COMPRESSION_RATIO = 200.0
PDF_HEADER_SCAN_BYTES = 1_024


class DocumentValidationError(ValueError):
    pass


class UnsupportedDocumentError(DocumentValidationError):
    pass


class UnsafeDocumentError(DocumentValidationError):
    pass


class UnreadableDocumentError(DocumentValidationError):
    pass


def sanitize_filename(filename: str) -> str:
    """Return a display-safe basename without trusting client path data."""
    normalized = unicodedata.normalize("NFKC", filename or "upload")
    normalized = normalized.replace("\\", "/").split("/")[-1]
    normalized = re.sub(r"[\x00-\x1f\x7f]", "", normalized)
    normalized = re.sub(r'[<>:"|?*]', "_", normalized).strip(" .")
    if not normalized or normalized in {".", ".."}:
        normalized = "upload"

    if len(normalized) <= MAX_FILENAME_CHARACTERS:
        return normalized

    dot = normalized.rfind(".")
    suffix = normalized[dot:] if dot > 0 else ""
    stem_budget = max(1, MAX_FILENAME_CHARACTERS - len(suffix))
    return f"{normalized[:stem_budget]}{suffix}"


def canonical_media_type(filename: str) -> str | None:
    suffix = _suffix(filename)
    return CANONICAL_MEDIA_TYPES.get(suffix)


def _suffix(filename: str) -> str:
    safe_name = sanitize_filename(filename)
    dot = safe_name.rfind(".")
    return safe_name[dot:].lower() if dot >= 0 else ""


def _require_supported_extension(filename: str) -> str:
    suffix = _suffix(filename)
    if suffix not in SUPPORTED_EXTENSIONS:
        raise UnsupportedDocumentError(
            f"Unsupported file type '{suffix or 'unknown'}'. Supported: TXT, PDF, DOCX."
        )
    return suffix


def _enforce_extracted_text_budget(text: str) -> str:
    text = text.strip()
    if len(text) > MAX_EXTRACTED_CHARACTERS:
        raise UnsafeDocumentError(
            "Document contains too much extracted text for one analysis request."
        )
    return text


def _extract_txt(content: bytes) -> str:
    if b"\x00" in content:
        raise UnsafeDocumentError("TXT file appears to contain binary data.")

    try:
        text = content.decode("utf-8-sig", errors="strict")
    except UnicodeDecodeError as exc:
        raise UnreadableDocumentError("TXT file must use UTF-8 text encoding.") from exc

    if text:
        disallowed_controls = sum(
            1 for char in text if ord(char) < 32 and char not in {"\t", "\n", "\r", "\f"}
        )
        if disallowed_controls / len(text) > 0.01:
            raise UnsafeDocumentError("TXT file contains excessive control characters.")

    return _enforce_extracted_text_budget(text)


def _extract_pdf(content: bytes) -> str:
    header = content[:PDF_HEADER_SCAN_BYTES]
    if b"%PDF-" not in header:
        raise UnreadableDocumentError("File extension is PDF but the PDF signature is missing.")

    try:
        with fitz.open(stream=content, filetype="pdf") as pdf:
            if pdf.needs_pass:
                raise UnsafeDocumentError("Encrypted or password-protected PDFs are not accepted.")
            if pdf.page_count > MAX_PDF_PAGES:
                raise UnsafeDocumentError(
                    f"PDF exceeds the {MAX_PDF_PAGES}-page analysis limit."
                )

            pages: list[str] = []
            characters = 0
            for page in pdf:
                page_text = page.get_text("text")
                characters += len(page_text)
                if characters > MAX_EXTRACTED_CHARACTERS:
                    raise UnsafeDocumentError(
                        "PDF contains too much extracted text for one analysis request."
                    )
                pages.append(page_text)
            return _enforce_extracted_text_budget("\n".join(pages))
    except (UnsafeDocumentError, UnreadableDocumentError):
        raise
    except Exception as exc:
        raise UnreadableDocumentError("PDF is malformed or could not be read safely.") from exc


def _safe_zip_path(name: str) -> bool:
    normalized = name.replace("\\", "/")
    path = PurePosixPath(normalized)
    return not path.is_absolute() and ".." not in path.parts


def _preflight_docx(content: bytes) -> None:
    try:
        with zipfile.ZipFile(BytesIO(content)) as archive:
            infos = archive.infolist()
            if len(infos) > MAX_DOCX_ENTRIES:
                raise UnsafeDocumentError("DOCX contains too many archive entries.")

            total_uncompressed = 0
            names: set[str] = set()
            for info in infos:
                normalized_name = info.filename.replace("\\", "/")
                if not _safe_zip_path(normalized_name):
                    raise UnsafeDocumentError("DOCX contains an unsafe archive path.")
                if info.flag_bits & 0x1:
                    raise UnsafeDocumentError("Encrypted DOCX archive entries are not accepted.")
                if info.is_dir():
                    continue

                names.add(normalized_name)
                if info.file_size > MAX_DOCX_ENTRY_BYTES:
                    raise UnsafeDocumentError("DOCX contains an oversized archive entry.")

                total_uncompressed += info.file_size
                if total_uncompressed > MAX_DOCX_UNCOMPRESSED_BYTES:
                    raise UnsafeDocumentError("DOCX expands beyond the safe processing budget.")

                if info.file_size > 1_000_000:
                    if info.compress_size <= 0:
                        raise UnsafeDocumentError("DOCX contains an invalid compressed entry.")
                    ratio = info.file_size / info.compress_size
                    if ratio > MAX_DOCX_COMPRESSION_RATIO:
                        raise UnsafeDocumentError(
                            "DOCX contains a suspiciously compressed archive entry."
                        )

            if "[Content_Types].xml" not in names or "word/document.xml" not in names:
                raise UnreadableDocumentError("File extension is DOCX but the Office document structure is missing.")
    except (UnsafeDocumentError, UnreadableDocumentError):
        raise
    except zipfile.BadZipFile as exc:
        raise UnreadableDocumentError("File extension is DOCX but the ZIP container is invalid.") from exc
    except Exception as exc:
        raise UnreadableDocumentError("DOCX container could not be inspected safely.") from exc


def _extract_docx(content: bytes) -> str:
    _preflight_docx(content)
    try:
        document = Document(BytesIO(content))
        text = "\n".join(paragraph.text for paragraph in document.paragraphs)
        return _enforce_extracted_text_budget(text)
    except (UnsafeDocumentError, UnreadableDocumentError):
        raise
    except Exception as exc:
        raise UnreadableDocumentError("DOCX is malformed or could not be read safely.") from exc


def extract_text(filename: str, content: bytes) -> str:
    suffix = _require_supported_extension(filename)
    if not content:
        raise UnreadableDocumentError("Document is empty.")

    if suffix == ".txt":
        return _extract_txt(content)
    if suffix == ".pdf":
        return _extract_pdf(content)
    return _extract_docx(content)
