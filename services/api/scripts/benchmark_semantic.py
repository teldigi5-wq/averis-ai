from __future__ import annotations

import argparse
import asyncio
from dataclasses import asdict
import json
from pathlib import Path

from app.ai.providers.ollama import OllamaProvider
from app.services.detector_benchmark import benchmark_detector
from app.services.evidence_calibration import calibrate_threshold
from app.services.revision_metrics import cosine_percent


async def score_pair(
    provider: OllamaProvider,
    left: str,
    right: str,
    *,
    model: str,
) -> float:
    embeddings = await provider.embed_texts([left, right], model=model)
    if embeddings is None or len(embeddings) != 2:
        raise RuntimeError("embedding runtime unavailable while scoring benchmark pair")
    score = cosine_percent(embeddings[0], embeddings[1])
    if score is None:
        raise RuntimeError("embedding runtime returned incompatible vectors")
    return score


def load_rows(path: Path) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line_number, raw in enumerate(handle, start=1):
            line = raw.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError as exc:
                raise ValueError(f"invalid JSON on line {line_number}") from exc
            if not isinstance(row, dict):
                raise ValueError(f"line {line_number} must be a JSON object")
            if row.get("label") not in {0, 1}:
                raise ValueError(f"line {line_number} label must be 0 or 1")
            if not isinstance(row.get("left"), str) or not isinstance(row.get("right"), str):
                raise ValueError(f"line {line_number} must contain string left/right fields")
            rows.append(row)
    return rows


async def run(args: argparse.Namespace) -> int:
    rows = load_rows(Path(args.dataset))
    labels = [int(row["label"]) for row in rows]
    positives = sum(labels)
    negatives = len(labels) - positives
    if positives < args.min_class_size or negatives < args.min_class_size:
        raise ValueError(
            f"benchmark requires at least {args.min_class_size} positive and negative examples; "
            f"got {positives} positive and {negatives} negative"
        )

    provider = OllamaProvider(
        args.base_url,
        args.generation_model,
        timeout_seconds=args.timeout,
    )
    health = await provider.health()
    if not bool(health.get("reachable")):
        raise RuntimeError("Ollama is not reachable; run the runtime certification first")

    scores: list[float] = []
    for index, row in enumerate(rows, start=1):
        score = await score_pair(
            provider,
            str(row["left"]),
            str(row["right"]),
            model=args.embedding_model,
        )
        scores.append(score)
        if args.progress:
            print(f"scored {index}/{len(rows)}", flush=True)

    detector = benchmark_detector(labels, scores)
    calibration = calibrate_threshold(
        labels,
        scores,
        max_false_positive_rate=args.max_fpr,
    )

    payload = {
        "dataset": str(Path(args.dataset)),
        "provider": "ollama",
        "embedding_model": args.embedding_model,
        "samples": len(rows),
        "positive_samples": positives,
        "negative_samples": negatives,
        "roc_auc": detector.roc_auc,
        "equal_error_rate": detector.equal_error_rate,
        "tpr_at_fpr_1_percent": detector.tpr_at_fpr_1_percent,
        "tpr_at_fpr_5_percent": detector.tpr_at_fpr_5_percent,
        "tpr_at_fpr_10_percent": detector.tpr_at_fpr_10_percent,
        "calibration_target_max_fpr": args.max_fpr,
        "calibrated_threshold": asdict(calibration),
        "boundary": (
            "Benchmark metrics describe this labeled dataset and model only. They do not establish authorship, "
            "misconduct, or a universal plagiarism threshold."
        ),
    }
    print(json.dumps(payload, indent=2))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Benchmark Averis semantic pair evidence on labeled JSONL data.")
    parser.add_argument("dataset", help="JSONL rows: label (0/1), left, right")
    parser.add_argument("--base-url", default="http://localhost:11434")
    parser.add_argument("--generation-model", default="qwen3:4b")
    parser.add_argument("--embedding-model", default="nomic-embed-text")
    parser.add_argument("--timeout", type=float, default=30.0)
    parser.add_argument("--max-fpr", type=float, default=0.05)
    parser.add_argument("--min-class-size", type=int, default=100)
    parser.add_argument("--progress", action="store_true")
    args = parser.parse_args()

    if args.max_fpr < 0 or args.max_fpr > 1:
        parser.error("--max-fpr must be between 0 and 1")
    if args.min_class_size < 1:
        parser.error("--min-class-size must be at least 1")

    try:
        return asyncio.run(run(args))
    except (ValueError, RuntimeError) as exc:
        parser.error(str(exc))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
