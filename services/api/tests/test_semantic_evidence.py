from app.services.semantic_evidence import semantic_passage_matches


class FakeEmbeddingProvider:
    async def embed_texts(self, texts: list[str], *, model: str) -> list[list[float]]:
        assert model == "test-embedding"
        vectors: list[list[float]] = []
        for text in texts:
            value = text.casefold()
            if "continuous verification" in value or "every access request" in value:
                vectors.append([1.0, 0.0, 0.0])
            elif "backup" in value or "recovery" in value:
                vectors.append([0.0, 1.0, 0.0])
            else:
                vectors.append([0.0, 0.0, 1.0])
        return vectors


async def test_semantic_passage_matching_surfaces_paraphrase_candidate() -> None:
    document = (
        "Every access request should be checked continuously before a protected resource is trusted. "
        "Backups should also be tested regularly so recovery plans remain usable."
    )
    source = (
        "Continuous verification is required for every access request to protected resources. "
        "Organizations should validate backup and recovery procedures on a regular schedule."
    )

    matches = await semantic_passage_matches(
        FakeEmbeddingProvider(),  # type: ignore[arg-type]
        document,
        source,
        model="test-embedding",
        threshold=60.0,
    )

    assert matches is not None
    assert len(matches) == 2
    assert all(match.score == 100.0 for match in matches)
    assert "access request" in matches[0].document_sentence.casefold()


class UnavailableEmbeddingProvider:
    async def embed_texts(self, texts: list[str], *, model: str):
        return None


async def test_semantic_passage_matching_fails_open_to_deterministic_evidence() -> None:
    matches = await semantic_passage_matches(
        UnavailableEmbeddingProvider(),  # type: ignore[arg-type]
        "A sufficiently long document sentence exists for semantic comparison.",
        "A sufficiently long source sentence exists for semantic comparison.",
        model="missing",
    )
    assert matches is None
