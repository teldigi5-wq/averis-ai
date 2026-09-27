from __future__ import annotations

import argparse
import csv
import hashlib
import json
from pathlib import Path
from typing import Iterable


DATASET_ID = "google-research-datasets/paws"
DATASET_REVISION = "161ece9501cf0a11f3e48bd356eaa82de46d6a09"
LICENSE_URL = "https://github.com/google-research-datasets/paws/blob/master/LICENSE"


def _normalize_row(row: dict[str, object]) -> dict[str, str] | None:
    label = str(row.get("label", "")).strip()
    left = str(row.get("sentence1", "")).strip()
    right = str(row.get("sentence2", "")).strip()
    if label not in {"0", "1"} or not left or not right:
        return None
    return {
        "id": str(row.get("id", "")).strip(),
        "sentence1": left,
        "sentence2": right,
        "label": label,
    }


def _valid_rows(rows: Iterable[dict[str, object]], path: Path) -> list[dict[str, str]]:
    normalized = [item for row in rows if (item := _normalize_row(row)) is not None]
    if not normalized:
        raise ValueError(f"no valid labeled pairs found in {path}")
    return normalized


def load_tsv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle, delimiter="\t")
        required = {"id", "sentence1", "sentence2", "label"}
        if reader.fieldnames is None or not required.issubset(reader.fieldnames):
            raise ValueError(f"{path} must contain columns: {', '.join(sorted(required))}")
        return _valid_rows((dict(row) for row in reader), path)


def load_parquet(path: Path) -> list[dict[str, str]]:
    try:
        import pyarrow.parquet as pq
    except ImportError as exc:
        raise ValueError("reading PAWS parquet files requires pyarrow") from exc

    table = pq.read_table(path, columns=["id", "sentence1", "sentence2", "label"])
    return _valid_rows(table.to_pylist(), path)


def load_rows(path: Path) -> list[dict[str, str]]:
    suffix = path.suffix.casefold()
    if suffix in {".tsv", ".txt"}:
        return load_tsv(path)
    if suffix == ".parquet":
        return load_parquet(path)
    raise ValueError(f"unsupported PAWS input format for {path}; expected .tsv or .parquet")


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sample_key(row: dict[str, str], *, seed: str) -> str:
    value = "\x1f".join((seed, row["id"], row["sentence1"], row["sentence2"], row["label"]))
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def balanced_sample(rows: list[dict[str, str]], *, per_class: int, seed: str) -> list[dict[str, str]]:
    selected: list[dict[str, str]] = []
    for label in ("0", "1"):
        candidates = [row for row in rows if row["label"] == label]
        if len(candidates) < per_class:
            raise ValueError(f"requested {per_class} rows for label {label}, but only {len(candidates)} are available")
        selected.extend(sorted(candidates, key=lambda row: sample_key(row, seed=seed))[:per_class])
    return sorted(selected, key=lambda row: sample_key(row, seed=f"{seed}:output"))


def write_jsonl(path: Path, rows: list[dict[str, str]], *, split_name: str) -> None:
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        for row in rows:
            payload = {
                "label": int(row["label"]),
                "left": row["sentence1"],
                "right": row["sentence2"],
                "source": "PAWS-Wiki Labeled (Final)",
                "source_split": split_name,
                "source_id": row["id"],
                "dataset_id": DATASET_ID,
                "dataset_revision": DATASET_REVISION,
            }
            handle.write(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n")


def class_counts(rows: list[dict[str, str]]) -> dict[str, int]:
    return {
        "positive": sum(row["label"] == "1" for row in rows),
        "negative": sum(row["label"] == "0" for row in rows),
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Prepare deterministic balanced PAWS-Wiki validation/test samples for Averis semantic engineering evaluation."
    )
    parser.add_argument("calibration_input", help="PAWS labeled_final validation split (.parquet or .tsv)")
    parser.add_argument("holdout_input", help="PAWS labeled_final test split (.parquet or .tsv)")
    parser.add_argument("output_dir", help="Destination for calibration.jsonl and holdout.jsonl")
    parser.add_argument("--per-class", type=int, default=100)
    parser.add_argument("--seed", default="averis-paws-wiki-v1")
    args = parser.parse_args()

    if args.per_class < 1:
        parser.error("--per-class must be at least 1")

    calibration_input = Path(args.calibration_input).resolve()
    holdout_input = Path(args.holdout_input).resolve()
    output = Path(args.output_dir).resolve()
    output.mkdir(parents=True, exist_ok=True)

    if calibration_input == holdout_input:
        parser.error("calibration_input and holdout_input must be different files")

    try:
        calibration_rows = balanced_sample(
            load_rows(calibration_input),
            per_class=args.per_class,
            seed=f"{args.seed}:validation",
        )
        holdout_rows = balanced_sample(
            load_rows(holdout_input),
            per_class=args.per_class,
            seed=f"{args.seed}:test",
        )
    except (ValueError, OSError) as exc:
        parser.error(str(exc))
        return 2

    calibration_path = output / "calibration.jsonl"
    holdout_path = output / "holdout.jsonl"
    write_jsonl(calibration_path, calibration_rows, split_name="validation")
    write_jsonl(holdout_path, holdout_rows, split_name="test")

    print(
        json.dumps(
            {
                "dataset": "PAWS-Wiki Labeled (Final)",
                "dataset_id": DATASET_ID,
                "dataset_revision": DATASET_REVISION,
                "task": "human-labeled paraphrase identification engineering benchmark",
                "license_url": LICENSE_URL,
                "seed": args.seed,
                "per_class_per_split": args.per_class,
                "calibration_source_split": "validation",
                "holdout_source_split": "test",
                "calibration_input_sha256": file_sha256(calibration_input),
                "holdout_input_sha256": file_sha256(holdout_input),
                "calibration_counts": class_counts(calibration_rows),
                "holdout_counts": class_counts(holdout_rows),
                "calibration_output": str(calibration_path),
                "holdout_output": str(holdout_path),
                "boundary": (
                    "PAWS-Wiki is a paraphrase-identification benchmark. It is useful for semantic retrieval engineering "
                    "but is not an academic plagiarism, misconduct, or AI-authorship ground-truth corpus."
                ),
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
