from fastapi import APIRouter, Depends

from app.schemas.revision_preflight import (
    RevisionPreflightRequest,
    RevisionPreflightResponse,
    RevisionPreflightSourceEvidence,
)
from app.services.auth import AuthContext, require_user
from app.services.rate_limit import AI_REVISION, enforce_rate_limit
from app.services.revision_guardrails import build_revision_boundary
from app.services.revision_metrics import analyze_writing_style, overlap_review_band
from app.services.similarity import compare_texts

router = APIRouter(prefix="/ai/revision", tags=["ai"])


@router.post("/preflight", response_model=RevisionPreflightResponse)
async def revision_preflight(
    payload: RevisionPreflightRequest,
    auth: AuthContext = Depends(require_user),
) -> RevisionPreflightResponse:
    """Show revision evidence before any future model-generated suggestion.

    This endpoint deliberately does not rewrite text. It creates a stable product
    boundary so the client can show observable writing/source evidence first and
    can reject explicit detector-evasion / AI-humanizer goals before generation.
    """
    await enforce_rate_limit(auth, AI_REVISION)

    writing = analyze_writing_style(payload.text)
    source_report = None
    source_evidence = None

    if payload.source_text and payload.source_text.strip():
        source_report = compare_texts(
            document_text=payload.text,
            source_text=payload.source_text,
            source_name=payload.source_name,
        )
        strongest_passage = max(
            (match.score for match in source_report.matched_passages),
            default=None,
        )
        source_evidence = RevisionPreflightSourceEvidence(
            source_name=source_report.source_name,
            similarity_percent=source_report.similarity_percent,
            exact_overlap_percent=source_report.shingle_jaccard,
            fuzzy_passage_percent=source_report.sentence_match_score,
            matched_passage_count=len(source_report.matched_passages),
            strongest_passage_score=strongest_passage,
            review_band=overlap_review_band(source_report),
            evidence_note=source_report.evidence_note,
        )

    boundary = build_revision_boundary(
        requested_goal=payload.requested_goal,
        writing=writing,
        source_report=source_report,
    )

    return RevisionPreflightResponse(
        writing=writing,
        source_evidence=source_evidence,
        generation_eligible=boundary.generation_eligible,
        boundary=boundary.boundary,
        blocked_reason=boundary.blocked_reason,
        evidence_first_actions=list(boundary.evidence_first_actions),
    )
