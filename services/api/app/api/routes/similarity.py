from fastapi import APIRouter, Depends, HTTPException, status

from app.schemas.similarity import (
    SimilarityCompareRequest,
    SimilarityReport,
    SourceContributionReport,
    SourceContributionRequest,
)
from app.services.auth import AuthContext, require_user
from app.services.rate_limit import SIMILARITY_COMPARE, enforce_rate_limit
from app.services.similarity import compare_texts
from app.services.source_contributions import ContributionInputError, calculate_source_contributions
from app.services.usage import record_scan_usage

router = APIRouter(prefix="/similarity", tags=["similarity"])


@router.post("/compare", response_model=SimilarityReport)
async def compare(
    payload: SimilarityCompareRequest,
    auth: AuthContext = Depends(require_user),
) -> SimilarityReport:
    await enforce_rate_limit(auth, SIMILARITY_COMPARE)

    report = compare_texts(
        document_text=payload.document_text,
        source_text=payload.source_text,
        source_name=payload.source_name,
        exclude_quotes=payload.exclude_quotes,
        exclude_bibliography=payload.exclude_bibliography,
        min_match_words=payload.min_match_words,
    )

    receipt = await record_scan_usage(
        auth,
        document_name=payload.document_name,
        source_name=payload.source_name,
        similarity_percent=report.similarity_percent,
    )

    return report.model_copy(
        update={
            "scan_id": receipt.scan_id,
            "credits_remaining": receipt.credits_remaining,
        }
    )


@router.post("/contributions", response_model=SourceContributionReport)
async def contributions(
    payload: SourceContributionRequest,
    auth: AuthContext = Depends(require_user),
) -> SourceContributionReport:
    """Break already-supplied evidence across sources without creating a new verdict.

    This support endpoint is request-limited but does not consume an additional
    scan credit. It returns unique sentence-level document coverage, not another
    primary similarity score.
    """
    await enforce_rate_limit(auth, SIMILARITY_COMPARE)

    try:
        return calculate_source_contributions(
            document_text=payload.document_text,
            sources=[(source.source_name, source.source_text) for source in payload.sources],
            exclude_quotes=payload.exclude_quotes,
            exclude_bibliography=payload.exclude_bibliography,
            min_match_words=payload.min_match_words,
        )
    except ContributionInputError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
