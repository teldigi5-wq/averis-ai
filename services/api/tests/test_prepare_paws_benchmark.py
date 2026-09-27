from pathlib import Path

from scripts.prepare_paws_wiki_benchmark import balanced_sample, find_split


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


def test_find_split_prefers_final_directory(tmp_path: Path) -> None:
    auxiliary = tmp_path / "other" / "dev.tsv"
    final = tmp_path / "final" / "dev.tsv"
    auxiliary.parent.mkdir()
    final.parent.mkdir()
    auxiliary.write_text("aux", encoding="utf-8")
    final.write_text("final", encoding="utf-8")

    assert find_split(tmp_path, "dev.tsv") == final
