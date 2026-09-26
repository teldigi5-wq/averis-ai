from fastapi import APIRouter, Depends, HTTPException, status

from app.core.config import get_settings
from app.schemas.reference import (
    CitationAuditRequest,
    CitationAuditResponse,
    ReferenceParseRequest,
    ReferenceParseResponse,
    ReferenceVerificationRequest,
    ReferenceVerificationResponse,
    audit_response,
    parse_response,
    verification_response,
)
from app.services.auth import AuthContext, require_user
from app.services.crossref import CrossrefClient, CrossrefLookupError
from app.services.rate_limit import (
    REFERENCE_AUDIT,
    REFERENCE_PARSE,
    REFERENCE_VERIFY,
    enforce_rate_limit,
)
from app.services.reference_verification import verify_reference_block
from app.services.references import audit_citation_consistency, parse_reference_block


router = APIRouter(prefix="/references", tags=["references"])


def _crossref_client() -> CrossrefClient:
    settings = get_settings()
    return CrossrefClient(
        base_url=settings.crossref_base_url,
        mailto=settings.crossref_mailto,
        timeout_seconds=settings.crossref_timeout_seconds,
    )


def _translate_crossref_error(exc: CrossrefLookupError) -> HTTPException:
    if exc.upstream_status == 429 or exc.retryable:
        return HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        )
    return HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail=str(exc),
    )


@router.post("/parse", response_model=ReferenceParseResponse)
async def parse_references(
    payload: ReferenceParseRequest,
    auth: AuthContext = Depends(require_user),
) -> ReferenceParseResponse:
    await enforce_rate_limit(auth, REFERENCE_PARSE)
    return parse_response(parse_reference_block(payload.references_text))


@router.post("/audit", response_model=CitationAuditResponse)
async def audit_references(
    payload: CitationAuditRequest,
    auth: AuthContext = Depends(require_user),
) -> CitationAuditResponse:
    await enforce_rate_limit(auth, REFERENCE_AUDIT)
    return audit_response(
        audit_citation_consistency(
            document_text=payload.document_text,
            reference_text=payload.references_text,
        )
    )


@router.post("/verify", response_model=ReferenceVerificationResponse)
async def verify_references(
    payload: ReferenceVerificationRequest,
    auth: AuthContext = Depends(require_user),
) -> ReferenceVerificationResponse:
    await enforce_rate_limit(auth, REFERENCE_VERIFY)
    try:
        results = await verify_reference_block(
            payload.references_text,
            crossref=_crossref_client(),
            limit=payload.limit,
        )
    except CrossrefLookupError as exc:
        raise _translate_crossref_error(exc) from exc
    return verification_response(results)
