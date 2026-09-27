from __future__ import annotations

from fastapi import APIRouter, Depends

from app.ai.providers.ollama import OllamaProvider
from app.core.config import get_settings
from app.schemas.revision import (
    CitationCoverageMetrics,
    CitationPassageReview,
    CitationReferenceLinkEvidence,
    LinkedReferenceEvidence,
    PassageReviewItemEvidence,
    PassageReviewMatrixMetrics,
    QuoteContextMetrics,
    QuotePassageContext,
    ReferenceLinkageMetrics,
    RevisionAnalyzeRequest,
    RevisionAnalyzeResponse,
    SourceEvidenceMetrics,
)
from app.schemas.similarity import PassageMatch
from app.services.auth import AuthContext, require_user
from app.services.citation_context import analyze_citation_coverage
from app.services.crossref import CrossrefClient
from app.services.passage_review import build_passage_review_matrix
from app.services.quote_context import analyze_quote_context
from app.services.rate_limit import AI_REVISION, enforce_rate_limit
from app.services.reference_linkage import (
    ReferenceLinkageReview,
    link_citations_to_references,
    verify_linked_dois,
)
from app.services.revision_metrics import (
    analyze_writing_style,
    build_revision_actions,
    cosine_percent,
    overlap_review_band,
)
from app.services.semantic_evidence import semantic_passage_matches
from app.services.similarity import compare_texts

router = APIRouter(prefix="/ai", tags=["ai"])


def _crossref_client() -> CrossrefClient:
    settings = get_settings()
    return CrossrefClient(
        base_url=settings.crossref_base_url,
        mailto=settings.crossref_mailto,
        timeout_seconds=settings.crossref_timeout_seconds,
    )


def _reference_linkage_model(review: ReferenceLinkageReview) -> ReferenceLinkageMetrics:
    return ReferenceLinkageMetrics(
        supplied_reference_count=review.supplied_reference_count,
        linked_passage_count=review.linked_passage_count,
        unlinked_citation_count=review.unlinked_citation_count,
        doi_verified_reference_count=review.doi_verified_reference_count,
        doi_metadata_review_count=review.doi_metadata_review_count,
        verification_unavailable_count=review.verification_unavailable_count,
        links=[
            CitationReferenceLinkEvidence(
                document_sentence=link.document_sentence,
                match_score=link.match_score,
                citation_marker=link.citation_marker,
                link_status=link.link_status,
                references=[
                    LinkedReferenceEvidence(
                        index=reference.index,
                        raw=reference.raw,
                        doi=reference.doi,
                        year=reference.year,
                        author_key=reference.author_key,
                        verification_status=reference.verification_status,
                        verification_issues=list(reference.verification_issues),
                        verified_title=reference.verified_source.title if reference.verified_source else None,
                        verified_doi=reference.verified_source.doi if reference.verified_source else None,
                        verified_year=reference.verified_source.published_year if reference.verified_source else None,
                        verified_authors=list(reference.verified_source.authors) if reference.verified_source else [],
                    )
                    for reference in link.references
                ],
            )
            for link in review.links
        ],
        scope_note=review.scope_note,
    )


@router.get("/status")
async def ai_status() -> dict[str, object]:
    settings = get_settings()
    thresholds = settings.semantic_review_thresholds
    if settings.ai_provider.casefold() != "ollama":
        return {
            "provider": settings.ai_provider,
            "revision_enabled": settings.ai_revision_enabled,
            "semantic_calibrated": bool(thresholds),
            "semantic_calibration_id": settings.ai_semantic_calibration_id if thresholds else None,
            "reachable": False,
            "note": "Only the local Ollama adapter is implemented for AI Evidence Layer v6.",
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
        "semantic_calibrated": bool(thresholds),
        "semantic_calibration_id": settings.ai_semantic_calibration_id if thresholds else None,
        "semantic_review_threshold": thresholds[0] if thresholds else None,
        "semantic_high_review_threshold": thresholds[1] if thresholds else None,
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
    semantic_thresholds = settings.semantic_review_thresholds
    semantic_review_threshold = semantic_thresholds[0] if semantic_thresholds else None
    semantic_high_review_threshold = semantic_thresholds[1] if semantic_thresholds else None

    writing = analyze_writing_style(payload.text)
    source_report = None
    if payload.source_text and payload.source_text.strip():
        source_report = compare_texts(
            document_text=payload.text,
            source_text=payload.source_text,
            source_name=payload.source_name,
        )

    citation_review = None
    quote_review = None
    passage_review = None
    raw_citation_review = None
    raw_quote_review = None
    raw_reference_linkage = None

    if source_report is not None:
        raw_citation_review = analyze_citation_coverage(
            payload.text,
            source_report.matched_passages[:8],
        )
        citation_review = CitationCoverageMetrics(
            matched_passage_count=raw_citation_review.matched_passage_count,
            citation_detected_count=raw_citation_review.citation_detected_count,
            uncited_match_count=raw_citation_review.uncited_match_count,
            citation_coverage_percent=raw_citation_review.citation_coverage_percent,
            passages=[
                CitationPassageReview(
                    document_sentence=item.document_sentence,
                    match_score=item.match_score,
                    citation_detected=item.citation_detected,
                    citation_marker=item.citation_marker,
                )
                for item in raw_citation_review.passages
            ],
            scope_note=raw_citation_review.scope_note,
        )

        raw_quote_review = analyze_quote_context(
            payload.text,
            raw_citation_review.passages,
        )
        quote_review = QuoteContextMetrics(
            matched_passage_count=raw_quote_review.matched_passage_count,
            quoted_passage_count=raw_quote_review.quoted_passage_count,
            quoted_with_citation_count=raw_quote_review.quoted_with_citation_count,
            quoted_without_citation_count=raw_quote_review.quoted_without_citation_count,
            unquoted_with_citation_count=raw_quote_review.unquoted_with_citation_count,
            unquoted_without_citation_count=raw_quote_review.unquoted_without_citation_count,
            high_match_unquoted_count=raw_quote_review.high_match_unquoted_count,
            passages=[
                QuotePassageContext(
                    document_sentence=item.document_sentence,
                    match_score=item.match_score,
                    citation_detected=item.citation_detected,
                    citation_marker=item.citation_marker,
                    quote_detected=item.quote_detected,
                    quote_style=item.quote_style,
                    context_status=item.context_status,
                )
                for item in raw_quote_review.passages
            ],
            scope_note=raw_quote_review.scope_note,
        )

    reference_linkage = None
    if (
        raw_citation_review is not None
        and payload.references_text
        and payload.references_text.strip()
    ):
        raw_reference_linkage = link_citations_to_references(
            raw_citation_review.passages,
            payload.references_text,
        )
        if payload.verify_linked_references:
            raw_reference_linkage = await verify_linked_dois(
                raw_reference_linkage,
                crossref=_crossref_client(),
                max_lookups=5,
            )
        reference_linkage = _reference_linkage_model(raw_reference_linkage)

    if raw_quote_review is not None:
        raw_passage_review = build_passage_review_matrix(
            raw_quote_review,
            raw_reference_linkage,
        )
        passage_review = PassageReviewMatrixMetrics(
            passages_reviewed=raw_passage_review.passages_reviewed,
            high_attention_count=raw_passage_review.high_attention_count,
            attention_count=raw_passage_review.attention_count,
            contextualized_count=raw_passage_review.contextualized_count,
            items=[
                PassageReviewItemEvidence(
                    document_sentence=item.document_sentence,
                    match_score=item.match_score,
                    priority=item.priority,
                    reasons=list(item.reasons),
                    quote_detected=item.quote_detected,
                    citation_detected=item.citation_detected,
                    citation_marker=item.citation_marker,
                    reference_link_status=item.reference_link_status,
                    verified_reference_count=item.verified_reference_count,
                    metadata_review_reference_count=item.metadata_review_reference_count,
                )
                for item in raw_passage_review.items
            ],
            scope_note=raw_passage_review.scope_note,
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
                calibration_note = (
                    f"semantic thresholds certified under {settings.ai_semantic_calibration_id}"
                    if semantic_thresholds
                    else "semantic scores are uncalibrated candidate evidence and must not change review bands"
                )
                citation_note = (
                    f"citation coverage near matched passages {citation_review.citation_coverage_percent}% with "
                    f"{citation_review.uncited_match_count} uncited match candidates"
                    if citation_review is not None and citation_review.matched_passage_count
                    else "no fuzzy matched passage was available for citation-proximity review"
                )
                quote_note = (
                    f"{quote_review.quoted_passage_count} matched passages appear quoted, "
                    f"{quote_review.quoted_without_citation_count} quoted matches have no nearby recognized citation marker, and "
                    f"{quote_review.high_match_unquoted_count} high-overlap matches are unquoted"
                    if quote_review is not None
                    else "quote context unavailable"
                )
                reference_note = (
                    f"{reference_linkage.linked_passage_count} matched passages linked to supplied bibliography entries, "
                    f"{reference_linkage.unlinked_citation_count} citation markers unresolved, "
                    f"{reference_linkage.doi_verified_reference_count} linked references resolved through Crossref, and "
                    f"{reference_linkage.doi_metadata_review_count} resolved DOI records have author/year metadata differences"
                    if reference_linkage is not None
                    else "no bibliography was supplied for citation-to-reference linkage"
                )
                passage_note = (
                    f"passage triage has {passage_review.high_attention_count} high-attention, "
                    f"{passage_review.attention_count} attention, and {passage_review.contextualized_count} contextualized passages"
                    if passage_review is not None
                    else "passage triage unavailable"
                )
                source_summary = (
                    f"Primary similarity {source_report.similarity_percent}%; exact overlap "
                    f"{source_report.shingle_jaccard}%; fuzzy passage strength "
                    f"{source_report.sentence_match_score}%; whole-text semantic candidate "
                    f"{semantic_similarity if semantic_similarity is not None else 'unavailable'}%; strongest semantic "
                    f"passage {strongest_semantic_passage if strongest_semantic_passage is not None else 'unavailable'}%; "
                    f"{citation_note}; {quote_note}; {reference_note}; {passage_note}; {calibration_note}."
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
    actions = build_revision_actions(
        writing,
        source_report,
        strongest_semantic,
        semantic_review_threshold=semantic_review_threshold,
        semantic_high_review_threshold=semantic_high_review_threshold,
    )

    if quote_review is not None and quote_review.quoted_without_citation_count > 0:
        actions = [
            (
                f"Review {quote_review.quoted_without_citation_count} quoted matched passage"
                f"{'s' if quote_review.quoted_without_citation_count != 1 else ''} with no nearby recognized citation marker. "
                "Keep quotation marks only where direct quotation is intended and add the required source attribution."
            ),
            *actions,
        ]

    if quote_review is not None and quote_review.high_match_unquoted_count > 0:
        actions = [
            (
                f"Review {quote_review.high_match_unquoted_count} high-overlap matched passage"
                f"{'s' if quote_review.high_match_unquoted_count != 1 else ''} that are not inside a recognized quotation. "
                "If the wording is intentionally copied, quote and cite it; otherwise paraphrase from your own understanding and keep the source attribution."
            ),
            *actions,
        ]

    if citation_review is not None and citation_review.uncited_match_count > 0:
        citation_action = (
            f"Review {citation_review.uncited_match_count} matched passage"
            f"{'s' if citation_review.uncited_match_count != 1 else ''} with no nearby recognized citation marker. "
            "Add the required attribution or quotation/citation where the borrowed wording or idea actually comes from a source."
        )
        actions = [citation_action, *actions]

    if reference_linkage is not None and reference_linkage.unlinked_citation_count > 0:
        linkage_action = (
            f"Check {reference_linkage.unlinked_citation_count} nearby citation marker"
            f"{'s' if reference_linkage.unlinked_citation_count != 1 else ''} that could not be linked to the supplied bibliography. "
            "Correct the in-text citation or bibliography entry before submission, then run Reference Audit."
        )
        actions = [linkage_action, *actions]

    if reference_linkage is not None and reference_linkage.doi_metadata_review_count > 0:
        actions = [
            (
                f"Review {reference_linkage.doi_metadata_review_count} DOI-linked reference"
                f"{'s' if reference_linkage.doi_metadata_review_count != 1 else ''} whose Crossref author/year metadata differs from the supplied bibliography entry."
            ),
            *actions,
        ]

    if reference_linkage is not None:
        linked_without_clean_external_verification = sum(
            1
            for link in reference_linkage.links
            for reference in link.references
            if reference.verification_status != "verified_doi"
        )
        if linked_without_clean_external_verification > 0:
            actions.append(
                "Run Reference Audit for linked references that do not yet have clean DOI metadata verification; local linkage or a metadata-review state does not establish that a source record is correct."
            )

    actions = list(dict.fromkeys(actions))[:6]

    source_evidence = None
    if source_report is not None:
        source_evidence = SourceEvidenceMetrics(
            exact_overlap_percent=source_report.shingle_jaccard,
            fuzzy_passage_percent=source_report.sentence_match_score,
            minhash_candidate_percent=source_report.minhash_candidate_score,
            lexical_vector_percent=source_report.vector_candidate_score,
            semantic_similarity_percent=semantic_similarity,
            semantic_provider=semantic_provider,
            semantic_calibrated=bool(semantic_thresholds),
            semantic_calibration_id=settings.ai_semantic_calibration_id if semantic_thresholds else None,
            overlap_review_band=overlap_review_band(
                source_report,
                strongest_semantic,
                semantic_review_threshold=semantic_review_threshold,
                semantic_high_review_threshold=semantic_high_review_threshold,
            ),
            matched_passages=source_report.matched_passages[:8],
            semantic_passages=semantic_passages,
        )

    ai_active = semantic_similarity is not None or bool(semantic_passages) or coach_summary is not None
    return RevisionAnalyzeResponse(
        writing=writing,
        source_evidence=source_evidence,
        citation_review=citation_review,
        quote_review=quote_review,
        passage_review=passage_review,
        reference_linkage=reference_linkage,
        revision_actions=actions,
        ai_enabled=ai_active,
        ai_provider=settings.ai_provider,
        semantic_model=settings.ollama_embedding_model if settings.ai_revision_enabled else None,
        coach_summary=coach_summary,
        caution=(
            "Writing-style metrics and AI-generated-text detectors can produce false positives and are not proof of "
            "authorship. Averis reports these as review signals only. Semantic scores are retrieval evidence, not a "
            "plagiarism verdict; uncalibrated semantic scores do not change review bands. Quote detection recognizes "
            "common quotation marks but does not prove that quotation or paraphrasing rules were satisfied. Citation "
            "proximity and local bibliography linkage do not prove that a citation supports a passage. Passage review "
            "priority is deterministic triage only and never changes the similarity score or declares misconduct. "
            "Crossref DOI verification confirms a source record exists; author/year differences are surfaced separately "
            "and still require review. Human review, citation context, and the relevant institution's rules still apply."
        ),
    )
