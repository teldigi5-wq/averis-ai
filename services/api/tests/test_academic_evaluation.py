import hashlib
from pathlib import Path

import pytest

from app.services.academic_evaluation import (
    ACADEMIC_MANIFEST_SCHEMA,
    assess_technical_candidate,
    ensure_academic_splits_are_disjoint,
    false_positive_review_records,
    parse_manifest,
    subgroup_metrics,
    verify_manifest_hashes,
)
from app.services.evidence_calibration import metrics_at_threshold


def _sha(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _manifest(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "schema_version": ACADEMIC_MANIFEST_SCHEMA,
        "dataset_id": "example-academic-corpus",
        "dataset_name": "Example Academic Corpus",
        "revision": "v1",
        "task": "source-passage semantic reuse evidence",
        "language": "en",
        "domains": ["academic", "scientific-writing"],
        "source_url": "https://example.org/dataset",
        "license_name": "CC BY 4.0",
        "license_url": "https://creativecommons.org/licenses/by/4.0/",
        "license_verified_by_human": True,
        "calibration_sha256": "a" * 64,
        "holdout_sha256": "b" * 64,
    }
    payload.update(overrides)
    return payload


def _row(row_id: str, label: int, left: str, right: str, **metadata: str) -> dict[str, object]:
    return {
        "id": row_id,
        "label": label,
        "left": left,
        "right": right,
        "metadata": metadata,
    }


def test_manifest_requires_explicit_human_license_verification() -> None:
    with pytest.raises(ValueError, match="license_verified_by_human=true"):
        parse_manifest(_manifest(license_verified_by_human=False))


def test_manifest_hashes_are_bound_to_exact_files(tmp_path: Path) -> None:
    calibration = tmp_path / "calibration.jsonl"
    holdout = tmp_path / "holdout.jsonl"
    calibration.write_bytes(b"calibration\n")
    holdout.write_bytes(b"holdout\n")
    manifest = parse_manifest(
        _manifest(
            calibration_sha256=_sha(calibration.read_bytes()),
            holdout_sha256=_sha(holdout.read_bytes()),
        )
    )

    observed = verify_manifest_hashes(manifest, calibration, holdout)
    assert observed["calibration_sha256"] == _sha(b"calibration\n")

    calibration.write_bytes(b"changed\n")
    with pytest.raises(ValueError, match="does not match"):
        verify_manifest_hashes(manifest, calibration, holdout)


def test_academic_splits_reject_passage_level_leakage() -> None:
    calibration = [_row("cal-1", 1, "Shared academic passage", "Calibration paraphrase")]
    holdout = [_row("hold-1", 0, "Unrelated text", "Shared academic passage")]

    with pytest.raises(ValueError, match="reuse 1 normalized passage"):
        ensure_academic_splits_are_disjoint(calibration, holdout)


def test_academic_splits_reject_reversed_pair_leakage() -> None:
    calibration = [_row("cal-1", 1, "Source A", "Rewrite B")]
    holdout = [_row("hold-1", 1, "Rewrite B", "Source A")]

    with pytest.raises(ValueError, match="normalized or reversed text pair"):
        ensure_academic_splits_are_disjoint(calibration, holdout)


def test_subgroup_metrics_report_only_sufficient_groups() -> None:
    rows = [
        _row("1", 0, "a1", "b1", rewrite_type="manual"),
        _row("2", 1, "a2", "b2", rewrite_type="manual"),
        _row("3", 0, "a3", "b3", rewrite_type="manual"),
        _row("4", 1, "a4", "b4", rewrite_type="manual"),
        _row("5", 1, "a5", "b5", rewrite_type="rare"),
    ]
    scores = [10.0, 90.0, 20.0, 80.0, 70.0]

    report = subgroup_metrics(rows, scores, threshold=75.0, fields=("rewrite_type",), min_class_size=1)

    assert report["rewrite_type"]["manual"]["reportable"] is True
    assert report["rewrite_type"]["manual"]["threshold_metrics"]["false_positive_rate"] == 0.0
    assert report["rewrite_type"]["rare"]["reportable"] is False


def test_false_positive_review_artifact_excludes_raw_passages() -> None:
    rows = [
        _row("negative-high", 0, "private left passage", "private right passage", discipline="computing"),
        _row("positive", 1, "p1", "p2", discipline="computing"),
    ]
    records = false_positive_review_records(rows, [88.0, 93.0], threshold=80.0)

    assert records[0]["id"] == "negative-high"
    assert "left" not in records[0]
    assert "right" not in records[0]
    assert records[0]["metadata"]["discipline"] == "computing"
    assert len(records[0]["pair_sha256"]) == 64


def test_candidate_gate_never_grants_production_promotion() -> None:
    labels = [0, 0, 1, 1]
    scores = [0.1, 0.2, 0.8, 0.9]
    overall = metrics_at_threshold(labels, scores, 0.7)

    assessment = assess_technical_candidate(
        overall,
        {},
        max_false_positive_rate=0.05,
        minimum_recall=0.50,
    )

    assert assessment.technical_candidate_gate is True
    assert assessment.production_promotion_allowed is False
    assert "human product/policy review" in assessment.reasons[0]


def test_candidate_gate_fails_when_subgroup_fpr_is_too_high() -> None:
    labels = [0, 0, 1, 1]
    scores = [0.1, 0.2, 0.8, 0.9]
    overall = metrics_at_threshold(labels, scores, 0.7)
    subgroup_report = {
        "discipline": {
            "law": {
                "reportable": True,
                "threshold_metrics": {"false_positive_rate": 0.20},
            }
        }
    }

    assessment = assess_technical_candidate(
        overall,
        subgroup_report,
        max_false_positive_rate=0.05,
        minimum_recall=0.50,
    )

    assert assessment.technical_candidate_gate is False
    assert assessment.production_promotion_allowed is False
    assert any("discipline=law" in reason for reason in assessment.reasons)
