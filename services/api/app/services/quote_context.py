from __future__ import annotations

from dataclasses import dataclass

from app.services.citation_context import CitationPassageReview


@dataclass(frozen=True)
class QuotePassageReview:
    document_sentence: str
    match_score: float
    citation_detected: bool
    citation_marker: str | None
    quote_detected: bool
    quote_style: str | None
    context_status: str


@dataclass(frozen=True)
class QuoteContextReview:
    matched_passage_count: int
    quoted_passage_count: int
    quoted_with_citation_count: int
    quoted_without_citation_count: int
    unquoted_with_citation_count: int
    unquoted_without_citation_count: int
    high_match_unquoted_count: int
    passages: list[QuotePassageReview]
    scope_note: str


def _find_sentence_span(text: str, sentence: str) -> tuple[int, int] | None:
    start = text.find(sentence)
    if start >= 0:
        return start, start + len(sentence)
    folded_text = text.casefold()
    folded_sentence = sentence.casefold()
    start = folded_text.find(folded_sentence)
    if start < 0:
        return None
    return start, start + len(sentence)


def _quote_context(text: str, sentence: str) -> tuple[bool, str | None]:
    span = _find_sentence_span(text, sentence)
    if span is None:
        return False, None

    start, end = span
    stripped = sentence.strip()
    pairs = (
        ('"', '"', 'straight_double'),
        ('“', '”', 'curly_double'),
        ('„', '”', 'curly_double'),
        ('«', '»', 'guillemet'),
    )

    for opener, closer, style in pairs:
        if stripped.startswith(opener) and stripped.endswith(closer):
            return True, style

    left = text[max(0, start - 3):start].rstrip()
    right = text[end:min(len(text), end + 3)].lstrip()
    for opener, closer, style in pairs:
        if left.endswith(opener) and right.startswith(closer):
            return True, style

    # Conservative fallback for a matched sentence that includes a complete
    # quotation plus a trailing citation marker inside the same sentence.
    for opener, closer, style in pairs:
        first = stripped.find(opener)
        last = stripped.rfind(closer)
        if first >= 0 and last > first:
            quoted = stripped[first + len(opener):last].strip()
            if quoted and len(quoted) >= max(20, int(len(stripped) * 0.55)):
                return True, style

    return False, None


def analyze_quote_context(
    document_text: str,
    passages: list[CitationPassageReview],
    *,
    high_match_threshold: float = 85.0,
) -> QuoteContextReview:
    """Classify matched passages by quotation and citation context.

    This analysis never changes the underlying similarity score. Quotation and
    citation markers are contextual review signals only and do not establish
    whether a student's use is academically acceptable.
    """
    if high_match_threshold < 0 or high_match_threshold > 100:
        raise ValueError("high_match_threshold must be between 0 and 100")

    reviewed: list[QuotePassageReview] = []
    quoted = 0
    quoted_cited = 0
    quoted_uncited = 0
    unquoted_cited = 0
    unquoted_uncited = 0
    high_unquoted = 0

    for passage in passages:
        quote_detected, quote_style = _quote_context(document_text, passage.document_sentence)
        if quote_detected:
            quoted += 1
            if passage.citation_detected:
                quoted_cited += 1
                status = "quoted_with_marker"
            else:
                quoted_uncited += 1
                status = "quoted_without_marker"
        else:
            if passage.citation_detected:
                unquoted_cited += 1
                status = "unquoted_with_marker"
            else:
                unquoted_uncited += 1
                status = "unquoted_without_marker"
            if passage.match_score >= high_match_threshold:
                high_unquoted += 1

        reviewed.append(
            QuotePassageReview(
                document_sentence=passage.document_sentence,
                match_score=passage.match_score,
                citation_detected=passage.citation_detected,
                citation_marker=passage.citation_marker,
                quote_detected=quote_detected,
                quote_style=quote_style,
                context_status=status,
            )
        )

    return QuoteContextReview(
        matched_passage_count=len(reviewed),
        quoted_passage_count=quoted,
        quoted_with_citation_count=quoted_cited,
        quoted_without_citation_count=quoted_uncited,
        unquoted_with_citation_count=unquoted_cited,
        unquoted_without_citation_count=unquoted_uncited,
        high_match_unquoted_count=high_unquoted,
        passages=reviewed,
        scope_note=(
            "Quote context recognizes common double-quotation styles around matched passages. "
            "A quote or citation marker does not prove that attribution is correct, and an unquoted match is not a misconduct verdict."
        ),
    )
