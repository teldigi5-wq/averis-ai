from __future__ import annotations

from dataclasses import asdict, dataclass
import math


@dataclass(frozen=True)
class ThresholdMetrics:
    threshold: float
    true_positives: int
    false_positives: int
    true_negatives: int
    false_negatives: int
    precision: float
    recall: float
    false_positive_rate: float
    specificity: float
    f1: float

    def as_dict(self) -> dict[str, float | int]:
        return asdict(self)


@dataclass(frozen=True)
class HeldoutThresholdEvaluation:
    """A threshold selected on calibration data and evaluated unchanged on holdout data."""

    calibration: ThresholdMetrics
    holdout: ThresholdMetrics

    def as_dict(self) -> dict[str, dict[str, float | int]]:
        return {
            "calibration": self.calibration.as_dict(),
            "holdout": self.holdout.as_dict(),
        }


def _validate(labels: list[int], scores: list[float]) -> tuple[int, int]:
    if len(labels) != len(scores) or not labels:
        raise ValueError("labels and scores must be non-empty and the same length")
    if any(label not in {0, 1} for label in labels):
        raise ValueError("labels must contain only 0 and 1")
    if any(not math.isfinite(score) for score in scores):
        raise ValueError("scores must be finite")

    positives = sum(labels)
    negatives = len(labels) - positives
    if positives == 0 or negatives == 0:
        raise ValueError("calibration requires positive and negative examples")
    return positives, negatives


def metrics_at_threshold(labels: list[int], scores: list[float], threshold: float) -> ThresholdMetrics:
    _validate(labels, scores)
    if not math.isfinite(threshold):
        raise ValueError("threshold must be finite")

    tp = fp = tn = fn = 0
    for label, score in zip(labels, scores, strict=True):
        predicted = 1 if score >= threshold else 0
        if predicted == 1 and label == 1:
            tp += 1
        elif predicted == 1 and label == 0:
            fp += 1
        elif predicted == 0 and label == 0:
            tn += 1
        else:
            fn += 1

    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    fpr = fp / (fp + tn) if fp + tn else 0.0
    specificity = tn / (tn + fp) if tn + fp else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0

    return ThresholdMetrics(
        threshold=round(threshold, 6),
        true_positives=tp,
        false_positives=fp,
        true_negatives=tn,
        false_negatives=fn,
        precision=round(precision, 6),
        recall=round(recall, 6),
        false_positive_rate=round(fpr, 6),
        specificity=round(specificity, 6),
        f1=round(f1, 6),
    )


def calibrate_threshold(
    labels: list[int],
    scores: list[float],
    *,
    max_false_positive_rate: float = 0.05,
) -> ThresholdMetrics:
    """Choose the best observed threshold under an explicit FPR budget.

    The calibration target is deliberately conservative for academic-integrity
    evidence: maximize recall only among thresholds that satisfy the requested
    false-positive ceiling, then prefer better precision and the higher threshold.
    This is an evaluation utility, not a production verdict policy.
    """
    _validate(labels, scores)
    if max_false_positive_rate < 0 or max_false_positive_rate > 1:
        raise ValueError("max_false_positive_rate must be between 0 and 1")

    candidates = sorted(set(scores), reverse=True)
    evaluated = [metrics_at_threshold(labels, scores, threshold) for threshold in candidates]
    eligible = [metric for metric in evaluated if metric.false_positive_rate <= max_false_positive_rate]
    if not eligible:
        raise ValueError("no observed threshold satisfies the false-positive-rate budget")

    return max(
        eligible,
        key=lambda metric: (metric.recall, metric.precision, metric.threshold),
    )


def calibrate_and_evaluate_holdout(
    calibration_labels: list[int],
    calibration_scores: list[float],
    holdout_labels: list[int],
    holdout_scores: list[float],
    *,
    max_false_positive_rate: float = 0.05,
) -> HeldoutThresholdEvaluation:
    """Select a threshold only on calibration rows, then lock it for holdout evaluation.

    Keeping threshold selection and final evaluation separate prevents the held-out
    labels from silently tuning the threshold that is later reported as evidence.
    This function intentionally does not loosen the requested FPR budget when the
    independent holdout set performs worse than calibration.
    """
    calibration = calibrate_threshold(
        calibration_labels,
        calibration_scores,
        max_false_positive_rate=max_false_positive_rate,
    )
    _validate(holdout_labels, holdout_scores)
    holdout = metrics_at_threshold(
        holdout_labels,
        holdout_scores,
        calibration.threshold,
    )
    return HeldoutThresholdEvaluation(calibration=calibration, holdout=holdout)
