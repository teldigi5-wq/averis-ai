from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.schemas.document import ExtractedDocument
from app.services.auth import AuthContext, require_user
from app.services.document_parser import UnsupportedDocumentError, extract_text
from app.services.rate_limit import DOCUMENT_EXTRACT, enforce_rate_limit

router = APIRouter(prefix="/documents", tags=["documents"])

MAX_UPLOAD_BYTES = 15 * 1024 * 1024


@router.post("/extract", response_model=ExtractedDocument)
async def extract_document(
    file: UploadFile = File(...),
    auth: AuthContext = Depends(require_user),
) -> ExtractedDocument:
    await enforce_rate_limit(auth, DOCUMENT_EXTRACT)

    filename = file.filename or "upload"
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds the 15 MB limit.")

    try:
        text = extract_text(filename, content)
    except UnsupportedDocumentError as exc:
        raise HTTPException(status_code=415, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=422, detail="Document could not be parsed.") from exc

    if not text.strip():
        raise HTTPException(status_code=422, detail="No readable text was found in the document.")

    return ExtractedDocument(
        filename=filename,
        media_type=file.content_type,
        characters=len(text),
        words=len(text.split()),
        text=text,
    )
