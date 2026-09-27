from __future__ import annotations

import argparse
import asyncio
import json
import math

from app.ai.providers.ollama import OllamaProvider
from app.services.revision_metrics import cosine_percent


def _vector_norm(vector: list[float]) -> float:
    return math.sqrt(sum(value * value for value in vector))


async def run(args: argparse.Namespace) -> int:
    provider = OllamaProvider(
        args.base_url,
        args.generation_model,
        timeout_seconds=args.timeout,
    )

    health = await provider.health()
    if not bool(health.get("reachable")):
        print(json.dumps({"ok": False, "stage": "health", "details": health}, indent=2))
        return 2

    anchor = "Continuous verification should be applied before every protected access request is trusted."
    paraphrase = "Each request for a protected resource should be checked continuously before access is trusted."
    unrelated = "Regular exercise can improve cardiovascular endurance and support long-term physical health."

    embeddings = await provider.embed_texts(
        [anchor, anchor, paraphrase, unrelated],
        model=args.embedding_model,
    )
    if embeddings is None or len(embeddings) != 4:
        print(
            json.dumps(
                {
                    "ok": False,
                    "stage": "embedding",
                    "note": "Embedding model did not return four vectors.",
                    "model": args.embedding_model,
                },
                indent=2,
            )
        )
        return 3

    dimensions = {len(vector) for vector in embeddings}
    if len(dimensions) != 1 or next(iter(dimensions), 0) <= 0:
        print(json.dumps({"ok": False, "stage": "dimension", "dimensions": sorted(dimensions)}, indent=2))
        return 4

    finite_vectors = all(math.isfinite(value) for vector in embeddings for value in vector)
    vector_norms = [_vector_norm(vector) for vector in embeddings]
    nonzero_vectors = all(math.isfinite(norm) and norm > 0 for norm in vector_norms)

    self_score = cosine_percent(embeddings[0], embeddings[1])
    paraphrase_score = cosine_percent(embeddings[0], embeddings[2])
    unrelated_score = cosine_percent(embeddings[0], embeddings[3])
    paraphrase_margin = (
        round(paraphrase_score - unrelated_score, 6)
        if paraphrase_score is not None and unrelated_score is not None
        else None
    )

    checks = {
        "finite_vector_values": finite_vectors,
        "nonzero_vector_norms": nonzero_vectors,
        "self_similarity_at_least_99": self_score is not None and self_score >= 99.0,
        "paraphrase_above_unrelated": paraphrase_margin is not None and paraphrase_margin > 0,
    }

    coach = None
    if args.check_coach:
        coach = await provider.coach(
            "Give exactly one short academic revision action. Do not rewrite text and do not claim authorship."
        )
        checks["coach_available"] = bool(coach)

    payload = {
        "ok": all(checks.values()),
        "provider": "ollama",
        "base_url": args.base_url,
        "generation_model": args.generation_model,
        "embedding_model": args.embedding_model,
        "embedding_dimension": next(iter(dimensions)),
        "vector_norm_min": round(min(vector_norms), 6),
        "vector_norm_max": round(max(vector_norms), 6),
        "self_similarity_percent": self_score,
        "paraphrase_similarity_percent": paraphrase_score,
        "unrelated_similarity_percent": unrelated_score,
        "paraphrase_margin_percent": paraphrase_margin,
        "checks": checks,
        "coach_sample": coach,
        "boundary": (
            "Runtime smoke evidence only. The paraphrase/unrelated ordering is a sanity check, not a calibrated "
            "plagiarism, misconduct, or AI-authorship threshold."
        ),
    }
    print(json.dumps(payload, indent=2))
    return 0 if payload["ok"] else 5


def main() -> int:
    parser = argparse.ArgumentParser(description="Certify the local Averis Ollama inference path.")
    parser.add_argument("--base-url", default="http://localhost:11434")
    parser.add_argument("--generation-model", default="qwen3:4b")
    parser.add_argument("--embedding-model", default="nomic-embed-text")
    parser.add_argument("--timeout", type=float, default=30.0)
    parser.add_argument("--check-coach", action="store_true")
    return asyncio.run(run(parser.parse_args()))


if __name__ == "__main__":
    raise SystemExit(main())
