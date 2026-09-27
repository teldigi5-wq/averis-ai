from __future__ import annotations

from dataclasses import asdict, dataclass
import hashlib
import math
from pathlib import Path
import re
from typing import Any, Iterable
from urllib.parse import urlparse

from app.services.detector_benchmark import benchmark_detector
from app.services.evidence_calibration import ThresholdMetrics, metrics_at_threshold


ACADEMIC_MANIFEST_SCHEMA = "averis.academic-eval/v1"


@dataclass(frozen=True)
class AcademicDatasetManifest:
    schema_version: str
    dataset_id: str
    dataset_name: str
    revision: str
    task: str
    language: str
    domains: tuple[str, ...]
    source_url: str
    license_name: str
    license_url: str
    license_verified_by_human: bool
    calibration_sha256: str
    holdout_sha256: str
    notes: str = ""

    def as_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        payload["domains"] = list(self.domains)
        return payload


@dataclass(frozen=True)
class PromotionAssessment:
    technical_candidate_gate: bool
    production_promotion_allowed: bool
    reasons: tuple[str, ...]

    def as_dict(self) -> dict[str, Any]:
        return {
            "technical_candidate_gate": self.technical_candidate_gate,
            "production_promotion_allowed": self.production_promotion_allowed,
            "reasons": list(self.reasons),
        }


def _required_string(payload: dict[str, Any], key: str) -> str:
    value = payload.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"manifest field {key!r} must be a non-empty string")
    return value.strip()


def _validate_url(value: str, *, field: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError(f"manifest field {field!r} must be an http(s) URL")
    return value


def _validate_sha256(value: str, *, field: str) -> str:
    normalized = value.lower().strip()
    if not re.fullmatch(r"[0-9a-f]{64}", normalized):
        raise ValueError(f"manifest field {field!r} must be a 64-character SHA-256 hex digest")
    return normalized


def parse_manifest(payload: dict[str, Any]) -> AcademicDatasetManifest:
    if not isinstance(payload, dict):
        raise ValueError("academic evaluation manifest must be a JSON object")

    schema_version = _required_string(payload, "schema_version")
    if schema_version != ACADEMIC_MANIFEST_SCHEMA:
        raise ValueError(
            f"unsupported academic evaluation manifest schema {schema_version!r}; "
            f"expected {ACADEMIC_MANIFEST_SCHEMA!r}"
        )

    domains_raw = payload.get("domains")
    if not isinstance(domains_raw, list) or not domains_raw:
        raise ValueError("manifest field 'domains' must be a non-empty array")
    domains: list[str] = []
    for item in domains_raw:
        if not isinstance(item, str) or not item.strip():
            raise ValueError("manifest domains must contain only non-empty strings")
        domains.append(item.strip())

    license_verified = payload.get("license_verified_by_human")
    if license_verified is not True:
        raise ValueError(
            "manifest must set license_verified_by_human=true after a human has verified the dataset/source license"
        )

    return AcademicDatasetManifest(
        schema_version=schema_version,
        dataset_id=_required_string(payload, "dataset_id"),
        dataset_name=_required_string(payload, "dataset_name"),
        revision=_required_string(payload, "revision"),
        task=_required_string(payload, "task"),
        language=_required_string(payload, "language"),
        domains=tuple(domains),
        source_url=_validate_url(_required_string(payload, "source_url"), field="source_url"),
        license_name=_required_string(payload, "license_name"),
        license_url=_validate_url(_required_string(payload, "license_url"), field="license_url"),
        license_verified_by_human=license_verified,
        calibration_sha256=_validate_sha256(
            _required_string(payload, "calibration_sha256"), field="calibration_sha256"
        ),
        holdout_sha256=_validate_sha256(_required_string(payload, "holdout_sha256"), field="holdout_sha256"),
        notes=str(payload.get("notes", "")).strip(),
    )


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify_manifest_hashes(
    manifest: AcademicDatasetManifest,
    calibration_path: Path,
    holdout_path: Path,
) -> dict[str, str]:
    observed_calibration = file_sha256(calibration_path)
    observed_holdout = file_sha256(holdout_path)
    if observed_calibration != manifest.calibration_sha256:
        raise ValueError(
            "calibration dataset SHA-256 does not match the provenance manifest; "
            f"expected {manifest.calibration_sha256}, observed {observed_calibration}"
        )
    if observed_holdout != manifest.holdout_sha256:
        raise ValueError(
            "holdout dataset SHA-256 does not match the provenance manifest; "
            f"expected {manifest.holdout_sha256}, observed {observed_holdout}"
        )
    return {
        "calibration_sha256": observed_calibration,
        "holdout_sha256": observed_holdout,
    }


def _normalized_text(value: object) -> str:
    return re.sub(r"\s+", " ", str(value).casefold()).strip()


def pair_identity(row: dict[str, Any]) -> str:
    pair = sorted((_normalized_text(row["left"]), _normalized_text(row["right"])))
    return hashlib.sha256("\x1f".join(pair).encode("utf-8")).hexdigest()


def text_identities(row: dict[str, Any]) -> set[str]:
    return {
        hashlib.sha256(_normalized_text(row[field]).encode("utf-8")).hexdigest()
        for field in ("left", "right")
    }


def validate_academic_rows(rows: list[dict[str, Any]], *, split: str) -> None:
    if not rows:
        raise ValueError(f"{split} dataset is empty")
    row_ids: set[str] = set()
    for index, row in enumerate(rows, start=1):
        row_id = row.get("id")
        if not isinstance(row_id, str) or not row_id.strip():
            raise ValueError(f"{split} row {index} must contain a non-empty string id")
        if row_id in row_ids:
            raise ValueError(f"{split} dataset contains duplicate row id {row_id!r}")
        row_ids.add(row_id)

        if row.get("label") not in {0, 1}:
            raise ValueError(f"{split} row {row_id!r} label must be 0 or 1")
        for field in ("left", "right"):
            value = row.get(field)
            if not isinstance(value, str) or not value.strip():
                raise ValueError(f"{split} row {row_id!r} field {field!r} must be non-empty text")

        metadata = row.get("metadata", {})
        if not isinstance(metadata, dict):
            raise ValueError(f"{split} row {row_id!r} metadata must be an object when supplied")


def ensure_academic_splits_are_disjoint(
    calibration_rows: list[dict[str, Any]],
    holdout_rows: list[dict[str, Any]],
) -> None:
    validate_academic_rows(calibration_rows, split="calibration")
    validate_academic_rows(holdout_rows, split="holdout")

    calibration_ids = {str(row["id"]) for row in calibration_rows}
    holdout_ids = {str(row["id"]) for row in holdout_rows}
    repeated_ids = calibration_ids & holdout_ids
    if repeated_ids:
        raise ValueError(
            f"calibration and holdout share {len(repeated_ids)} row id(s); final evaluation must be identity-disjoint"
        )

    calibration_pairs = {pair_identity(row) for row in calibration_rows}
    holdout_pairs = {pair_identity(row) for row in holdout_rows}
    repeated_pairs = calibration_pairs & holdout_pairs
    if repeated_pairs:
        raise ValueError(
            f"calibration and holdout share {len(repeated_pairs)} normalized or reversed text pair(s)"
        )

    calibration_texts: set[str] = set()
    holdout_texts: set[str] = set()
    for row in calibration_rows:
        calibration_texts.update(text_identities(row))
    for row in holdout_rows:
        holdout_texts.update(text_identities(row))
    repeated_texts = calibration_texts & holdout_texts
    if repeated_texts:
        raise ValueError(
            f"calibration and holdout reuse {len(repeated_texts)} normalized passage(s); "
            "academic final evaluation requires passage-level separation"
        )


def _safe_group_value(value: object) -> str:
    if value is None:
        return "unknown"
    if isinstance(value, (str, int, float, bool)):
        return str(value).strip() or "unknown"
    return "other"


def subgroup_metrics(
    rows: list[dict[str, Any]],
    scores: list[float],
    *,
    threshold: float,
    fields: Iterable[str],
    min_class_size: int = 10,
) -> dict[str, dict[str, dict[str, Any]]]:
    if len(rows) != len(scores):
        raise ValueError("rows and scores must be the same length")
    if min_class_size < 1:
        raise ValueError("subgroup min_class_size must be at least 1")

    output: dict[str, dict[str, dict[str, Any]]] = {}
    for field in fields:
        groups: dict[str, list[int]] = {}
        for index, row in enumerate(rows):
            metadata = row.get("metadata") if isinstance(row.get("metadata"), dict) else {}
            groups.setdefault(_safe_group_value(metadata.get(field)), []).append(index)

        field_output: dict[str, dict[str, Any]] = {}
        for value, indexes in sorted(groups.items()):
            labels = [int(rows[index]["label"]) for index in indexes]
            group_scores = [scores[index] for index in indexes]
            positives = sum(labels)
            negatives = len(labels) - positives
            summary: dict[str, Any] = {
                "samples": len(indexes),
                "positive_samples": positives,
                "negative_samples": negatives,
                "reportable": positives >= min_class_size and negatives >= min_class_size,
            }
            if summary["reportable"]:
                detector = benchmark_detector(labels, group_scores)
                threshold_metrics = metrics_at_threshold(labels, group_scores, threshold)
                summary.update(
                    {
                        "roc_auc": detector.roc_auc,
                        "equal_error_rate": detector.equal_error_rate,
                        "threshold_metrics": threshold_metrics.as_dict(),
                    }
                )
            else:
                summary["reason"] = (
                    f"requires at least {min_class_size} positive and {min_class_size} negative samples in this subgroup"
                )
            field_output[value] = summary
        output[field] = field_output
    return output


def false_positive_review_records(
    rows: list[dict[str, Any]],
    scores: list[float],
    *,
    threshold: float,
    limit: int = 25,
) -> list[dict[str, Any]]:
    if len(rows) != len(scores):
        raise ValueError("rows and scores must be the same length")
    if limit < 1:
        raise ValueError("false-positive review limit must be at least 1")

    records: list[dict[str, Any]] = []
    for row, score in sorted(zip(rows, scores, strict=True), key=lambda item: item[1], reverse=True):
        if int(row["label"]) != 0 or score < threshold:
            continue
        metadata = row.get("metadata") if isinstance(row.get("metadata"), dict) else {}
        records.append(
            {
                "id": str(row["id"]),
                "score": round(float(score), 6),
                "pair_sha256": pair_identity(row),
                "metadata": metadata,
            }
        )
        if len(records) >= limit:
            break
    return records


def assess_technical_candidate(
    overall: ThresholdMetrics,
    subgroup_report: dict[str, dict[str, dict[str, Any]]],
    *,
    max_false_positive_rate: float,
    minimum_recall: float,
) -> PromotionAssessment:
    if not 0 <= max_false_positive_rate <= 1:
        raise ValueError("max_false_positive_rate must be between 0 and 1")
    if not 0 <= minimum_recall <= 1:
        raise ValueError("minimum_recall must be between 0 and 1")

    reasons: list[str] = []
    if overall.false_positive_rate > max_false_positive_rate:
        reasons.append(
            f"overall holdout FPR {overall.false_positive_rate:.4f} exceeds budget {max_false_positive_rate:.4f}"
        )
    if overall.recall < minimum_recall:
        reasons.append(f"overall holdout recall {overall.recall:.4f} is below minimum {minimum_recall:.4f}")

    for field, groups in subgroup_report.items():
        for value, summary in groups.items():
            if not summary.get("reportable"):
                continue
            threshold_metrics = summary.get("threshold_metrics", {})
            subgroup_fpr = float(threshold_metrics.get("false_positive_rate", math.inf))
            if subgroup_fpr > max_false_positive_rate:
                reasons.append(
                    f"subgroup {field}={value} FPR {subgroup_fpr:.4f} exceeds budget {max_false_positive_rate:.4f}"
                )

    technical_gate = not reasons
    if technical_gate:
        reasons.append(
            "quantitative candidate gates passed on this evaluation set; independent human product/policy review is still required"
        )

    return PromotionAssessment(
        technical_candidate_gate=technical_gate,
        production_promotion_allowed=False,
        reasons=tuple(reasons),
    )
