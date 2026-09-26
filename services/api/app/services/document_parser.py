from io import BytesIO
from pathlib import Path

import fitz
from docx import Document


SUPPORTED_EXTENSIONS = {".txt", ".pdf", ".docx"}


class UnsupportedDocumentError(ValueError):
    pass


def extract_text(filename: str, content: bytes) -> str:
    suffix = Path(filename).suffix.lower()
    if suffix not in SUPPORTED_EXTENSIONS:
        raise UnsupportedDocumentError(
            f"Unsupported file type '{suffix or 'unknown'}'. Supported: TXT, PDF, DOCX."
        )

    if suffix == ".txt":
        return content.decode("utf-8", errors="replace").strip()

    if suffix == ".pdf":
        with fitz.open(stream=content, filetype="pdf") as pdf:
            return "\n".join(page.get_text("text") for page in pdf).strip()

    document = Document(BytesIO(content))
    return "\n".join(paragraph.text for paragraph in document.paragraphs).strip()
