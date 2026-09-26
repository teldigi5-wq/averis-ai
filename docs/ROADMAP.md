# Roadmap

## M1 — Foundation
- [x] Monorepo skeleton
- [x] FastAPI service
- [x] TXT/PDF/DOCX extraction
- [x] Word-shingle Jaccard comparison
- [x] Sentence-level near-match evidence
- [x] Initial responsive web UI
- [x] Ollama provider health adapter
- [x] Tests and CI
- [x] Docker infrastructure definition

## M1.5 — Zero-cost student SaaS foundation
- [x] Supabase Auth-ready web client
- [x] student sign-up/sign-in UI
- [x] RLS-protected profile and scan-history schema
- [x] 5-credit free-beta account bootstrap
- [x] server-side Supabase session verification
- [x] atomic server-side scan-credit consumption
- [x] private student scan history
- [x] student history deletion
- [x] no original-document persistence in beta flow
- [x] provision live Supabase Free project
- [x] apply production migration and configure environment
- [x] deploy public zero-cost beta
- [ ] certify first end-to-end production scan after Vercel Hobby cooldown
- [ ] add account/request rate limiting

## M2 — Corpus + semantic similarity (current)
- [x] PostgreSQL schema for source/fingerprint corpus
- [x] pgvector extension bootstrap
- [x] normalization-stable SHA-256 document identity
- [x] overlapping stable chunk IDs
- [x] deterministic MinHash candidate fingerprints
- [x] embedding-provider abstraction with deterministic CI fallback
- [x] candidate signals separated from the primary evidence score
- [ ] BGE-M3 embedding worker
- [ ] chunk-level vector index after corpus sizing/benchmarks
- [ ] true semantic reranking
- [ ] stored source versioning and ingestion jobs
- [ ] benchmark/calibrate semantic thresholds before student-facing scoring

## M3 — Evidence report
- [ ] side-by-side highlighted document viewer
- [ ] per-source contribution calculation
- [ ] quote exclusion
- [ ] bibliography exclusion
- [ ] configurable small-match threshold
- [ ] downloadable PDF integrity report

## M4 — Scholarly verification
- [x] DOI normalization foundation
- [x] Crossref metadata normalization
- [x] OpenAlex metadata normalization
- [x] live Crossref bibliographic search using the public no-key API
- [x] live Crossref DOI resolution
- [ ] live OpenAlex lookup — intentionally disabled in zero-cost beta while its API is metered
- [x] bibliography/reference parser foundation
- [x] common author-year citation-to-reference consistency audit
- [x] bounded Crossref-backed per-reference verification
- [ ] numeric citation style parsing (IEEE/Vancouver)
- [ ] richer title/author metadata comparison and citation-style diagnostics
- [ ] downloadable reference verification evidence in the integrity report

## M5 — Educator/institution workflows
- [ ] educator and admin roles
- [ ] courses and assignments
- [ ] batch submission analysis
- [ ] student-to-student comparison
- [ ] self-similarity/history
- [ ] collusion graph
- [ ] institutional audit logging and retention controls

## M6 — Advanced intelligence
- [ ] multilingual semantic comparison
- [ ] translation-assisted candidate retrieval
- [ ] authorship consistency indicators
- [ ] section-level style discontinuity
- [ ] local AI report explanation
- [ ] human-review workflow

## M7 — Code integrity
- [ ] Java/Python/C/C++ token normalization
- [ ] AST structural similarity
- [ ] variable/function rename resistance
- [ ] algorithmic structure comparison

## M8 — Production hardening
- [x] Vercel project-root ignored-build protection
- [ ] verify ignored-build behavior after Hobby cooldown
- [ ] distributed rate limiting
- [ ] malware-safe upload pipeline
- [ ] object-storage lifecycle policy
- [ ] encryption and secrets management
- [ ] privacy controls and export/delete account workflow
- [ ] observability
- [ ] paid deployment profiles after revenue
