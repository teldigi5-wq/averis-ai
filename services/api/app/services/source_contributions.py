from __future__ import annotations

from dataclasses import dataclass, field
from typing import Sequence

from rapidfuzz import fuzz

from app.schemas.similarity import (
    SourceContribution,
    SourceContributionPassage,
    SourceContributionReport,
)
from app.services.evidence_filters import apply_evidence_filters
from app.services.similarity import MATCH_THRESHOLD
from app.services.text import split_sentences, tokenize


MAX_DOCUMENT_SENTENCES = 600
MAX_SOURCE_SENTENCES = 600
MAX_RETURNED_PASSAGES_PER_SOURCE = 12


class ContributionInputError(ValueError):
    pass


@dataclass
class _ContributionBucket:
    source_name: str
    matched_sentence_count: int = 0
    matched_word_count: int = 0
    passage_score_total: float = 0.0
    passages: list[SourceContributionPassage] = field(default_factory=list)


def _eligible_sentences(text: str, min_match_words: int) -> list[tuple[str, int]]:
    result: list[tuple[str, int]] = []
    for sentence in split_sentences(text):
        word_count = len(tokenize(sentence))
        if word_count >= min_match_words:
            result.append((sentence, word_count))
    return result


def calculate_source_contributions(
    *,
    document_text: str,
    sources: Sequence[tuple[str, str]],
    exclude_quotes: bool = False,
    exclude_bibliography: bool = False,
    min_match_words: int = 3,
) -> SourceContributionReport:
    """Estimate unique matched-document coverage attributable to multiple sources.

    Each eligible submission sentence can be assigned to at most one source: the
    source with the strongest qualifying fuzzy sentence match. This prevents the
    same sentence from inflating multiple source coverage percentages.
    """
    if min_match_words < 3 or min_match_words > 50:
        raise ContributionInputError("min_match_words must be between 3 and 50")
    if not sources or len(sources) > 5:
        raise ContributionInputError("between 1 and 5 sources are required")

    filtered = apply_evidence_filters(
        document_text,
        exclude_quotes=exclude_quotes,
        exclude_bibliography=exclude_bibliography,
    )
    document_sentences = _eligible_sentences(filtered.text, min_match_words)
    if len(document_sentences) > MAX_DOCUMENT_SENTENCES:
        raise ContributionInputError(
            f"document contains too many eligible sentences; maximum is {MAX_DOCUMENT_SENTENCES}"
        )

    prepared_sources: list[tuple[str, list[tuple[str, int]]]] = []
    for source_name, source_text in sources:
        source_sentences = _eligible_sentences(source_text, min_match_words)
        if len(source_sentences) > MAX_SOURCE_SENTENCES:
            raise ContributionInputError(
                f"source '{source_name}' contains too many eligible sentences; maximum is {MAX_SOURCE_SENTENCES}"
            )
        prepared_sources.append((source_name, source_sentences))

    buckets = [_ContributionBucket(source_name=name) for name, _ in prepared_sources]

    for document_sentence, document_word_count in document_sentences:
        best_source_index: int | None = None
        best_source_sentence = ""
        best_score = 0.0

        for source_index, (_source_name, source_sentences) in enumerate(prepared_sources):
            for source_sentence, _source_words in source_sentences:
                score = float(fuzz.token_set_ratio(document_sentence, source_sentence))
                if score > best_score:
                    best_score = score
                    best_source_index = source_index
                    best_source_sentence = source_sentence

        if best_source_index is None or best_score < MATCH_THRESHOLD:
            continue

        bucket = buckets[best_source_index]
        bucket.matched_sentence_count += 1
        bucket.matched_word_count += document_word_count
        bucket.passage_score_total += best_score
        bucket.passages.append(
            SourceContributionPassage(
                document_sentence=document_sentence,
                source_sentence=best_source_sentence,
                score=round(best_score, 2),
                matched_words=document_word_count,
            )
        )

    analyzed_words = max(0, filtered.analyzed_words)
    total_matched_words = sum(bucket.matched_word_count for bucket in buckets)
    denominator = analyzed_words or 1

    contributions: list[SourceContribution] = []
    for bucket in buckets:
        average_score = (
            bucket.passage_score_total / bucket.matched_sentence_count
            if bucket.matched_sentence_count
            else 0.0
        )
        passages = sorted(bucket.passages, key=lambda item: item.score, reverse=True)[
            :MAX_RETURNED_PASSAGES_PER_SOURCE
        ]
        contributions.append(
            SourceContribution(
                source_name=bucket.source_name,
                matched_sentence_count=bucket.matched_sentence_count,
                matched_word_count=bucket.matched_word_count,
                document_coverage_percent=round(
                    min(100.0, (bucket.matched_word_count / denominator) * 100),
                    2,
                ),
                average_passage_score=round(average_score, 2),
                passages=passages,
            )
        )

    contributions.sort(
        key=lambda item: (-item.document_coverage_percent, -item.average_passage_score, item.source_name.lower())
    )
    total_coverage = round(min(100.0, (total_matched_words / denominator) * 100), 2)

    return SourceContributionReport(
        contributions=contributions,
        document_words_original=filtered.original_words,
        document_words_analyzed=filtered.analyzed_words,
        document_words_excluded=filtered.excluded_words,
        total_matched_words=total_matched_words,
        matched_document_coverage_percent=total_coverage,
        exclusions_applied=list(filtered.exclusions_applied),
        min_match_words=min_match_words,
        evidence_note=(
            "Per-source values estimate unique sentence-level document coverage. Each eligible submission "
            "sentence is assigned only to the strongest source match at or above the passage threshold, "
            "so overlapping sources cannot double-count the same sentence. Coverage is not a plagiarism "
            "percentage or misconduct verdict and does not replace the primary similarity report."
        ),
    )
