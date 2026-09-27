from pathlib import Path

import pytest

from scripts.prepare_paws_wiki_benchmark import balanced_sample, load_rows


def make_rows() -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for label in ("0", "1"):
        for index in range(5):
            rows.append(
                {
                    "id": f"{label}-{index}",
                    "sentence1": f"left {label} {index}",
                    "sentence2": f"right {label} {index}",
                    "label": label,
                }
            )
    return rows


def test_balanced_sample_is_reproducible_and_balanced() -> None:
    first = balanced_sample(make_rows(), per_class=3, seed="fixed")
    second = balanced_sample(list(reversed(make_rows())), per_class=3, seed="fixed")

    assert first == second
    assert len(first) == 6
    assert sum(row["label"] == "0" for row in first) == 3
    assert sum(row["label"] == "1" for row in first) == 3


def test_tsv_loader_normalizes_required_fields(tmp_path: Path) -> None:
    source = tmp_path / "validation.tsv"
    source.write_text(
        "id\tsentence1\tsentence2\tlabel\n"
        "7\t First sentence \t Second sentence \t1\n"
        "8\tNegative left\tNegative right\t0\n",
        encoding="utf-8",
    )

    rows = load_rows(source)

    assert rows == [
        {"id": "7", "sentence1": "First sentence", "sentence2": "Second sentence", "label": "1"},
        {"id": "8", "sentence1": "Negative left", "sentence2": "Negative right", "label": "0"},
    ]


def test_loader_rejects_unknown_format(tmp_path: Path) -> None:
    source = tmp_path / "data.csv"
    source.write_text("unused", encoding="utf-8")

    with pytest.raises(ValueError, match="unsupported PAWS input format"):
        load_rows(source)
