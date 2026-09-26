import re
from collections.abc import Iterable


_WHITESPACE = re.compile(r"\s+")
_NON_WORD = re.compile(r"[^\w\s'-]", re.UNICODE)
_SENTENCE_BOUNDARY = re.compile(r"(?<=[.!?])\s+")


def normalize_text(text: str) -> str:
    lowered = text.casefold()
    cleaned = _NON_WORD.sub(" ", lowered)
    return _WHITESPACE.sub(" ", cleaned).strip()


def tokenize(text: str) -> list[str]:
    normalized = normalize_text(text)
    return normalized.split() if normalized else []


def shingles(text: str, width: int = 5) -> set[tuple[str, ...]]:
    words = tokenize(text)
    if not words:
        return set()
    if len(words) <= width:
        return {tuple(words)}
    return {tuple(words[i : i + width]) for i in range(len(words) - width + 1)}


def split_sentences(text: str) -> list[str]:
    compact = _WHITESPACE.sub(" ", text).strip()
    if not compact:
        return []
    parts = _SENTENCE_BOUNDARY.split(compact)
    return [part.strip() for part in parts if len(part.strip().split()) >= 3]


def jaccard(left: Iterable[object], right: Iterable[object]) -> float:
    left_set = set(left)
    right_set = set(right)
    union = left_set | right_set
    if not union:
        return 0.0
    return len(left_set & right_set) / len(union)
