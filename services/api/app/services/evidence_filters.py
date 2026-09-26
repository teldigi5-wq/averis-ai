from __future__ import annotations

from dataclasses import dataclass
import re


_BIBLIOGRAPHY_HEADING = re.compile(
    r"(?im)^[ \t]*(?:#{1,6}[ \t]*)?"
    r"(?:references|bibliography|works cited|reference list)"
    r"[ \t]*:?[ \t]*$"
)
_CURLY_DOUBLE_QUOTE = re.compile(r"“[^”]{1,8000}”", re.DOTALL)
_STRAIGHT_DOUBLE_QUOTE = re.compile(r'"[^"\n]{1,8000}"')
_WORD = re.compile(r"\b[\w'-]+\b", re.UNICODE)


@dataclass(frozen=True)
class EvidenceFilterResult:
    text: str
    original_words: int
    analyzed_words: int
    excluded_words: int
    exclusions_applied: tuple[str, ...]


def _word_count(value: str) -> int:
    return len(_WORD.findall(value))


def _strip_bibliography(text: str) -> tuple[str, bool]:
    """Remove a bibliography/reference section only when a heading is on its own line."""
    match = _BIBLIOGRAPHY_HEADING.search(text)
    if not match:
        return text, False
    return text[: match.start()].rstrip(), True


def _strip_quoted_passages(text: str) -> tuple[str, bool]:
    """Remove explicit double-quoted spans while preserving surrounding boundaries."""
    filtered, curly_count = _CURLY_DOUBLE_QUOTE.subn(" ", text)
    filtered, straight_count = _STRAIGHT_DOUBLE_QUOTE.subn(" ", filtered)
    return filtered, bool(curly_count or straight_count)


def apply_evidence_filters(
    text: str,
    *,
    exclude_quotes: bool = False,
    exclude_bibliography: bool = False,
) -> EvidenceFilterResult:
    original_words = _word_count(text)
    filtered = text
    applied: list[str] = []

    if exclude_bibliography:
        filtered, changed = _strip_bibliography(filtered)
        if changed:
            applied.append("bibliography")

    if exclude_quotes:
        filtered, changed = _strip_quoted_passages(filtered)
        if changed:
            applied.append("quotes")

    analyzed_words = _word_count(filtered)
    return EvidenceFilterResult(
        text=filtered,
        original_words=original_words,
        analyzed_words=analyzed_words,
        excluded_words=max(0, original_words - analyzed_words),
        exclusions_applied=tuple(applied),
    )
