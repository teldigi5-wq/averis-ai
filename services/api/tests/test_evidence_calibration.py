import pytest

from app.services.evidence_calibration import calibrate_threshold, metrics_at_threshold


def test_metrics_at_threshold_reports_confusion_rates() -> None:
    labels = [1, 1, 0, 0]
    scores = [0.95, 0.80, 0.70, 0.10]

    metrics = metrics_at_threshold(labels, scores, 0.75)

    assert metrics.true_positives == 2
    assert metrics.false_positives == 0
    assert metrics.true_negatives == 2
    assert metrics.false_negatives == 0
    assert metrics.precision == 1.0
    assert metrics.recall == 1.0
    assert metrics.false_positive_rate == 0.0
    assert metrics.specificity == 1.0
    assert metrics.f1 == 1.0


def test_calibration_honors_false_positive_budget_before_recall() -> None:
    labels = [1, 1, 1, 0, 0, 0]
    scores = [0.95, 0.85, 0.72, 0.76, 0.40, 0.10]

    strict = calibrate_threshold(labels, scores, max_false_positive_rate=0.0)
    relaxed = calibrate_threshold(labels, scores, max_false_positive_rate=0.34)

    assert strict.threshold == 0.85
    assert strict.false_positive_rate == 0.0
    assert strict.recall == pytest.approx(2 / 3, abs=1e-6)

    assert relaxed.threshold == 0.72
    assert relaxed.false_positive_rate == pytest.approx(1 / 3, abs=1e-6)
    assert relaxed.recall == 1.0


def test_calibration_rejects_one_class_data() -> None:
    with pytest.raises(ValueError, match="positive and negative"):
        calibrate_threshold([1, 1], [0.9, 0.8])
