from fastapi import APIRouter

from app.schemas.similarity import SimilarityCompareRequest, SimilarityReport
from app.services.similarity import compare_texts

router = APIRouter(prefix="/similarity", tags=["similarity"])


@router.post("/compare", response_model=SimilarityReport)
def compare(payload: SimilarityCompareRequest) -> SimilarityReport:
    return compare_texts(
        document_text=payload.document_text,
        source_text=payload.source_text,
        source_name=payload.source_name,
    )
