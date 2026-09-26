from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.config import get_settings
from app.schemas.source import SourceResolveResponse, SourceSearchResponse, source_result_from_metadata
from app.services.auth import AuthContext, require_user
from app.services.crossref import CrossrefClient, CrossrefLookupError
from app.services.source_metadata import normalize_doi


router = APIRouter(prefix="/sources", tags=["sources"])


def _client() -> CrossrefClient:
    settings = get_settings()
    return CrossrefClient(
        base_url=settings.crossref_base_url,
        mailto=settings.crossref_mailto,
        timeout_seconds=settings.crossref_timeout_seconds,
    )


def _translate_error(exc: CrossrefLookupError) -> HTTPException:
    if exc.upstream_status == 429 or exc.retryable:
        return HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        )
    return HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail=str(exc),
    )


@router.get("/search", response_model=SourceSearchResponse)
async def search_sources(
    q: str = Query(min_length=3, max_length=300),
    limit: int = Query(default=5, ge=1, le=5),
    _auth: AuthContext = Depends(require_user),
) -> SourceSearchResponse:
    try:
        results = await _client().search(q, limit=limit)
    except CrossrefLookupError as exc:
        raise _translate_error(exc) from exc

    return SourceSearchResponse(
        query=q.strip(),
        results=[source_result_from_metadata(source) for source in results],
    )


@router.get("/resolve", response_model=SourceResolveResponse)
async def resolve_source(
    doi: str = Query(min_length=6, max_length=250),
    _auth: AuthContext = Depends(require_user),
) -> SourceResolveResponse:
    normalized = normalize_doi(doi)
    if normalized is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Enter a valid DOI.",
        )

    try:
        result = await _client().resolve_doi(normalized)
    except CrossrefLookupError as exc:
        raise _translate_error(exc) from exc

    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No Crossref record was found for this DOI.",
        )
    return SourceResolveResponse(result=source_result_from_metadata(result))
