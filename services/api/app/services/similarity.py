from rapidfuzz import fuzz

from app.schemas.similarity import PassageMatch, SimilarityReport
from app.services.text import jaccard, shingles, split_sentences


MATCH_THRESHOLD = 72.0


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


def compare_texts(document_text: str, source_text: str, source_name: str) -> SimilarityReport:
    shingle_score = jaccard(shingles(document_text), shingles(source_text)) * 100
    matches = _sentence_matches(document_text, source_text)
    sentence_score = (
        sum(match.score for match in matches) / len(matches)
        if matches
        else 0.0
    )

    # Conservative first-milestone score: exact-overlap evidence carries more
    # weight than fuzzy sentence resemblance.
    combined = (0.7 * shingle_score) + (0.3 * sentence_score)

    return SimilarityReport(
        source_name=source_name,
        similarity_percent=round(min(combined, 100.0), 2),
        shingle_jaccard=round(shingle_score, 2),
        sentence_match_score=round(sentence_score, 2),
        matched_passages=matches,
        evidence_note=(
            "Milestone 1 score based on word-shingle overlap and fuzzy sentence matching. "
            "It is evidence for review, not a plagiarism verdict."
        ),
    )
