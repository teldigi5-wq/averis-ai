import pytest

from scripts.benchmark_semantic import ensure_disjoint, pair_identity, validate_class_sizes


def row(label: int, left: str, right: str) -> dict[str, object]:
    return {"label": label, "left": left, "right": right}


def test_pair_identity_is_direction_and_whitespace_independent() -> None:
    forward = row(1, "Student   passage", "Source passage")
    reversed_pair = row(0, " source passage ", "student passage")

    assert pair_identity(forward) == pair_identity(reversed_pair)


def test_disjoint_check_rejects_reversed_pair_leakage() -> None:
    calibration = [row(1, "A paraphrase of the source", "The source wording")]
    holdout = [row(1, "the source wording", "a paraphrase of the source")]

    with pytest.raises(ValueError, match="held-out evaluation must be disjoint"):
        ensure_disjoint(calibration, holdout)


def test_disjoint_check_allows_different_pairs() -> None:
    ensure_disjoint(
        [row(1, "Cloud access is continuously verified", "Verify each cloud access request")],
        [row(0, "Sprint starts require force", "Citations identify scholarly sources")],
    )


def test_each_split_enforces_minimum_class_size() -> None:
    rows = [
        row(1, "positive one", "positive source one"),
        row(1, "positive two", "positive source two"),
        row(0, "negative one", "unrelated source one"),
    ]

    with pytest.raises(ValueError, match="at least 2 positive and negative"):
        validate_class_sizes(rows, name="holdout dataset", minimum=2)
