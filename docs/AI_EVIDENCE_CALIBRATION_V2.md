# AI Evidence Calibration v2

This stage turns Averis semantic similarity from a useful **candidate signal** into a metric that can be promoted only after reproducible calibration.

## Why this exists

Raw embedding cosine scores are model- and dataset-dependent. A score such as `78%` is not automatically a plagiarism probability, authorship probability, or universal threshold. Averis therefore keeps semantic scores out of review-band decisions until a labeled benchmark supplies documented thresholds.

## Runtime certification

Run the local smoke gate after installing/pulling the configured Ollama models:

```bash
make ai-smoke
```

The smoke gate verifies:

- Ollama is reachable;
- the embedding model returns non-empty vectors with stable dimensions;
- identical text produces near-identical vectors;
- a paraphrase scores above an unrelated passage;
- optionally, the local generation model can return a short bounded coaching response.

This is a runtime check, not threshold calibration.

## Labeled semantic benchmark

Create a JSONL file with held-out source/document pairs:

```json
{"label":1,"left":"student passage","right":"source passage"}
{"label":0,"left":"student passage","right":"unrelated source"}
```

`label=1` means the pair is a known semantic/paraphrase relationship for the benchmark task. `label=0` means a known negative pair. Labels must come from a documented corpus or human-reviewed benchmark process; do not manufacture production performance claims from the unit-test fixtures.

Run:

```bash
make ai-benchmark DATASET=/path/to/held-out-pairs.jsonl
```

The default benchmark requires at least 100 positive and 100 negative pairs. It reports:

- ROC AUC;
- Equal Error Rate (EER);
- TPR at 1% FPR;
- TPR at 5% FPR;
- TPR at 10% FPR;
- a threshold selected under a 5% false-positive-rate budget;
- precision, recall, specificity and F1 at that calibrated threshold.

## Promotion rule

Semantic scores may be displayed before calibration, but they remain candidate evidence and cannot change the user-facing review band.

To promote semantic banding, record the benchmark artifact and set all three deployment values:

```text
AI_SEMANTIC_REVIEW_THRESHOLD=<benchmark-derived threshold>
AI_SEMANTIC_HIGH_REVIEW_THRESHOLD=<separately justified stricter threshold>
AI_SEMANTIC_CALIBRATION_ID=<immutable benchmark/model/version identifier>
```

If any value is missing or invalid, Averis fails closed: semantic scores remain visible for review but do not influence the band.

The high-review threshold must be greater than or equal to the review threshold. Both must be between 0 and 100.

## Dataset expectations

A production-quality calibration set should include:

- direct paraphrases;
- heavy paraphrases with changed word order;
- same-topic but independently written negatives;
- unrelated negatives;
- quotations and citation-heavy writing;
- short and long passages;
- technical and non-technical academic prose;
- multiple writing proficiency levels;
- samples that were not used to tune the selected thresholds.

Report performance by subgroup where sample size allows. One aggregate AUC is not enough to justify claims about every subject, language, or student population.

## AI-authorship detection boundary

The existing detector benchmark utilities can measure any future AI-authorship score using ROC AUC, EER and low-FPR operating points. However, no AI-authorship probability is exposed in the product in this stage.

Before such a detector can be surfaced, Averis should require:

1. a labeled held-out human/AI corpus with documented provenance;
2. subgroup false-positive analysis;
3. calibration on a development split and final metrics on a separate test split;
4. explicit UI wording that the result is a statistical signal, not proof of authorship or misconduct;
5. a product decision about whether the measured false-positive rate is acceptable at all.

## Academic-integrity boundary

The Revision AI workspace can recommend citation, attribution, rewriting from understanding, stronger original analysis and removal of repetitive scaffolding. It must not become a one-click detector-evasion rewriter, fabricate sources, or promise to make AI-generated text appear human.
