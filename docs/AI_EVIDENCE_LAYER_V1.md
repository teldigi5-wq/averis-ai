# AI Evidence Layer v1

Averis AI Evidence Layer v1 adds **assistive semantic evidence and writing-style review** without turning the platform into an automatic misconduct or AI-authorship detector.

## Purpose

The layer has two jobs:

1. strengthen plagiarism/similarity review with an optional open-source semantic model;
2. give students a revision/originality coach that surfaces measurable writing signals and concrete manual revision actions.

It is intentionally **not** a detector-evasion or one-click rewriting system.

## Evidence metrics

The revision endpoint reports independent, explainable metrics instead of one opaque score:

- exact word-shingle Jaccard overlap;
- fuzzy sentence/passage strength;
- MinHash candidate score;
- lexical feature-vector candidate score;
- optional whole-text semantic cosine similarity from a local Ollama embedding model;
- optional sentence-level semantic paraphrase candidates using the same local embedding model;
- lexical diversity;
- sentence-length coefficient of variation;
- repeated-trigram ratio;
- paragraph-length coefficient of variation.

Source-overlap metrics are evidence about text relationship. Writing-style metrics are only review signals. They must not be interpreted as proof that a human or AI wrote the text.

## Open-source AI provider

The first provider is local Ollama. `OLLAMA_EMBEDDING_MODEL` defaults to `nomic-embed-text`, while the existing `OLLAMA_MODEL` remains available for a short, grounded coaching explanation.

`AI_REVISION_ENABLED=false` by default. When disabled or when Ollama is unavailable, the endpoint still returns deterministic metrics and rule-based revision actions. This keeps the certified exact/fuzzy path available and avoids making the product dependent on an AI runtime.

Sentence-level semantic reranking is intentionally bounded to a small number of eligible sentences so it can fail open on low-resource infrastructure. The deterministic exact/fuzzy evidence path still analyzes the complete supplied text.

## Detector-quality gate

Averis does not convert the writing-uniformity signal into an "AI probability." Before any future authorship detector can be described as a detector, it must be measured on a labeled, held-out benchmark containing both human and generated samples.

The repository includes a provider-agnostic benchmark harness that reports:

- ROC AUC;
- equal error rate (EER);
- true-positive rate at 1% false-positive rate;
- true-positive rate at 5% false-positive rate;
- true-positive rate at 10% false-positive rate;
- positive/negative sample counts.

A detector model must publish its benchmark source, model/version, thresholds, sample composition, language/domain limitations, and false-positive performance before it can influence product decisions. Per-document output must still be presented as uncertain evidence rather than proof of authorship.

## Safety and academic-integrity boundary

The coach may recommend:

- quoting and citing copied wording;
- rewriting from the student's own understanding;
- adding original analysis or evidence;
- reducing repetitive scaffolding;
- varying sentence structure when that improves readability;
- verifying references and claims.

It must not promise to beat plagiarism or AI detectors, hide AI use, fabricate citations, or produce a false authorship claim.

## Production rollout

This branch is feature-flagged. The zero-cost Azure F1 backend can keep `AI_REVISION_ENABLED=false` until a separately certified free inference runtime is available. Enabling AI must not remove the deterministic fallback, increase scan-credit charges, or change the existing primary similarity score without a separately reviewed scoring migration.
