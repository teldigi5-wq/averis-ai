from rapidfuzz import fuzz

from app.schemas.similarity import PassageMatch, SimilarityReport
from app.services.embeddings import HashingEmbeddingProvider, cosine_similarity
from app.services.fingerprints import minhash_signature, minhash_similarity, stable_text_hash
from app.services.text import jaccard, shingles, split_sentences


MATCH_THRESHOLD = 72.0
_CANDIDATE_PROVIDER = HashingEmbeddingProvider()


def _sentence_matches(document_text: str, source_text: str) -> list[PassageMatch]:
    document_sentences = split_sentences(document_text)
    source_sentences = split_sentences(source_text)
    matches: list[PassageMatch] = []

    for document_sentence in document_sentences:
        best_source = ""
        best_score = 0.0
        for source_sentence in source_sentences:
            score = float(fuzz.token_set_ratio(document_sentence, source_sentence))
            if score > best_score:
                best_score = score
                best_source = source_sentence

        if best_source and best_score >= MATCH_THRESHOLD:
            matches.append(
                PassageMatch(
                    document_sentence=document_sentence,
                    source_sentence=best_source,
                    score=round(best_score, 2),
                )
            )

    return sorted(matches, key=lambda item: item.score, reverse=True)[:12]


def _candidate_signals(document_text: str, source_text: str) -> tuple[float, float]:
    left_signature = minhash_signature(document_text)
    right_signature = minhash_signature(source_text)
    minhash_score = minhash_similarity(left_signature, right_signature) * 100

    left_vector = _CANDIDATE_PROVIDER.embed(document_text)
    right_vector = _CANDIDATE_PROVIDER.embed(source_text)
    # Feature hashing is a lexical candidate signal, not a semantic verdict.
    vector_score = max(0.0, cosine_similarity(left_vector, right_vector)) * 100
    return round(minhash_score, 2), round(vector_score, 2)


def compare_texts(document_text: str, source_text: str, source_name: str) -> SimilarityReport:
    shingle_score = jaccard(shingles(document_text), shingles(source_text)) * 100
    matches = _sentence_matches(document_text, source_text)
    sentence_score = (
        sum(match.score for match in matches) / len(matches)
        if matches
        else 0.0
    )

    # Conservative evidence score: exact-overlap evidence carries more weight
    # than fuzzy sentence resemblance. M2 candidate signals below do not alter
    # this primary score until a real semantic model is separately certified.
    combined = (0.7 * shingle_score) + (0.3 * sentence_score)
    minhash_score, vector_score = _candidate_signals(document_text, source_text)

    return SimilarityReport(
        source_name=source_name,
        similarity_percent=round(min(combined, 100.0), 2),
        shingle_jaccard=round(shingle_score, 2),
        sentence_match_score=round(sentence_score, 2),
        matched_passages=matches,
        evidence_note=(
            "Primary score uses word-shingle overlap and fuzzy sentence evidence. "
            "MinHash and lexical feature-vector scores are candidate-retrieval signals only; "
            "they are not a plagiarism verdict and are not yet semantic-model evidence."
        ),
        document_hash=stable_text_hash(document_text),
        source_hash=stable_text_hash(source_text),
        minhash_candidate_score=minhash_score,
        vector_candidate_score=vector_score,
        candidate_provider=_CANDIDATE_PROVIDER.name,
        evidence_version="m2-candidate-foundation-v1",
    )
