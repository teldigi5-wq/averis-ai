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

## M1.5 — Zero-cost student SaaS foundation (current)
- [x] Supabase Auth-ready web client
- [x] student sign-up/sign-in UI
- [x] RLS-protected profile and scan-history schema
- [x] 5-credit free-beta account bootstrap
- [x] server-side Supabase session verification
- [x] atomic server-side scan-credit consumption
- [x] private student scan history
- [x] student history deletion
- [x] no original-document persistence in beta flow
- [ ] provision live Supabase Free project
- [ ] apply production migration and configure environment
- [ ] deploy public zero-cost beta
- [ ] add account/request rate limiting

## M2 — Corpus + semantic similarity
- [ ] PostgreSQL schema for document/source corpus
- [ ] pgvector extension bootstrap
- [ ] BGE-M3 embedding worker
- [ ] chunk-level vector index
- [ ] MinHash/LSH candidate retrieval
- [ ] semantic reranking
- [ ] stored source versioning

## M3 — Evidence report
- [ ] side-by-side highlighted document viewer
- [ ] per-source contribution calculation
- [ ] quote exclusion
- [ ] bibliography exclusion
- [ ] configurable small-match threshold
- [ ] downloadable PDF integrity report

## M4 — Scholarly verification
- [ ] Crossref DOI lookup
- [ ] OpenAlex work/source lookup
- [ ] reference parser
- [ ] citation-to-source consistency analysis
- [ ] nonexistent/mismatched reference warnings

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
- [ ] distributed rate limiting
- [ ] malware-safe upload pipeline
- [ ] object-storage lifecycle policy
- [ ] encryption and secrets management
- [ ] privacy controls and export/delete account workflow
- [ ] observability
- [ ] paid deployment profiles after revenue
