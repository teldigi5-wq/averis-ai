import math

from app.services.embeddings import HashingEmbeddingProvider, cosine_similarity


def test_hashing_provider_is_deterministic_and_normalized() -> None:
    provider = HashingEmbeddingProvider(dimension=128)
    left = provider.embed("secure software supply chain verification")
    right = provider.embed("secure software supply chain verification")
    assert left == right
    assert math.isclose(sum(value * value for value in left), 1.0, rel_tol=1e-9)
    assert math.isclose(cosine_similarity(left, right), 1.0, rel_tol=1e-9)


def test_hashing_provider_keeps_unrelated_candidates_separate() -> None:
    provider = HashingEmbeddingProvider(dimension=256)
    security = provider.embed("firewall packet inspection network authentication")
    biology = provider.embed("photosynthesis chlorophyll sunlight glucose plant")
    assert cosine_similarity(security, biology) < 0.5


def test_empty_text_returns_zero_vector() -> None:
    provider = HashingEmbeddingProvider(dimension=64)
    vector = provider.embed("   ")
    assert vector == [0.0] * 64
    assert cosine_similarity(vector, vector) == 0.0
