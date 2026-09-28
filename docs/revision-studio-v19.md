# Revision Studio v19

Revision Studio adds a human-controlled acceptance layer on top of Averis' existing evidence-first writing refinement flow.

## Workflow

1. The student's draft is sent through the existing `/api/v1/ai/revision/preflight` boundary before any generation request.
2. When the existing optional local Ollama runtime is enabled and the request is eligible, `/api/v1/ai/revision/refine` can return one bounded revision proposal.
3. The browser deterministically aligns the original and proposed text into sentence-level review units.
4. Every changed unit defaults to **Keep original**. The student must explicitly accept a proposed unit.
5. Citation markers, numeric values, percentages, and DOIs are checked before a proposed unit can be accepted. Removing protected tokens creates an acceptance hold.
6. The composed accepted draft is checked again as a whole before copy, local baseline adoption, or evidence re-check.
7. `Re-check accepted draft` sends the composed draft through the same preflight evidence endpoint so the student can inspect the new writing/source evidence before using the text.

## Academic-integrity boundary

Revision Studio is not an AI-detector humanizer and never asks the model to lower a detector or similarity score. A lower source-similarity value after revision is not treated as proof that the revision is academically appropriate. Quotation, citation, reference, factual-support, and institutional requirements still require human review.

Sentence alignment is deterministic review assistance, not semantic truth. A visually paired original/proposed sentence does not prove that meaning or factual claims are equivalent.

Protected-token checks reduce the risk of silently dropping visible citations, numbers, percentages, or DOIs. They do not prove that a citation supports the claim, that a number is factually correct, or that a reference is appropriate.

## Data, cost, and runtime boundary

- No new database table, storage bucket, retention path, or server-side revision history is introduced.
- Sentence decisions and one-step baseline rollback stay in the current browser session.
- The feature consumes no scan credits.
- There is no paid inference fallback. Generation remains optional and local-Ollama-only under the existing backend configuration.
- Existing authentication, RLS, CORS, privacy, scan-credit, similarity-scoring, and evidence-version boundaries are unchanged.

## Certification scope

CI must certify API tests/security/container checks plus the Next.js typecheck/build. Web Product Quality must include `/studio/` on desktop and mobile and continue requiring zero horizontal-overflow failures, zero broken images, zero serious/critical accessibility violations, and a reachable keyboard focus target.

Browser QA certifies rendering and interaction surfaces available in the deterministic build. It does not replace a real signed-in Supabase session test or a real local Ollama smoke test. Those remain separate runtime certification gates.
