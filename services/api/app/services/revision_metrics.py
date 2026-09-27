from __future__ import annotations

from collections import Counter
import math
import re
import statistics

from app.schemas.revision import WritingStyleMetrics
from app.schemas.similarity import SimilarityReport
from app.services.text import split_sentences, tokenize


_PARAGRAPH_BREAK_RE = re.compile(r"\n\s*\n+")


def _coefficient_of_variation(values: list[int]) -> float:
    if len(values) < 2:
        return 0.0
    mean = statistics.fmean(values)
    if mean <= 0:
        return 0.0
    return (statistics.pstdev(values) / mean) * 100.0


def _repeated_trigram_ratio(words: list[str]) -> float:
    if len(words) < 3:
        return 0.0
    trigrams = [tuple(words[index : index + 3]) for index in range(len(words) - 2)]
    counts = Counter(trigrams)
    repeated_positions = sum(count for count in counts.values() if count > 1)
    return (repeated_positions / len(trigrams)) * 100.0


def _style_uniformity_signal(
    *,
    lexical_diversity: float,
    sentence_cv: float,
    paragraph_cv: float,
    repeated_trigram_ratio: float,
) -> float:
    """Return a bounded writing-uniformity review signal, never an AI probability.

    The score intentionally combines transparent surface statistics. It is useful
    for revision prompts (for example, repetitive scaffolding or unusually flat
    sentence rhythm) but is not calibrated to identify authorship.
    """

    sentence_uniformity = max(0.0, 100.0 - min(100.0, sentence_cv * 2.2))
    paragraph_uniformity = max(0.0, 100.0 - min(100.0, paragraph_cv * 1.7))
    repetition_pressure = min(100.0, repeated_trigram_ratio * 5.0)
    lexical_uniformity = max(0.0, min(100.0, (62.0 - lexical_diversity) * 2.4))

    return round(
        (0.42 * sentence_uniformity)
        + (0.18 * paragraph_uniformity)
        + (0.25 * repetition_pressure)
        + (0.15 * lexical_uniformity),
        2,
    )


def analyze_writing_style(text: str) -> WritingStyleMetrics:
    words = tokenize(text)
    sentences = [sentence for sentence in split_sentences(text) if tokenize(sentence)]
    paragraphs = [paragraph.strip() for paragraph in _PARAGRAPH_BREAK_RE.split(text) if paragraph.strip()]

    word_count = len(words)
    unique_words = len(set(words))
    lexical_diversity = (unique_words / word_count * 100.0) if word_count else 0.0
    word_counts = Counter(words)
    hapax_count = sum(1 for count in word_counts.values() if count == 1)
    hapax_ratio = (hapax_count / max(1, unique_words)) * 100.0

    sentence_lengths = [len(tokenize(sentence)) for sentence in sentences]
    paragraph_lengths = [len(tokenize(paragraph)) for paragraph in paragraphs]
    sentence_mean = statistics.fmean(sentence_lengths) if sentence_lengths else 0.0
    sentence_cv = _coefficient_of_variation(sentence_lengths)
    paragraph_cv = _coefficient_of_variation(paragraph_lengths)
    repeated_trigrams = _repeated_trigram_ratio(words)

    uniformity = _style_uniformity_signal(
        lexical_diversity=lexical_diversity,
        sentence_cv=sentence_cv,
        paragraph_cv=paragraph_cv,
        repeated_trigram_ratio=repeated_trigrams,
    )
    if uniformity >= 65:
        band = "high review"
    elif uniformity >= 40:
        band = "review"
    else:
        band = "low review"

    return WritingStyleMetrics(
        word_count=word_count,
        sentence_count=len(sentences),
        paragraph_count=len(paragraphs),
        lexical_diversity_percent=round(lexical_diversity, 2),
        hapax_ratio_percent=round(hapax_ratio, 2),
        sentence_length_mean=round(sentence_mean, 2),
        sentence_length_cv_percent=round(sentence_cv, 2),
        paragraph_length_cv_percent=round(paragraph_cv, 2),
        repeated_trigram_ratio_percent=round(repeated_trigrams, 2),
        style_uniformity_signal=uniformity,
        style_uniformity_band=band,
    )


def overlap_review_band(
    report: SimilarityReport,
    semantic_similarity: float | None = None,
    *,
    semantic_review_threshold: float | None = None,
    semantic_high_review_threshold: float | None = None,
) -> str:
    """Return a review band from deterministic evidence plus calibrated semantics.

    Semantic scores are ignored for banding unless both benchmark-derived
    thresholds are supplied. This prevents an arbitrary cosine number from
    silently becoming a plagiarism policy.
    """
    semantic_high = (
        semantic_similarity is not None
        and semantic_high_review_threshold is not None
        and semantic_similarity >= semantic_high_review_threshold
    )
    semantic_review = (
        semantic_similarity is not None
        and semantic_review_threshold is not None
        and semantic_similarity >= semantic_review_threshold
    )

    if report.shingle_jaccard >= 35 or report.similarity_percent >= 45 or report.sentence_match_score >= 82 or semantic_high:
        return "high review"
    if report.shingle_jaccard >= 12 or report.similarity_percent >= 20 or report.sentence_match_score >= 65 or semantic_review:
        return "review"
    return "low review"


def build_revision_actions(
    writing: WritingStyleMetrics,
    report: SimilarityReport | None,
    semantic_similarity: float | None,
    *,
    semantic_review_threshold: float | None = None,
    semantic_high_review_threshold: float | None = None,
) -> list[str]:
    actions: list[str] = []

    if report is not None:
        band = overlap_review_band(
            report,
            semantic_similarity,
            semantic_review_threshold=semantic_review_threshold,
            semantic_high_review_threshold=semantic_high_review_threshold,
        )
        if band == "high review":
            actions.append(
                "Review the strongest matched passages first. Quote and cite wording that must stay exact, and rewrite the rest from your own understanding before checking it again."
            )
        elif band == "review":
            actions.append(
                "Inspect the matched passages for close paraphrasing. Add attribution where ideas come from a source and make your own reasoning clearly distinguishable."
            )
        else:
            actions.append(
                "Source overlap is limited in the supplied comparison, but still verify that borrowed ideas and facts have the required citations."
            )

    if writing.repeated_trigram_ratio_percent >= 6:
        actions.append(
            "Reduce repeated three-word scaffolding and template phrases. Prefer direct, topic-specific wording instead of repeating the same sentence frame."
        )
    if writing.sentence_length_cv_percent < 24 and writing.sentence_count >= 5:
        actions.append(
            "Sentence rhythm is unusually uniform. Split or combine sentences only where it improves meaning, emphasis, and readability."
        )
    if writing.lexical_diversity_percent < 42 and writing.word_count >= 120:
        actions.append(
            "Vocabulary is repetitive for this sample. Replace vague repeated wording with precise subject terms where those terms are accurate."
        )
    if writing.paragraph_count >= 3 and writing.paragraph_length_cv_percent < 18:
        actions.append(
            "Paragraph lengths are very even. Reorganize paragraphs around complete ideas rather than a fixed visual length."
        )

    actions.append(
        "Add original analysis: explain why the evidence matters, compare competing interpretations, or connect the source to your own argument."
    )
    actions.append(
        "Run the Reference Audit before submission so citation and bibliography evidence is checked separately from similarity evidence."
    )

    # Preserve order while avoiding duplicate guidance.
    return list(dict.fromkeys(actions))[:6]


def cosine_percent(left: list[float], right: list[float]) -> float | None:
    if not left or not right or len(left) != len(right):
        return None
    left_norm = math.sqrt(sum(value * value for value in left))
    right_norm = math.sqrt(sum(value * value for value in right))
    if left_norm == 0 or right_norm == 0:
        return None
    dot = sum(a * b for a, b in zip(left, right, strict=True))
    cosine = max(-1.0, min(1.0, dot / (left_norm * right_norm)))
    return round(max(0.0, cosine) * 100.0, 2)
