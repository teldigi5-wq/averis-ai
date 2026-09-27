from __future__ import annotations

import argparse
import asyncio
from dataclasses import asdict
import json
from pathlib import Path

from app.ai.providers.ollama import OllamaProvider
from app.services.academic_evaluation import (
    assess_technical_candidate,
    ensure_academic_splits_are_disjoint,
    false_positive_review_records,
    parse_manifest,
    subgroup_metrics,
    verify_manifest_hashes,
)
from app.services.detector_benchmark import benchmark_detector
from app.services.evidence_calibration import calibrate_and_evaluate_holdout
from scripts.benchmark_semantic import load_rows, score_rows


def _benchmark_payload(labels: list[int], scores: list[float]) -> dict[str, float | int]:
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


def _load_manifest(path: Path) -> dict[str, object]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"invalid JSON in academic evaluation manifest {path}") from exc
    if not isinstance(payload, dict):
        raise ValueError("academic evaluation manifest must contain a JSON object")
    return payload


async def run(args: argparse.Namespace) -> int:
    manifest_path = Path(args.manifest).resolve()
    calibration_path = Path(args.calibration_dataset).resolve()
    holdout_path = Path(args.holdout_dataset).resolve()
    output_dir = Path(args.output_dir).resolve()

    if calibration_path == holdout_path:
        raise ValueError("calibration and holdout dataset paths must be different")

    manifest = parse_manifest(_load_manifest(manifest_path))
    observed_hashes = verify_manifest_hashes(manifest, calibration_path, holdout_path)

    calibration_rows = load_rows(calibration_path)
    holdout_rows = load_rows(holdout_path)
    ensure_academic_splits_are_disjoint(calibration_rows, holdout_rows)

    calibration_labels = [int(row["label"]) for row in calibration_rows]
    holdout_labels = [int(row["label"]) for row in holdout_rows]
    calibration_positives = sum(calibration_labels)
    calibration_negatives = len(calibration_labels) - calibration_positives
    holdout_positives = sum(holdout_labels)
    holdout_negatives = len(holdout_labels) - holdout_positives
    if min(calibration_positives, calibration_negatives, holdout_positives, holdout_negatives) < args.min_class_size:
        raise ValueError(
            "academic evaluation requires at least "
            f"{args.min_class_size} positive and negative examples independently in calibration and holdout"
        )

    provider = OllamaProvider(
        args.base_url,
        args.generation_model,
        timeout_seconds=args.timeout,
    )
    health = await provider.health()
    if not bool(health.get("reachable")):
        raise RuntimeError("Ollama is not reachable; certify the local runtime before academic-domain evaluation")

    calibration_scores = await score_rows(
        provider,
        calibration_rows,
        model=args.embedding_model,
        name="academic-calibration",
        batch_size=args.batch_size,
        progress=args.progress,
    )
    holdout_scores = await score_rows(
        provider,
        holdout_rows,
        model=args.embedding_model,
        name="academic-holdout",
        batch_size=args.batch_size,
        progress=args.progress,
    )

    locked = calibrate_and_evaluate_holdout(
        calibration_labels,
        calibration_scores,
        holdout_labels,
        holdout_scores,
        max_false_positive_rate=args.max_fpr,
    )

    subgroup_fields = tuple(
        field.strip() for field in args.subgroup_fields.split(",") if field.strip()
    )
    subgroup_report = subgroup_metrics(
        holdout_rows,
        holdout_scores,
        threshold=locked.calibration.threshold,
        fields=subgroup_fields,
        min_class_size=args.subgroup_min_class_size,
    )
    false_positives = false_positive_review_records(
        holdout_rows,
        holdout_scores,
        threshold=locked.calibration.threshold,
        limit=args.false_positive_review_limit,
    )
    assessment = assess_technical_candidate(
        locked.holdout,
        subgroup_report,
        max_false_positive_rate=args.max_fpr,
        minimum_recall=args.minimum_recall,
    )

    report = {
        "schema_version": "averis.academic-evaluation-report/v1",
        "provider": "ollama",
        "embedding_model": args.embedding_model,
        "manifest": manifest.as_dict(),
        "observed_split_sha256": observed_hashes,
        "calibration": {
            **_benchmark_payload(calibration_labels, calibration_scores),
            "threshold_metrics": asdict(locked.calibration),
        },
        "holdout": {
            **_benchmark_payload(holdout_labels, holdout_scores),
            "locked_threshold_metrics": asdict(locked.holdout),
        },
        "locked_threshold": locked.calibration.threshold,
        "configured_max_fpr": args.max_fpr,
        "configured_minimum_recall": args.minimum_recall,
        "subgroup_fields": list(subgroup_fields),
        "subgroups": subgroup_report,
        "false_positive_review_count": len(false_positives),
        "assessment": assessment.as_dict(),
        "boundary": (
            "This report evaluates semantic pair retrieval on the exact licensed/provenance-tracked dataset revision in the "
            "manifest. It does not establish plagiarism, misconduct, authorship, or a universal threshold. The technical "
            "candidate gate cannot promote a model automatically; a separate human product/policy decision is required."
        ),
    }

    false_positive_report = {
        "schema_version": "averis.false-positive-review/v1",
        "dataset_id": manifest.dataset_id,
        "dataset_revision": manifest.revision,
        "embedding_model": args.embedding_model,
        "threshold": locked.calibration.threshold,
        "records": false_positives,
        "privacy_boundary": (
            "Raw passage text is intentionally excluded from this artifact. Review records contain dataset row IDs, "
            "pair hashes, scores, and supplied metadata only."
        ),
    }

    output_dir.mkdir(parents=True, exist_ok=True)
    report_path = output_dir / "academic-evaluation-report.json"
    false_positive_path = output_dir / "false-positive-review.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    false_positive_path.write_text(json.dumps(false_positive_report, indent=2) + "\n", encoding="utf-8")

    print(json.dumps(report, indent=2))
    print(f"academic evaluation report: {report_path}")
    print(f"false-positive review artifact: {false_positive_path}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Evaluate an Averis semantic embedding model on a provenance-tracked academic-domain calibration/holdout corpus."
        )
    )
    parser.add_argument("manifest", help="Academic evaluation manifest JSON")
    parser.add_argument("calibration_dataset", help="Calibration JSONL rows with id, label, left, right, optional metadata")
    parser.add_argument("holdout_dataset", help="Final holdout JSONL rows with id, label, left, right, optional metadata")
    parser.add_argument("--output-dir", default="../../artifacts/academic-evaluation")
    parser.add_argument("--base-url", default="http://localhost:11434")
    parser.add_argument("--generation-model", default="qwen3:4b")
    parser.add_argument("--embedding-model", default="nomic-embed-text")
    parser.add_argument("--timeout", type=float, default=30.0)
    parser.add_argument("--max-fpr", type=float, default=0.05)
    parser.add_argument("--minimum-recall", type=float, default=0.25)
    parser.add_argument("--min-class-size", type=int, default=100)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--subgroup-fields", default="rewrite_type,discipline,citation_state,passage_length_bucket")
    parser.add_argument("--subgroup-min-class-size", type=int, default=10)
    parser.add_argument("--false-positive-review-limit", type=int, default=25)
    parser.add_argument("--progress", action="store_true")
    args = parser.parse_args()

    if not 0 <= args.max_fpr <= 1:
        parser.error("--max-fpr must be between 0 and 1")
    if not 0 <= args.minimum_recall <= 1:
        parser.error("--minimum-recall must be between 0 and 1")
    if args.min_class_size < 1:
        parser.error("--min-class-size must be at least 1")
    if args.subgroup_min_class_size < 1:
        parser.error("--subgroup-min-class-size must be at least 1")
    if args.batch_size < 1 or args.batch_size > 256:
        parser.error("--batch-size must be between 1 and 256")
    if args.false_positive_review_limit < 1:
        parser.error("--false-positive-review-limit must be at least 1")

    try:
        return asyncio.run(run(args))
    except (ValueError, RuntimeError, OSError) as exc:
        parser.error(str(exc))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
