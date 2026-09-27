# AI Evidence Calibration v2

This stage turns Averis semantic similarity from a useful **candidate signal** into a metric that can be promoted only after reproducible runtime certification and held-out evaluation.

## Why this exists

Raw embedding cosine scores are model- and dataset-dependent. A score such as `78%` is not automatically a plagiarism probability, authorship probability, or universal threshold. Averis therefore keeps semantic scores out of review-band decisions until a labeled benchmark supplies documented, reproducible evidence.

## Runtime certification

Run the local smoke gate after installing/pulling the configured Ollama models:

```bash
make ai-smoke
```

The smoke gate verifies:

- Ollama is reachable;
- the embedding model returns non-empty vectors with one stable dimension;
- every vector value is finite and every vector has a non-zero norm;
- identical text produces at least 99% cosine similarity;
- a paraphrase scores above an unrelated passage;
- optionally, the local generation model can return a short bounded coaching response.

The repository also contains `.github/workflows/ai-runtime-certification.yml`. Its certification job installs Ollama on an ephemeral GitHub runner, pulls `nomic-embed-text`, runs the embedding smoke gate, and uploads the JSON evidence artifact. This verifies a real open-source runtime path without changing the Azure F1 production service or adding a recurring hosting cost.

Runtime smoke evidence is not threshold calibration.

## Separate calibration and holdout datasets

Threshold selection and final evaluation must use **different datasets**. Prepare two JSONL files with source/document pairs:

```json
{"label":1,"left":"student passage","right":"source passage"}
{"label":0,"left":"student passage","right":"unrelated source"}
```

`label=1` means the pair is a known semantic/paraphrase relationship for the benchmark task. `label=0` means a known negative pair. Labels must come from a documented corpus or human-reviewed benchmark process; do not manufacture production performance claims from unit-test fixtures.

Run:

```bash
make ai-benchmark \
  CALIBRATION_DATASET=/path/to/calibration.jsonl \
  HOLDOUT_DATASET=/path/to/holdout.jsonl
```

The benchmark now fails closed when:

- the same file is supplied for calibration and holdout;
- a normalized text pair appears in both datasets, including a reversed left/right duplicate;
- either split lacks the configured minimum positive or negative sample count;
- Ollama or the embedding runtime is unavailable.

The default requires at least **100 positive and 100 negative examples in each split**.

## Metrics reported

Both calibration and holdout splits report:

- ROC AUC;
- Equal Error Rate (EER);
- TPR at 1% FPR;
- TPR at 5% FPR;
- TPR at 10% FPR;
- positive/negative sample counts;
- SHA-256 of the exact dataset file used.

The threshold is selected **only on the calibration split** under the configured false-positive-rate budget. That threshold is then locked and evaluated unchanged on the holdout split. The artifact reports holdout confusion counts, precision, recall, specificity, F1, and observed false-positive rate at that locked threshold.

A holdout FPR exceeding the calibration budget is reported as evidence; Averis does not silently retune the threshold on the holdout labels.

## Promotion rule

Semantic scores may be displayed before calibration, but they remain candidate evidence and cannot change the user-facing review band.

A threshold must **not** be promoted merely because one aggregate metric looks good or because the holdout FPR budget is met. Before promotion, preserve an immutable certification record containing at least:

1. embedding model name/version or digest where available;
2. Ollama/runtime certification artifact;
3. calibration and holdout dataset SHA-256 values;
4. dataset origin, license/permission and labeling method;
5. calibration FPR budget and selected threshold;
6. all held-out metrics at the locked threshold;
7. subgroup/error analysis where sample size supports it;
8. a written product decision explaining the intended review use.

Only after that decision should deployment values be set:

```text
AI_SEMANTIC_REVIEW_THRESHOLD=<benchmark-derived threshold>
AI_SEMANTIC_HIGH_REVIEW_THRESHOLD=<separately justified stricter threshold>
AI_SEMANTIC_CALIBRATION_ID=<immutable benchmark/model/dataset identifier>
```

If any value is missing or invalid, Averis fails closed: semantic scores remain visible for review but do not influence the band. The high-review threshold must be greater than or equal to the review threshold. Both must be between 0 and 100.

## Dataset expectations

A production-quality evaluation should include:

- direct paraphrases;
- heavy paraphrases with changed word order;
- same-topic but independently written negatives;
- unrelated negatives;
- quotations and citation-heavy writing;
- short and long passages;
- technical and non-technical academic prose;
- multiple writing proficiency levels;
- samples that were not used to tune thresholds, prompts, preprocessing or model selection.

Report performance by subgroup where sample size allows. One aggregate AUC is not enough to justify claims about every subject, language, institution or student population.

Public paraphrase datasets can be useful engineering benchmarks, but they must be described as paraphrase/semantic-retrieval benchmarks unless their provenance and task genuinely support stronger academic-integrity claims.

## AI-authorship detection boundary

The detector benchmark utilities can measure any future AI-authorship score using ROC AUC, EER and low-FPR operating points. No AI-authorship probability is exposed in this stage.

Before such a detector can be surfaced, Averis should require:

1. a labeled held-out human/AI corpus with documented provenance;
2. subgroup false-positive analysis;
3. calibration on a development split and final metrics on a separate test split;
4. explicit UI wording that the result is a statistical signal, not proof of authorship or misconduct;
5. a product decision about whether the measured false-positive rate is acceptable at all.

## Academic-integrity boundary

The Revision AI workspace can recommend citation, attribution, rewriting from understanding, stronger original analysis and removal of repetitive scaffolding. It must not become a one-click detector-evasion rewriter, fabricate sources, or promise to make AI-generated text appear human.
