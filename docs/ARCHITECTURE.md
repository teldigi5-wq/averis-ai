# Architecture

## Design principle

Averis separates deterministic evidence from probabilistic AI assistance.

```text
Document
  -> extraction / OCR
  -> normalization / segmentation
  -> exact fingerprints + shingles
  -> semantic embeddings (Milestone 2)
  -> candidate-source retrieval
  -> evidence verification
  -> report
  -> optional AI explanation
```

An LLM never invents the primary similarity score.

## Student SaaS request boundary

```text
Student browser
   -> Supabase Auth session
   -> Averis API (Bearer token)
       -> verify session with Supabase Auth
       -> deterministic similarity engine
       -> consume_scan_credit RPC
           -> profiles (credit balance)
           -> scans (private history metadata)
```

With `SAAS_MODE=true`, scan accounting is a server-side requirement. The UI is not the trust boundary. Supabase RLS isolates each student's profile and history.

The zero-cost beta does not persist original uploaded documents. The API parses them in memory and the database stores only scan metadata.

## Planned services

1. **Web** — student/lecturer/admin UI.
2. **API** — authentication, document lifecycle, reports and orchestration.
3. **Document worker** — parsing, OCR, language detection and segmentation.
4. **Similarity engine** — deterministic overlap and passage alignment.
5. **Semantic engine** — BGE-M3 embeddings, pgvector candidate retrieval and reranking.
6. **Source service** — institutional corpus, OpenAlex/Crossref and permitted external sources.
7. **Citation engine** — DOI/reference metadata verification.
8. **Authorship engine** — advisory stylometry and discontinuity signals.
9. **Code engine** — token/AST-based programming-assignment similarity.
10. **AI explanation layer** — local Ollama by default; never the evidence authority.

## Trust boundary

Reports must distinguish:

- measured similarity
- retrieved source evidence
- citation/reference metadata evidence
- heuristic/authorship indicators
- AI-generated explanations

No single AI-authorship score should be represented as proof of misconduct.
