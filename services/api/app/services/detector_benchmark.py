from __future__ import annotations

from dataclasses import dataclass
import math


@dataclass(frozen=True)
class RocPoint:
    threshold: float
    false_positive_rate: float
    true_positive_rate: float


@dataclass(frozen=True)
class DetectorBenchmark:
    roc_auc: float
    equal_error_rate: float
    tpr_at_fpr_1_percent: float
    tpr_at_fpr_5_percent: float
    tpr_at_fpr_10_percent: float
    positive_samples: int
    negative_samples: int


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
        raise ValueError("benchmark requires both positive and negative samples")
    return positives, negatives


def roc_curve(labels: list[int], scores: list[float]) -> list[RocPoint]:
    positives, negatives = _validate(labels, scores)
    pairs = sorted(zip(scores, labels, strict=True), key=lambda item: item[0], reverse=True)

    points = [RocPoint(threshold=math.inf, false_positive_rate=0.0, true_positive_rate=0.0)]
    true_positives = 0
    false_positives = 0
    index = 0

    while index < len(pairs):
        threshold = pairs[index][0]
        while index < len(pairs) and pairs[index][0] == threshold:
            if pairs[index][1] == 1:
                true_positives += 1
            else:
                false_positives += 1
            index += 1

        points.append(
            RocPoint(
                threshold=threshold,
                false_positive_rate=false_positives / negatives,
                true_positive_rate=true_positives / positives,
            )
        )

    return points


def roc_auc(labels: list[int], scores: list[float]) -> float:
    points = roc_curve(labels, scores)
    area = 0.0
    for left, right in zip(points, points[1:], strict=True):
        width = right.false_positive_rate - left.false_positive_rate
        height = (left.true_positive_rate + right.true_positive_rate) / 2.0
        area += width * height
    return round(max(0.0, min(1.0, area)), 6)


def equal_error_rate(labels: list[int], scores: list[float]) -> float:
    points = roc_curve(labels, scores)
    best = min(
        points,
        key=lambda point: abs(point.false_positive_rate - (1.0 - point.true_positive_rate)),
    )
    false_negative_rate = 1.0 - best.true_positive_rate
    return round((best.false_positive_rate + false_negative_rate) / 2.0, 6)


def tpr_at_fpr(labels: list[int], scores: list[float], max_fpr: float) -> float:
    if max_fpr < 0 or max_fpr > 1:
        raise ValueError("max_fpr must be between 0 and 1")
    candidates = [point.true_positive_rate for point in roc_curve(labels, scores) if point.false_positive_rate <= max_fpr]
    return round(max(candidates, default=0.0), 6)


def benchmark_detector(labels: list[int], scores: list[float]) -> DetectorBenchmark:
    positives, negatives = _validate(labels, scores)
    return DetectorBenchmark(
        roc_auc=roc_auc(labels, scores),
        equal_error_rate=equal_error_rate(labels, scores),
        tpr_at_fpr_1_percent=tpr_at_fpr(labels, scores, 0.01),
        tpr_at_fpr_5_percent=tpr_at_fpr(labels, scores, 0.05),
        tpr_at_fpr_10_percent=tpr_at_fpr(labels, scores, 0.10),
        positive_samples=positives,
        negative_samples=negatives,
    )
