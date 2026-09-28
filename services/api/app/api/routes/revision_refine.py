from __future__ import annotations

import re
from collections.abc import Iterable

from fastapi import APIRouter, Depends

from app.ai.providers.ollama import OllamaProvider
from app.ai.providers.openai_compatible import OpenAICompatibleProvider
from app.core.config import get_settings
from app.schemas.revision_refine import (
    RefinementPreservationReport,
    RefinementSourceEvidence,
    RevisionRefineRequest,
    RevisionRefineResponse,
)
from app.services.auth import AuthContext, require_user
from app.services.rate_limit import AI_REVISION, enforce_rate_limit
from app.services.revision_guardrails import build_revision_boundary
from app.services.revision_metrics import analyze_writing_style, overlap_review_band
from app.services.similarity import compare_texts

router = APIRouter(prefix="/ai/revision", tags=["ai"])

_AUTHOR_YEAR = re.compile(r"\([^()]{0,90}\b(?:19|20)\d{2}[a-z]?[^()]{0,45}\)")
_NUMERIC_CITATION = re.compile(r"\[(?:\d{1,4}\s*(?:[-–,;]\s*\d{1,4}\s*)*)\]")
_NUMBER = re.compile(r"(?<!\w)\d+(?:\.\d+)?%?(?!\w)")
_DOI = re.compile(r"\b10\.\d{4,9}/[-._;()/:A-Z0-9]+\b", re.IGNORECASE)


def _dedupe(values: Iterable[str]) -> list[str]:
    result: list[str] = []
    for value in values:
        normalized = value.strip()
        if normalized and normalized not in result:
            result.append(normalized)
    return result


def _citations(text: str) -> list[str]:
    matches = [match.group(0) for match in _AUTHOR_YEAR.finditer(text)]
    matches.extend(match.group(0) for match in _NUMERIC_CITATION.finditer(text))
    return _dedupe(matches)


def _numbers(text: str) -> list[str]:
    return _dedupe(match.group(0) for match in _NUMBER.finditer(text))


def _dois(text: str) -> list[str]:
    return _dedupe(match.group(0) for match in _DOI.finditer(text))


def _source_evidence(text: str, source_text: str, source_name: str) -> RefinementSourceEvidence:
    report = compare_texts(
        document_text=text,
        source_text=source_text,
        source_name=source_name,
    )
    return RefinementSourceEvidence(
        source_name=report.source_name,
        similarity_percent=report.similarity_percent,
        exact_overlap_percent=report.shingle_jaccard,
        fuzzy_passage_percent=report.sentence_match_score,
        review_band=overlap_review_band(report),
    )


def _preservation(original: str, suggestion: str) -> RefinementPreservationReport:
    citations_before = _citations(original)
    citations_after = _citations(suggestion)
    numbers_before = _numbers(original)
    numbers_after = _numbers(suggestion)
    dois_before = _dois(original)
    dois_after = _dois(suggestion)

    missing_citations = [value for value in citations_before if value not in citations_after]
    missing_numbers = [value for value in numbers_before if value not in numbers_after]
    missing_dois = [value for value in dois_before if value not in dois_after]
    original_length = max(1, len(original))
    length_change_percent = round(((len(suggestion) - len(original)) / original_length) * 100, 2)

    return RefinementPreservationReport(
        citations_before=citations_before,
        citations_after=citations_after,
        missing_citations=missing_citations,
        numbers_before=numbers_before,
        numbers_after=numbers_after,
        missing_numbers=missing_numbers,
        dois_before=dois_before,
        dois_after=dois_after,
        missing_dois=missing_dois,
        length_change_percent=length_change_percent,
        acceptance_eligible=not missing_citations and not missing_numbers and not missing_dois,
    )


def _refinement_prompt(payload: RevisionRefineRequest) -> str:
    strength_instruction = (
        "Make only light edits and preserve the original sentence order wherever possible."
        if payload.strength == "light"
        else "Make measured edits for clarity and flow, but preserve the author's reasoning, evidence and overall structure."
    )
    return (
        "You are Averis Writing Refinement, an academic writing assistant.\n"
        "Produce one revision proposal for the student's own text.\n"
        "Allowed goals: clarity, coherence, concision, academic tone, sentence flow, structure, grammar, and source-grounded paraphrasing.\n"
        "Hard rules:\n"
        "- Do not optimize for AI-detector evasion, Turnitin bypass, or a lower detector score.\n"
        "- Preserve the student's intended meaning and original reasoning.\n"
        "- Preserve every citation marker, quotation, number, percentage, DOI, proper noun, and factual claim unless fixing an obvious grammar-only issue.\n"
        "- Do not invent evidence, citations, references, facts, quotations, or source claims.\n"
        "- Do not copy new wording from any comparison source.\n"
        "- Return only the revised text. Do not add headings such as 'Revised text' and do not explain the edits.\n"
        f"Revision strength: {payload.strength}. {strength_instruction}\n"
        f"Student goal: {payload.requested_goal.strip()}\n\n"
        "STUDENT TEXT\n"
        f"{payload.text.strip()}"
    )


@router.get("/runtimes")
async def revision_runtimes() -> dict[str, object]:
    """Return non-secret revision-runtime availability metadata.

    The browser uses this to decide whether the optional server-side AI API
    runtime should be offered. API keys and provider URLs are never returned.
    """
    settings = get_settings()
    return {
        "ollama": {
            "enabled": bool(settings.ai_revision_enabled and settings.ai_provider.casefold() == "ollama"),
            "model": settings.ollama_model,
        },
        "api": {
            "enabled": bool(settings.ai_revision_enabled and settings.ai_api_configured),
            "provider_label": settings.ai_api_provider_label,
            "model": settings.ai_api_model if settings.ai_api_configured else None,
        },
        "browser": {
            "enabled": True,
            "note": "Capability is checked on the user's device because WebGPU availability is browser-specific.",
        },
        "automatic_fallback": False,
    }


@router.post("/refine", response_model=RevisionRefineResponse)
async def refine_revision(
    payload: RevisionRefineRequest,
    auth: AuthContext = Depends(require_user),
) -> RevisionRefineResponse:
    """Create a bounded writing-refinement proposal after re-checking safety.

    This endpoint is intentionally not an AI-detector humanizer. It can improve
    clarity, structure and academic tone, but explicit detector-evasion goals are
    blocked and every suggestion is checked for citation/number/DOI preservation.
    """
    await enforce_rate_limit(auth, AI_REVISION)
    settings = get_settings()

    writing = analyze_writing_style(payload.text)
    source_report = None
    source_before = None
    if payload.source_text and payload.source_text.strip():
        source_report = compare_texts(
            document_text=payload.text,
            source_text=payload.source_text,
            source_name=payload.source_name,
        )
        source_before = RefinementSourceEvidence(
            source_name=source_report.source_name,
            similarity_percent=source_report.similarity_percent,
            exact_overlap_percent=source_report.shingle_jaccard,
            fuzzy_passage_percent=source_report.sentence_match_score,
            review_band=overlap_review_band(source_report),
        )

    boundary = build_revision_boundary(
        requested_goal=payload.requested_goal,
        writing=writing,
        source_report=source_report,
    )
    if not boundary.generation_eligible:
        return RevisionRefineResponse(
            generation_eligible=False,
            runtime_available=False,
            boundary=boundary.boundary,
            blocked_reason=boundary.blocked_reason,
            original_text=payload.text,
            source_evidence_before=source_before,
            runtime=payload.runtime,
        )

    provider_label: str | None = None
    model: str | None = None
    suggestion: str | None = None

    if payload.runtime == "api":
        provider_label = settings.ai_api_provider_label
        model = settings.ai_api_model if settings.ai_api_configured else None
        if not settings.ai_revision_enabled or not settings.ai_api_configured:
            return RevisionRefineResponse(
                generation_eligible=True,
                runtime_available=False,
                boundary="ai_api_runtime_unavailable",
                blocked_reason=(
                    "The optional server-side AI API runtime is not configured in this deployment. "
                    "Private Browser AI and evidence review remain available without it."
                ),
                original_text=payload.text,
                source_evidence_before=source_before,
                runtime="api",
                provider_label=provider_label,
                model=model,
            )

        provider = OpenAICompatibleProvider(
            settings.ai_api_base_url or "",
            settings.ai_api_key or "",
            settings.ai_api_model or "",
            timeout_seconds=max(settings.ai_api_timeout_seconds, 10.0),
            provider_label=settings.ai_api_provider_label,
        )
        suggestion = await provider.refine_writing(_refinement_prompt(payload))
        if not suggestion:
            return RevisionRefineResponse(
                generation_eligible=True,
                runtime_available=False,
                boundary="ai_api_runtime_unavailable",
                blocked_reason=(
                    "The configured AI API did not return a refinement proposal. "
                    "Averis did not switch providers automatically."
                ),
                original_text=payload.text,
                source_evidence_before=source_before,
                runtime="api",
                provider_label=provider_label,
                model=model,
            )
    else:
        provider_label = "Local Ollama"
        model = settings.ollama_model
        if not settings.ai_revision_enabled or settings.ai_provider.casefold() != "ollama":
            return RevisionRefineResponse(
                generation_eligible=True,
                runtime_available=False,
                boundary="ollama_runtime_unavailable",
                blocked_reason=(
                    "The optional local Ollama writing runtime is not enabled in this deployment. "
                    "Evidence analysis remains available without it."
                ),
                original_text=payload.text,
                source_evidence_before=source_before,
                runtime="ollama",
                provider_label=provider_label,
                model=model,
            )

        provider = OllamaProvider(
            settings.ollama_base_url,
            settings.ollama_model,
            timeout_seconds=max(settings.ollama_timeout_seconds, 20.0),
        )
        suggestion = await provider.refine_writing(_refinement_prompt(payload))
        if not suggestion:
            return RevisionRefineResponse(
                generation_eligible=True,
                runtime_available=False,
                boundary="ollama_runtime_unavailable",
                blocked_reason="The local Ollama runtime did not return a refinement proposal. Try again when the configured model is available.",
                original_text=payload.text,
                source_evidence_before=source_before,
                runtime="ollama",
                provider_label=provider_label,
                model=model,
            )

    preservation = _preservation(payload.text, suggestion)
    source_after = None
    if payload.source_text and payload.source_text.strip():
        source_after = _source_evidence(suggestion, payload.source_text, payload.source_name)

    return RevisionRefineResponse(
        generation_eligible=True,
        runtime_available=True,
        boundary="evidence_first_revision",
        original_text=payload.text,
        suggested_text=suggestion,
        preservation=preservation,
        source_evidence_before=source_before,
        source_evidence_after=source_after,
        runtime=payload.runtime,
        provider_label=provider_label,
        model=model,
    )
