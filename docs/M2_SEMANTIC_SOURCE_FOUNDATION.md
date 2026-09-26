# M2 Semantic + Source Intelligence Foundation

Averis M2 separates **candidate retrieval** from **evidence scoring**. This is intentional: a fast candidate signal can tell the system where to look, but it must not be presented to a student as proof of plagiarism or misconduct.

## What this slice adds

- normalization-stable SHA-256 document identities
- overlapping text chunks with stable chunk IDs
- deterministic 64-permutation MinHash fingerprints
- an `EmbeddingProvider` contract
- a zero-cost deterministic feature-hashing provider used only for CI/candidate plumbing
- Crossref and OpenAlex metadata normalization helpers
- pgvector-ready Supabase tables for source metadata, source fingerprints and future BGE-M3 vectors
- per-scan derived fingerprint storage designed to cascade-delete with scan history
- separate M2 candidate signals in the similarity API response
- Vercel ignored-build commands for the web and API project roots

## Evidence boundary

The current `similarity_percent` remains the M1 evidence score built from:

1. word-shingle Jaccard overlap
2. fuzzy sentence/passage matching

M2 currently returns two additional candidate signals:

- `minhash_candidate_score`
- `vector_candidate_score`

The vector score is produced by `hashing-lexical-v1`. It is **not a semantic language model** and is not included in the primary similarity percentage. It exists so storage/API contracts can be tested without downloading a large model in CI or Vercel.

## Planned BGE-M3 path

A future worker can implement the same `EmbeddingProvider` contract using BGE-M3 and write 1024-dimensional vectors to `source_chunks.embedding`. The worker should run outside the request path and outside Vercel builds. CI should use a deterministic fake/fallback provider and must never download model weights.

Before BGE-M3 changes a student-facing score, Averis should certify:

- fixed evaluation datasets
- paraphrase/false-positive benchmarks
- versioned model and chunking configuration
- reproducible source evidence
- threshold calibration
- rollback support

## Storage/privacy model

`source_catalog` stores metadata such as DOI, title, authors and provider IDs.

`source_chunks` stores derived chunk hashes, MinHash signatures and future vectors. The schema has an explicit `original_text_retained = false` constraint.

`submission_fingerprints` stores derived per-scan fingerprints only. It references `scans` with `ON DELETE CASCADE`, so deleting scan history removes the associated derived fingerprint record.

Original student uploads remain in-memory only in the current beta flow.

## Vercel build-rate protection

Each Vercel project now uses an `ignoreCommand` scoped to its project root. A commit that changes only `services/api` can be ignored by `apps/web`, and a frontend-only commit can be ignored by `services/api`.

This reduces unnecessary Hobby-plan builds while preserving normal builds when files inside the project root change.
