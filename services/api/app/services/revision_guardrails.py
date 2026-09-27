from __future__ import annotations

from dataclasses import dataclass
import re

from app.schemas.similarity import SimilarityReport
from app.schemas.revision import WritingStyleMetrics


_EVASION_PATTERNS = tuple(
    re.compile(pattern, re.IGNORECASE)
    for pattern in (
        r"\bhuman(?:ize|ise)\s+(?:this\s+)?(?:ai|gpt|machine)",
        r"\bmake\s+(?:this|it)\s+(?:look|sound)\s+human\b",
        r"\b(?:bypass|beat|evade|avoid)\s+(?:an?\s+)?(?:ai\s+)?detector\b",
        r"\b(?:bypass|beat|evade)\s+turnitin\b",
        r"\b(?:undetectable|untraceable)\s+(?:ai|gpt|writing|text)\b",
        r"\blower\s+(?:the\s+)?(?:(?:ai|gpt)(?:\s+detector)?|detector)\s+score\b",
        r"\bzero\s+(?:ai|gpt)(?:\s+detector)?\s+(?:score|detection)\b",
    )
)


@dataclass(frozen=True)
class RevisionBoundary:
    generation_eligible: bool
    boundary: str
    blocked_reason: str | None
    evidence_first_actions: tuple[str, ...]


def requests_detector_evasion(goal: str) -> bool:
    """Return True only for explicit detector-evasion / AI-humanizer goals.

    This is intentionally narrow. Averis may help improve clarity, attribution,
    structure and source-grounded paraphrasing, but it must not optimize text to
    conceal AI use or to beat an academic-integrity detector.
    """
    compact = re.sub(r"\s+", " ", goal).strip()
    return any(pattern.search(compact) for pattern in _EVASION_PATTERNS)


def build_revision_boundary(
    *,
    requested_goal: str,
    writing: WritingStyleMetrics,
    source_report: SimilarityReport | None,
) -> RevisionBoundary:
    actions: list[str] = []

    if source_report is not None and source_report.matched_passages:
        actions.append(
            f"Review {len(source_report.matched_passages)} matched passage"
            f"{'s' if len(source_report.matched_passages) != 1 else ''} before revising: keep direct wording quoted and cited, "
            "or paraphrase from your own understanding while preserving source attribution."
        )

    if writing.repeated_trigram_ratio_percent >= 4:
        actions.append(
            "Review repeated three-word frames and remove repetition only where it improves clarity; do not vary wording merely to change a detector score."
        )

    if writing.style_uniformity_signal >= 60:
        actions.append(
            "The draft has a relatively uniform style signal. Review sentence and paragraph rhythm for readability, but treat this as a writing signal rather than evidence of AI authorship."
        )

    actions.append(
        "Keep citations, quotations, factual claims and reference links intact through any later revision, then re-run the evidence review on the proposed text."
    )

    if requests_detector_evasion(requested_goal):
        return RevisionBoundary(
            generation_eligible=False,
            boundary="detector_evasion_blocked",
            blocked_reason=(
                "Averis does not rewrite text to hide AI use, lower an AI-detection score, or bypass Turnitin or similar systems. "
                "Use the evidence-first revision flow for clarity, attribution, structure and source-grounded academic writing instead."
            ),
            evidence_first_actions=tuple(actions),
        )

    return RevisionBoundary(
        generation_eligible=True,
        boundary="evidence_first_revision",
        blocked_reason=None,
        evidence_first_actions=tuple(actions),
    )
