from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
import hashlib
import math
from typing import Protocol

from app.services.text import tokenize


class EmbeddingProvider(Protocol):
    name: str
    dimension: int

    def embed(self, text: str) -> list[float]: ...


@dataclass(frozen=True)
class HashingEmbeddingProvider:
    """Deterministic zero-cost fallback for candidate plumbing and CI.

    This is intentionally lexical feature hashing, not a semantic language model.
    Production semantic reranking can later replace it with a BGE-M3 worker while
    keeping the same provider contract.
    """

    dimension: int = 256
    name: str = "hashing-lexical-v1"

    def embed(self, text: str) -> list[float]:
        if self.dimension < 32:
            raise ValueError("dimension must be at least 32")

        vector = [0.0] * self.dimension
        counts = Counter(tokenize(text))
        if not counts:
            return vector

        for token, count in counts.items():
            digest = hashlib.sha256(token.encode("utf-8")).digest()
            bucket = int.from_bytes(digest[:8], "big", signed=False) % self.dimension
            sign = 1.0 if digest[8] & 1 else -1.0
            weight = 1.0 + math.log(float(count))
            vector[bucket] += sign * weight

        magnitude = math.sqrt(sum(value * value for value in vector))
        if magnitude == 0:
            return vector
        return [value / magnitude for value in vector]


def cosine_similarity(left: list[float], right: list[float]) -> float:
    if len(left) != len(right):
        raise ValueError("Embedding vectors must have the same dimension")
    if not left:
        return 0.0

    left_norm = math.sqrt(sum(value * value for value in left))
    right_norm = math.sqrt(sum(value * value for value in right))
    if left_norm == 0 or right_norm == 0:
        return 0.0

    dot = sum(left_value * right_value for left_value, right_value in zip(left, right, strict=True))
    return max(-1.0, min(1.0, dot / (left_norm * right_norm)))
