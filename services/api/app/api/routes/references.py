from fastapi import APIRouter, Depends

from app.schemas.reference import (
    CitationAuditRequest,
    CitationAuditResponse,
    ReferenceParseRequest,
    ReferenceParseResponse,
    audit_response,
    parse_response,
)
from app.services.auth import AuthContext, require_user
from app.services.references import audit_citation_consistency, parse_reference_block


router = APIRouter(prefix="/references", tags=["references"])


@router.post("/parse", response_model=ReferenceParseResponse)
async def parse_references(
    payload: ReferenceParseRequest,
    _auth: AuthContext = Depends(require_user),
) -> ReferenceParseResponse:
    return parse_response(parse_reference_block(payload.references_text))


@router.post("/audit", response_model=CitationAuditResponse)
async def audit_references(
    payload: CitationAuditRequest,
    _auth: AuthContext = Depends(require_user),
) -> CitationAuditResponse:
    return audit_response(
        audit_citation_consistency(
            document_text=payload.document_text,
            reference_text=payload.references_text,
        )
    )
