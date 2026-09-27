from __future__ import annotations

import argparse
import csv
import hashlib
import json
from pathlib import Path


SOURCE_URL = "https://storage.googleapis.com/paws/english/paws_wiki_labeled_final.tar.gz"
LICENSE_URL = "https://github.com/google-research-datasets/paws/blob/master/LICENSE"


def find_split(root: Path, filename: str) -> Path:
    candidates = sorted(path for path in root.rglob(filename) if path.is_file())
    if not candidates:
        raise ValueError(f"could not find {filename} below {root}")
    preferred = [path for path in candidates if "final" in {part.casefold() for part in path.parts}]
    if len(preferred) == 1:
        return preferred[0]
    if len(candidates) == 1:
        return candidates[0]
    raise ValueError(f"found multiple {filename} files below {root}; cannot choose deterministically")


def load_tsv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle, delimiter="\t")
        required = {"id", "sentence1", "sentence2", "label"}
        if reader.fieldnames is None or not required.issubset(reader.fieldnames):
            raise ValueError(f"{path} must contain columns: {', '.join(sorted(required))}")
        rows: list[dict[str, str]] = []
        for row in reader:
            label = str(row.get("label", "")).strip()
            left = str(row.get("sentence1", "")).strip()
            right = str(row.get("sentence2", "")).strip()
            if label not in {"0", "1"} or not left or not right:
                continue
            rows.append(
                {
                    "id": str(row.get("id", "")).strip(),
                    "sentence1": left,
                    "sentence2": right,
                    "label": label,
                }
            )
    if not rows:
        raise ValueError(f"no valid labeled pairs found in {path}")
    return rows


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
            }
            handle.write(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n")


def class_counts(rows: list[dict[str, str]]) -> dict[str, int]:
    return {
        "positive": sum(row["label"] == "1" for row in rows),
        "negative": sum(row["label"] == "0" for row in rows),
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Prepare deterministic balanced PAWS-Wiki dev/test samples for Averis semantic engineering evaluation."
    )
    parser.add_argument("extracted_root", help="Directory containing the extracted PAWS-Wiki Labeled (Final) archive")
    parser.add_argument("output_dir", help="Destination for calibration.jsonl and holdout.jsonl")
    parser.add_argument("--per-class", type=int, default=100)
    parser.add_argument("--seed", default="averis-paws-wiki-v1")
    args = parser.parse_args()

    if args.per_class < 1:
        parser.error("--per-class must be at least 1")

    root = Path(args.extracted_root).resolve()
    output = Path(args.output_dir).resolve()
    output.mkdir(parents=True, exist_ok=True)

    try:
        dev_path = find_split(root, "dev.tsv")
        test_path = find_split(root, "test.tsv")
        dev_rows = balanced_sample(load_tsv(dev_path), per_class=args.per_class, seed=f"{args.seed}:dev")
        test_rows = balanced_sample(load_tsv(test_path), per_class=args.per_class, seed=f"{args.seed}:test")
    except (ValueError, OSError) as exc:
        parser.error(str(exc))
        return 2

    calibration_path = output / "calibration.jsonl"
    holdout_path = output / "holdout.jsonl"
    write_jsonl(calibration_path, dev_rows, split_name="dev")
    write_jsonl(holdout_path, test_rows, split_name="test")

    print(
        json.dumps(
            {
                "dataset": "PAWS-Wiki Labeled (Final)",
                "task": "human-labeled paraphrase identification engineering benchmark",
                "source_url": SOURCE_URL,
                "license_url": LICENSE_URL,
                "seed": args.seed,
                "per_class_per_split": args.per_class,
                "calibration_source_split": "dev",
                "holdout_source_split": "test",
                "calibration_counts": class_counts(dev_rows),
                "holdout_counts": class_counts(test_rows),
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
