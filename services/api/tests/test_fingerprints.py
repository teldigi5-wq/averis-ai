from app.services.fingerprints import (
    chunk_text,
    minhash_signature,
    minhash_similarity,
    signature_as_hex,
    stable_text_hash,
)


def test_stable_text_hash_ignores_formatting_only_changes() -> None:
    assert stable_text_hash("Hello,   WORLD!") == stable_text_hash("hello world")


def test_chunk_text_uses_overlap_and_stable_ids() -> None:
    text = " ".join(f"word{i}" for i in range(260))
    chunks = chunk_text(text, max_words=100, overlap_words=20)
    assert len(chunks) == 3
    assert chunks[0].start_word == 0
    assert chunks[0].end_word == 100
    assert chunks[1].start_word == 80
    assert chunks[0].chunk_id == chunk_text(text, max_words=100, overlap_words=20)[0].chunk_id


def test_minhash_is_deterministic_and_identical_text_scores_one() -> None:
    text = "network security monitoring detects suspicious traffic and repeated access attempts"
    left = minhash_signature(text)
    right = minhash_signature(text)
    assert left == right
    assert len(left) == 64
    assert minhash_similarity(left, right) == 1.0
    assert all(len(value) == 16 for value in signature_as_hex(left))


def test_unrelated_minhash_candidates_remain_low() -> None:
    left = minhash_signature("routers forward packets across interconnected computer networks")
    right = minhash_signature("chlorophyll captures sunlight during photosynthesis in green plants")
    assert minhash_similarity(left, right) < 0.25
