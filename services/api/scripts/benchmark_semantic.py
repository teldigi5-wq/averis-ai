from __future__ import annotations

import argparse
import asyncio
from dataclasses import asdict
import hashlib
import json
from pathlib import Path
import re

from app.ai.providers.ollama import OllamaProvider
from app.services.detector_benchmark import benchmark_detector
from app.services.evidence_calibration import calibrate_and_evaluate_holdout
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
                raise ValueError(f"invalid JSON on line {line_number} of {path}") from exc
            if not isinstance(row, dict):
                raise ValueError(f"line {line_number} of {path} must be a JSON object")
            if row.get("label") not in {0, 1}:
                raise ValueError(f"line {line_number} of {path} label must be 0 or 1")
            if not isinstance(row.get("left"), str) or not isinstance(row.get("right"), str):
                raise ValueError(f"line {line_number} of {path} must contain string left/right fields")
            if not str(row["left"]).strip() or not str(row["right"]).strip():
                raise ValueError(f"line {line_number} of {path} contains an empty text field")
            rows.append(row)
    if not rows:
        raise ValueError(f"dataset {path} is empty")
    return rows


def dataset_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _normalized_text(value: object) -> str:
    return re.sub(r"\s+", " ", str(value).casefold()).strip()


def pair_identity(row: dict[str, object]) -> str:
    """Create a direction-independent identity so reversed duplicate pairs are caught."""
    pair = sorted((_normalized_text(row["left"]), _normalized_text(row["right"])))
    return hashlib.sha256("\x1f".join(pair).encode("utf-8")).hexdigest()


def ensure_disjoint(
    calibration_rows: list[dict[str, object]],
    holdout_rows: list[dict[str, object]],
) -> None:
    calibration_keys = {pair_identity(row) for row in calibration_rows}
    holdout_keys = {pair_identity(row) for row in holdout_rows}
    overlap = calibration_keys & holdout_keys
    if overlap:
        raise ValueError(
            f"calibration and holdout datasets share {len(overlap)} normalized text pair(s); "
            "held-out evaluation must be disjoint"
        )


def validate_class_sizes(rows: list[dict[str, object]], *, name: str, minimum: int) -> tuple[int, int]:
    labels = [int(row["label"]) for row in rows]
    positives = sum(labels)
    negatives = len(labels) - positives
    if positives < minimum or negatives < minimum:
        raise ValueError(
            f"{name} requires at least {minimum} positive and negative examples; "
            f"got {positives} positive and {negatives} negative"
        )
    return positives, negatives


async def score_rows(
    provider: OllamaProvider,
    rows: list[dict[str, object]],
    *,
    model: str,
    name: str,
    progress: bool,
) -> list[float]:
    scores: list[float] = []
    for index, row in enumerate(rows, start=1):
        score = await score_pair(
            provider,
            str(row["left"]),
            str(row["right"]),
            model=model,
        )
        scores.append(score)
        if progress:
            print(f"{name}: scored {index}/{len(rows)}", flush=True)
    return scores


def benchmark_payload(labels: list[int], scores: list[float]) -> dict[str, float | int]:
    detector = benchmark_detector(labels, scores)
    return {
        "samples": len(labels),
        "positive_samples": detector.positive_samples,
        "negative_samples": detector.negative_samples,
        "roc_auc": detector.roc_auc,
        "equal_error_rate": detector.equal_error_rate,
        "tpr_at_fpr_1_percent": detector.tpr_at_fpr_1_percent,
        "tpr_at_fpr_5_percent": detector.tpr_at_fpr_5_percent,
        "tpr_at_fpr_10_percent": detector.tpr_at_fpr_10_percent,
    }


async def run(args: argparse.Namespace) -> int:
    calibration_path = Path(args.calibration_dataset).resolve()
    holdout_path = Path(args.holdout_dataset).resolve()
    if calibration_path == holdout_path:
        raise ValueError("calibration and holdout dataset paths must be different")

    calibration_rows = load_rows(calibration_path)
    holdout_rows = load_rows(holdout_path)
    ensure_disjoint(calibration_rows, holdout_rows)
    validate_class_sizes(calibration_rows, name="calibration dataset", minimum=args.min_class_size)
    validate_class_sizes(holdout_rows, name="holdout dataset", minimum=args.min_class_size)

    provider = OllamaProvider(
        args.base_url,
        args.generation_model,
        timeout_seconds=args.timeout,
    )
    health = await provider.health()
    if not bool(health.get("reachable")):
        raise RuntimeError("Ollama is not reachable; run the runtime certification first")

    calibration_scores = await score_rows(
        provider,
        calibration_rows,
        model=args.embedding_model,
        name="calibration",
        progress=args.progress,
    )
    holdout_scores = await score_rows(
        provider,
        holdout_rows,
        model=args.embedding_model,
        name="holdout",
        progress=args.progress,
    )

    calibration_labels = [int(row["label"]) for row in calibration_rows]
    holdout_labels = [int(row["label"]) for row in holdout_rows]
    locked = calibrate_and_evaluate_holdout(
        calibration_labels,
        calibration_scores,
        holdout_labels,
        holdout_scores,
        max_false_positive_rate=args.max_fpr,
    )

    payload = {
        "provider": "ollama",
        "embedding_model": args.embedding_model,
        "calibration_dataset": {
            "path": str(calibration_path),
            "sha256": dataset_sha256(calibration_path),
            **benchmark_payload(calibration_labels, calibration_scores),
        },
        "holdout_dataset": {
            "path": str(holdout_path),
            "sha256": dataset_sha256(holdout_path),
            **benchmark_payload(holdout_labels, holdout_scores),
        },
        "calibration_target_max_fpr": args.max_fpr,
        "locked_threshold": locked.calibration.threshold,
        "calibration_threshold_metrics": asdict(locked.calibration),
        "holdout_locked_threshold_metrics": asdict(locked.holdout),
        "holdout_fpr_budget_met": locked.holdout.false_positive_rate <= args.max_fpr,
        "threshold_selection_rule": (
            "Threshold is selected only on calibration rows under the configured FPR budget and is then "
            "evaluated unchanged on the disjoint holdout dataset."
        ),
        "boundary": (
            "These metrics describe the supplied labeled datasets and embedding model only. Passing an FPR budget is "
            "not sufficient by itself to promote a production threshold and does not establish authorship, misconduct, "
            "or a universal plagiarism threshold. Dataset provenance, subgroup behavior, task fit, and human-review "
            "policy must be documented separately."
        ),
    }
    print(json.dumps(payload, indent=2))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Calibrate Averis semantic pair evidence and evaluate the locked threshold on a disjoint holdout set."
    )
    parser.add_argument("calibration_dataset", help="Calibration JSONL rows: label (0/1), left, right")
    parser.add_argument("holdout_dataset", help="Disjoint held-out JSONL rows: label (0/1), left, right")
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
    except (ValueError, RuntimeError, OSError) as exc:
        parser.error(str(exc))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
