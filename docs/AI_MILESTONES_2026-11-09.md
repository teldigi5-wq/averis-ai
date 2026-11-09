# Milestones & verification ledger — teldigi5-wq/averis-ai

> Draft PR #109, 9 Nov 2026. This does not re-test or re-open historical completed stages. Verify the *latest exact implementation commit* before marking boxes complete.

## Snapshot
- [x] Dated handoff and documentation-branch README inspected.
- [x] Documentation PR #109 open and draft at inspection.
- [ ] All current branches and stacked implementation PR relationships paginated and reviewed.
- [ ] Current exact-source tests, security scans and owners' release gates checked.
- [ ] Deployed/production/real-world acceptance confirmed (NOT ASSUMED).

## Next milestone verification
- [ ] **M1:** Inspect current RLS tenant isolation and upload processing
  - Existing proof: _reconcile SHA-linked evidence first_
  - New test/evidence: _NOT RUN in docs-only update_
  - Gate decision: _PENDING or NO_GO until demonstrated_
- [ ] **M2:** reproducibly test TXT/PDF/DOCX ingestion, resource limits and similarity evidence
  - Existing proof: _reconcile SHA-linked evidence first_
  - New test/evidence: _NOT RUN in docs-only update_
  - Gate decision: _PENDING or NO_GO until demonstrated_
- [ ] **M3:** resolve only verified dependency/CI failures
  - Existing proof: _reconcile SHA-linked evidence first_
  - New test/evidence: _NOT RUN in docs-only update_
  - Gate decision: _PENDING or NO_GO until demonstrated_
- [ ] **M4:** perform privacy/accessibility beta review.
  - Existing proof: _reconcile SHA-linked evidence first_
  - New test/evidence: _NOT RUN in docs-only update_
  - Gate decision: _PENDING or NO_GO until demonstrated_

## Evidence record template
```text
UTC timestamp, operator:
Repo, base/head branch and exact SHA:
Existing checkpoint/test provenance (exact SHAs):
Milestone goal and explicit acceptance:
Commands and environment used:
Test outcomes incl. adversarial/negative cases and failure:
CI checks/alerts/actions URL and secret redaction:
Merge/deploy/physical or production verification (separate):
Roll back, blockers, next unique milestone:
```

Never repeat a stage solely because it appears unchecked in this new ledger. Do not disable CI or security, misstate live behavior, expose tokens or spend money without explicit consent.
