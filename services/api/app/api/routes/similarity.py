from fastapi import APIRouter, Depends

from app.schemas.similarity import SimilarityCompareRequest, SimilarityReport
from app.services.auth import AuthContext, require_user
from app.services.rate_limit import SIMILARITY_COMPARE, enforce_rate_limit
from app.services.similarity import compare_texts
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
