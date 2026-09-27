from __future__ import annotations

from fastapi import APIRouter, Depends

from app.ai.providers.ollama import OllamaProvider
from app.core.config import get_settings
from app.schemas.revision import (
    RevisionAnalyzeRequest,
    RevisionAnalyzeResponse,
    SourceEvidenceMetrics,
)
from app.schemas.similarity import PassageMatch
from app.services.auth import AuthContext, require_user
from app.services.rate_limit import AI_REVISION, enforce_rate_limit
from app.services.revision_metrics import (
    analyze_writing_style,
    build_revision_actions,
    cosine_percent,
    overlap_review_band,
)
from app.services.semantic_evidence import semantic_passage_matches
from app.services.similarity import compare_texts

router = APIRouter(prefix="/ai", tags=["ai"])


@router.get("/status")
async def ai_status() -> dict[str, object]:
    settings = get_settings()
    if settings.ai_provider.casefold() != "ollama":
        return {
            "provider": settings.ai_provider,
            "revision_enabled": settings.ai_revision_enabled,
            "reachable": False,
            "note": "Only the local Ollama adapter is implemented for AI Evidence Layer v1.",
        }

    provider = OllamaProvider(
        settings.ollama_base_url,
        settings.ollama_model,
        timeout_seconds=settings.ollama_timeout_seconds,
    )
    health = await provider.health()
    return {
        **health,
        "revision_enabled": settings.ai_revision_enabled,
        "embedding_model": settings.ollama_embedding_model,
        "boundary": "AI output is assistive evidence/revision guidance, not an authorship or misconduct verdict.",
    }


@router.post("/revision/analyze", response_model=RevisionAnalyzeResponse)
async def analyze_revision(
    payload: RevisionAnalyzeRequest,
    auth: AuthContext = Depends(require_user),
) -> RevisionAnalyzeResponse:
    """Return transparent originality/style metrics plus optional local AI evidence.

    This endpoint consumes no scan credit and never rewrites a submission. Its
    writing-style metrics are revision signals, not an AI-authorship detector.
    """
    await enforce_rate_limit(auth, AI_REVISION)
    settings = get_settings()

    writing = analyze_writing_style(payload.text)
    source_report = None
    if payload.source_text and payload.source_text.strip():
        source_report = compare_texts(
            document_text=payload.text,
            source_text=payload.source_text,
            source_name=payload.source_name,
        )

    semantic_similarity: float | None = None
    semantic_provider: str | None = None
    semantic_passages: list[PassageMatch] = []
    coach_summary: str | None = None

    if settings.ai_revision_enabled and settings.ai_provider.casefold() == "ollama":
        provider = OllamaProvider(
            settings.ollama_base_url,
            settings.ollama_model,
            timeout_seconds=settings.ollama_timeout_seconds,
        )

        if source_report is not None and payload.source_text:
            # Whole-text cosine is a broad candidate signal. Sentence-level
            # semantic evidence below catches stronger paraphrase candidates.
            embeddings = await provider.embed_texts(
                [payload.text[:12_000], payload.source_text[:12_000]],
                model=settings.ollama_embedding_model,
            )
            if embeddings and len(embeddings) == 2:
                semantic_similarity = cosine_percent(embeddings[0], embeddings[1])
                if semantic_similarity is not None:
                    semantic_provider = f"ollama:{settings.ollama_embedding_model}"

            semantic_matches = await semantic_passage_matches(
                provider,
                payload.text,
                payload.source_text,
                model=settings.ollama_embedding_model,
            )
            if semantic_matches is not None:
                semantic_passages = [
                    PassageMatch(
                        document_sentence=match.document_sentence,
                        source_sentence=match.source_sentence,
                        score=match.score,
                    )
                    for match in semantic_matches
                ]
                if semantic_passages and semantic_provider is None:
                    semantic_provider = f"ollama:{settings.ollama_embedding_model}"

        if payload.include_ai_coach:
            source_summary = "No comparison source supplied."
            if source_report is not None:
                strongest_semantic_passage = max(
                    (match.score for match in semantic_passages),
                    default=None,
                )
                source_summary = (
                    f"Primary similarity {source_report.similarity_percent}%; exact overlap "
                    f"{source_report.shingle_jaccard}%; fuzzy passage strength "
                    f"{source_report.sentence_match_score}%; whole-text semantic candidate "
                    f"{semantic_similarity if semantic_similarity is not None else 'unavailable'}%; strongest semantic "
                    f"passage {strongest_semantic_passage if strongest_semantic_passage is not None else 'unavailable'}%."
                )
            prompt = (
                "You are the Averis academic revision coach. Give 3-5 short manual revision actions only. "
                "Do not rewrite the student's submission, do not promise detector evasion, do not claim AI authorship, "
                "do not fabricate citations, and do not make a plagiarism/misconduct verdict. Ground the advice only "
                "in these metrics.\n"
                f"Words={writing.word_count}; sentences={writing.sentence_count}; lexical diversity="
                f"{writing.lexical_diversity_percent}%; sentence-length CV={writing.sentence_length_cv_percent}%; "
                f"repeated trigram ratio={writing.repeated_trigram_ratio_percent}%; style uniformity signal="
                f"{writing.style_uniformity_signal}/100. {source_summary}"
            )
            coach_summary = await provider.coach(prompt)

    strongest_semantic = max((match.score for match in semantic_passages), default=semantic_similarity)
    actions = build_revision_actions(writing, source_report, strongest_semantic)

    source_evidence = None
    if source_report is not None:
        source_evidence = SourceEvidenceMetrics(
            exact_overlap_percent=source_report.shingle_jaccard,
            fuzzy_passage_percent=source_report.sentence_match_score,
            minhash_candidate_percent=source_report.minhash_candidate_score,
            lexical_vector_percent=source_report.vector_candidate_score,
            semantic_similarity_percent=semantic_similarity,
            semantic_provider=semantic_provider,
            overlap_review_band=overlap_review_band(source_report, strongest_semantic),
            matched_passages=source_report.matched_passages[:8],
            semantic_passages=semantic_passages,
        )

    ai_active = semantic_similarity is not None or bool(semantic_passages) or coach_summary is not None
    return RevisionAnalyzeResponse(
        writing=writing,
        source_evidence=source_evidence,
        revision_actions=actions,
        ai_enabled=ai_active,
        ai_provider=settings.ai_provider,
        semantic_model=settings.ollama_embedding_model if settings.ai_revision_enabled else None,
        coach_summary=coach_summary,
        caution=(
            "Writing-style metrics and AI-generated-text detectors can produce false positives and are not proof of "
            "authorship. Averis reports these as review signals only. Semantic scores are retrieval evidence, not a "
            "plagiarism verdict. Source-overlap evidence still requires human review, citation context, and the relevant "
            "institution's rules."
        ),
    )
