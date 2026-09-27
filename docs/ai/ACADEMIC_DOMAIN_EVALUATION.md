# Averis Academic-Domain Semantic Evaluation

This stage exists to prevent a common failure mode in academic-integrity products: treating a convenient paraphrase benchmark as if it were a production plagiarism threshold.

## Current decision

The v10 compact-model bakeoff is engineering evidence only. On the pinned PAWS-Wiki comparison sample:

| Model | Holdout ROC AUC | Locked-threshold FPR | Locked-threshold recall |
|---|---:|---:|---:|
| `nomic-embed-text` | 0.6786 | 0.10 | 0.31 |
| `all-minilm` | 0.6430 | 0.04 | 0.13 |

Neither model is production-promoted. Nomic has stronger discrimination/recall but misses the 5% false-positive budget; all-MiniLM meets that budget on the PAWS sample but has materially lower recall and AUC. PAWS has also already been used for model selection, so it is no longer an independent final holdout for the selected candidate.

## v11 promotion path

A model may become a *technical candidate* only after all of the following are true:

1. The corpus has an explicit provenance manifest: exact dataset ID/revision, source URL, license name/URL, language, domains, task, and exact SHA-256 values for calibration and holdout files.
2. A human has verified that the intended evaluation use is compatible with the corpus/source license. `license_verified_by_human` must be `true` or the evaluator refuses to run.
3. Calibration and final holdout are separated by row ID, normalized text pair, reversed pair, **and individual normalized passage**. This prevents the same source passage leaking into both stages.
4. Threshold selection happens on calibration labels only. The final holdout threshold is locked.
5. Overall ROC/EER/TPR metrics and locked-threshold precision, recall, FPR, specificity and F1 are preserved.
6. Subgroup evidence is reported where class sizes are large enough. Default slices are `rewrite_type`, `discipline`, `citation_state`, and `passage_length_bucket`.
7. False positives are exported for human error review using row IDs, pair hashes, scores and metadata. Raw passage text is intentionally excluded from the artifact.
8. Passing numeric gates still does **not** set `production_promotion_allowed=true`. Product/policy review remains a separate decision.

## Required JSONL shape

Each calibration/holdout row must contain:

```json
{
  "id": "stable-row-id",
  "label": 1,
  "left": "candidate source passage",
  "right": "submission passage",
  "metadata": {
    "rewrite_type": "manual-paraphrase",
    "discipline": "computing",
    "citation_state": "uncited",
    "passage_length_bucket": "100-199"
  }
}
```

`label=1` means the pair is a known meaning-preserving/source-reuse pair for the exact evaluation task. `label=0` means it is a known negative pair. Labels are evaluation ground truth for the supplied corpus only; they are not misconduct judgments.

## Run locally

First create a manifest using `services/api/evaluation/academic-manifest.example.json`, calculate the exact split hashes, verify the license manually, and set `license_verified_by_human=true`.

Then:

```bash
ollama serve
ollama pull nomic-embed-text

make ai-academic-eval \
  MANIFEST=/absolute/path/manifest.json \
  CALIBRATION_DATASET=/absolute/path/calibration.jsonl \
  HOLDOUT_DATASET=/absolute/path/holdout.jsonl \
  EMBEDDING_MODEL=nomic-embed-text
```

Artifacts are written under `artifacts/academic-evaluation/` by default.

## Corpus research notes

The next corpus must be both task-relevant and legally/provenance suitable. Candidate research sources include:

- **PAN-PC-11** (PAN Plagiarism Corpus 2011, Zenodo DOI `10.5281/zenodo.3250095`). It is specifically designed for plagiarism-detection evaluation and includes inserted/crowdsourced plagiarism cases. Before use, verify the exact Zenodo/file rights and document the result in the manifest.
- **Machine Paraphrase Dataset** (`jpwahle/machine-paraphrase-dataset`). It includes Wikipedia, arXiv and thesis material and is relevant to obfuscated/paraphrased reuse. Its Hugging Face metadata and prose licensing statements have historically been inconsistent (`cc-by-4.0` metadata vs a `CC BY-NC 4.0` prose statement), so Averis must **not** ingest it until the applicable terms are resolved and recorded by a human.
- **PAN 2026 Generated Plagiarism Detection** is not suitable for redistribution into this repository: the task page states that the corpus contains copyrighted material, requires registration, is research-only, and cannot be redistributed. It may be evaluated only if future use complies with those terms and without committing the corpus.

Do not commit third-party corpora to the Averis repository merely because they are downloadable. Prefer local or ephemeral evaluation and preserve hashes, manifests, metrics and review artifacts instead.

## Product boundary

Semantic similarity is one evidence channel. Averis may surface a semantically similar passage and explain why it needs review, but it must not convert a model score into an automatic finding that a student plagiarized or that a passage was AI-authored.
