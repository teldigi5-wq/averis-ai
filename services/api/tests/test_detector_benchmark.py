from app.services.detector_benchmark import benchmark_detector, roc_auc, tpr_at_fpr


def test_perfect_detector_has_perfect_auc_and_low_eer() -> None:
    labels = [0, 0, 0, 1, 1, 1]
    scores = [0.05, 0.10, 0.20, 0.80, 0.90, 0.95]

    result = benchmark_detector(labels, scores)

    assert result.roc_auc == 1.0
    assert result.equal_error_rate == 0.0
    assert result.tpr_at_fpr_1_percent == 1.0
    assert result.positive_samples == 3
    assert result.negative_samples == 3


def test_mixed_detector_metrics_stay_bounded() -> None:
    labels = [0, 1, 0, 1, 0, 1, 0, 1]
    scores = [0.1, 0.9, 0.7, 0.6, 0.4, 0.55, 0.3, 0.2]

    auc = roc_auc(labels, scores)
    tpr = tpr_at_fpr(labels, scores, 0.10)

    assert 0.0 <= auc <= 1.0
    assert 0.0 <= tpr <= 1.0


def test_benchmark_rejects_single_class_data() -> None:
    try:
        benchmark_detector([1, 1], [0.7, 0.8])
    except ValueError as exc:
        assert "both positive and negative" in str(exc)
    else:
        raise AssertionError("single-class benchmark should fail")
