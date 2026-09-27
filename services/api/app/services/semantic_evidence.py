from __future__ import annotations

from dataclasses import dataclass

from app.ai.providers.ollama import OllamaProvider
from app.services.revision_metrics import cosine_percent
from app.services.text import split_sentences, tokenize


@dataclass(frozen=True)
class SemanticPassageEvidence:
    document_sentence: str
    source_sentence: str
    score: float


def _eligible_sentences(text: str, *, limit: int = 24) -> list[str]:
    sentences = [sentence.strip() for sentence in split_sentences(text)]
    eligible = [sentence for sentence in sentences if len(tokenize(sentence)) >= 5]
    # Bounded inference keeps the optional local model suitable for low-resource
    # development environments. Deterministic exact/fuzzy evidence still uses
    # the full supplied text.
    return eligible[:limit]


async def semantic_passage_matches(
    provider: OllamaProvider,
    document_text: str,
    source_text: str,
    *,
    model: str,
    threshold: float = 68.0,
    max_matches: int = 8,
) -> list[SemanticPassageEvidence] | None:
    """Find paraphrase candidates using local sentence embeddings.

    Returns None when the optional AI runtime is unavailable. Scores are cosine
    candidate evidence, not plagiarism or authorship probabilities.
    """
    document_sentences = _eligible_sentences(document_text)
    source_sentences = _eligible_sentences(source_text)
    if not document_sentences or not source_sentences:
        return []

    all_sentences = document_sentences + source_sentences
    embeddings = await provider.embed_texts(all_sentences, model=model)
    if embeddings is None or len(embeddings) != len(all_sentences):
        return None

    document_vectors = embeddings[: len(document_sentences)]
    source_vectors = embeddings[len(document_sentences) :]
    matches: list[SemanticPassageEvidence] = []

    for document_sentence, document_vector in zip(document_sentences, document_vectors, strict=True):
        best_sentence = ""
        best_score = 0.0
        for source_sentence, source_vector in zip(source_sentences, source_vectors, strict=True):
            score = cosine_percent(document_vector, source_vector) or 0.0
            if score > best_score:
                best_score = score
                best_sentence = source_sentence

        if best_sentence and best_score >= threshold:
            matches.append(
                SemanticPassageEvidence(
                    document_sentence=document_sentence,
                    source_sentence=best_sentence,
                    score=best_score,
                )
            )

    matches.sort(key=lambda item: item.score, reverse=True)
    return matches[:max_matches]
