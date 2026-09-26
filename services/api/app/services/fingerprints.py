from __future__ import annotations

from dataclasses import dataclass
import hashlib

from app.services.text import normalize_text, shingles


DEFAULT_MINHASH_PERMUTATIONS = 64


@dataclass(frozen=True)
class TextChunk:
    index: int
    start_word: int
    end_word: int
    text: str
    text_hash: str
    chunk_id: str


def stable_text_hash(text: str) -> str:
    """Hash normalized text so formatting-only changes do not change identity."""
    normalized = normalize_text(text)
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def chunk_text(
    text: str,
    *,
    max_words: int = 180,
    overlap_words: int = 40,
) -> list[TextChunk]:
    """Split text into stable overlapping chunks without persisting the original file."""
    if max_words < 20:
        raise ValueError("max_words must be at least 20")
    if overlap_words < 0 or overlap_words >= max_words:
        raise ValueError("overlap_words must be between 0 and max_words - 1")

    words = text.split()
    if not words:
        return []

    document_hash = stable_text_hash(text)
    step = max_words - overlap_words
    chunks: list[TextChunk] = []

    for index, start in enumerate(range(0, len(words), step)):
        end = min(start + max_words, len(words))
        chunk_value = " ".join(words[start:end])
        chunk_hash = stable_text_hash(chunk_value)
        chunk_id = hashlib.sha256(
            f"{document_hash}:{index}:{chunk_hash}".encode("utf-8")
        ).hexdigest()[:32]
        chunks.append(
            TextChunk(
                index=index,
                start_word=start,
                end_word=end,
                text=chunk_value,
                text_hash=chunk_hash,
                chunk_id=chunk_id,
            )
        )
        if end >= len(words):
            break

    return chunks


def minhash_signature(
    text: str,
    *,
    permutations: int = DEFAULT_MINHASH_PERMUTATIONS,
    shingle_width: int = 5,
) -> tuple[int, ...]:
    """Create a deterministic MinHash signature using only the Python standard library."""
    if permutations <= 0:
        raise ValueError("permutations must be positive")
    if shingle_width <= 0:
        raise ValueError("shingle_width must be positive")

    text_shingles = shingles(text, width=shingle_width)
    if not text_shingles:
        return tuple()

    encoded = ["\x1f".join(item).encode("utf-8") for item in text_shingles]
    signature: list[int] = []

    for seed in range(permutations):
        prefix = seed.to_bytes(4, "big", signed=False)
        minimum = min(
            int.from_bytes(
                hashlib.blake2b(prefix + item, digest_size=8).digest(),
                "big",
                signed=False,
            )
            for item in encoded
        )
        signature.append(minimum)

    return tuple(signature)


def minhash_similarity(left: tuple[int, ...], right: tuple[int, ...]) -> float:
    if not left or not right:
        return 0.0
    if len(left) != len(right):
        raise ValueError("MinHash signatures must use the same permutation count")
    equal = sum(1 for left_value, right_value in zip(left, right, strict=True) if left_value == right_value)
    return equal / len(left)


def signature_as_hex(signature: tuple[int, ...]) -> list[str]:
    """JSON-safe representation that avoids PostgreSQL signed bigint overflow."""
    return [f"{value:016x}" for value in signature]
