from __future__ import annotations

from dataclasses import dataclass
import re

from app.schemas.similarity import PassageMatch


# Common in-text citation forms. This intentionally does not attempt to parse
# every style; it is a transparent proximity signal for revision, not proof that
# a source has been cited correctly.
_PARENTHEtICAL_AUTHOR_YEAR_RE = re.compile(
    r"\((?:[A-Z][A-Za-z'’\-]+(?:\s+(?:&|and)\s+[A-Z][A-Za-z'’\-]+|\s+et\s+al\.)?),?\s+(?:19|20)\d{2}[a-z]?"
    r"(?:,\s*p{1,2}\.\s*\d+(?:\s*[-–]\s*\d+)?)?\)"
)
_NARRATIVE_AUTHOR_YEAR_RE = re.compile(
    r"\b[A-Z][A-Za-z'’\-]+(?:\s+et\s+al\.)?\s*\((?:19|20)\d{2}[a-z]?\)"
)
_NUMERIC_CITATION_RE = re.compile(r"\[(?:\d{1,3}(?:\s*[,\-–]\s*\d{1,3})*)\]")

_CITATION_PATTERNS = (
    _PARENTHEtICAL_AUTHOR_YEAR_RE,
    _NARRATIVE_AUTHOR_YEAR_RE,
    _NUMERIC_CITATION_RE,
)


@dataclass(frozen=True)
class CitationPassageReview:
    document_sentence: str
    match_score: float
    citation_detected: bool
    citation_marker: str | None


@dataclass(frozen=True)
class CitationCoverageReview:
    matched_passage_count: int
    citation_detected_count: int
    uncited_match_count: int
    citation_coverage_percent: float
    passages: list[CitationPassageReview]
    scope_note: str


def _find_sentence_span(text: str, sentence: str) -> tuple[int, int] | None:
    start = text.find(sentence)
    if start >= 0:
        return start, start + len(sentence)

    # Fuzzy/folding fallback for harmless case differences. We deliberately do
    # not approximate arbitrary text because the citation window must stay tied
    # to the actual submission wording.
    folded_text = text.casefold()
    folded_sentence = sentence.casefold()
    start = folded_text.find(folded_sentence)
    if start < 0:
        return None
    return start, start + len(sentence)


def _citation_in_window(window: str) -> str | None:
    candidates: list[tuple[int, str]] = []
    for pattern in _CITATION_PATTERNS:
        for match in pattern.finditer(window):
            candidates.append((match.start(), match.group(0)))
    if not candidates:
        return None
    candidates.sort(key=lambda item: item[0])
    return candidates[0][1]


def analyze_citation_coverage(
    document_text: str,
    matched_passages: list[PassageMatch],
    *,
    context_chars: int = 180,
) -> CitationCoverageReview:
    """Measure whether matched passages have a nearby common citation marker.

    A detected marker only means that a recognizable citation-shaped token is
    near the matched sentence. It does not verify the citation target, style,
    correctness, or whether quoting/paraphrasing rules were satisfied.
    """
    if context_chars < 0:
        raise ValueError("context_chars must be non-negative")

    passages: list[CitationPassageReview] = []
    detected = 0

    for match in matched_passages:
        span = _find_sentence_span(document_text, match.document_sentence)
        marker: str | None = None
        if span is not None:
            start, end = span
            window_start = max(0, start - context_chars)
            window_end = min(len(document_text), end + context_chars)
            marker = _citation_in_window(document_text[window_start:window_end])

        has_citation = marker is not None
        if has_citation:
            detected += 1

        passages.append(
            CitationPassageReview(
                document_sentence=match.document_sentence,
                match_score=match.score,
                citation_detected=has_citation,
                citation_marker=marker,
            )
        )

    total = len(passages)
    uncited = total - detected
    coverage = (detected / total * 100.0) if total else 0.0

    return CitationCoverageReview(
        matched_passage_count=total,
        citation_detected_count=detected,
        uncited_match_count=uncited,
        citation_coverage_percent=round(coverage, 2),
        passages=passages,
        scope_note=(
            "Citation coverage checks only for common nearby author-year or numeric in-text markers. "
            "A detected marker is not proof that the citation is correct, complete, or attached to the right source."
        ),
    )
