# Roadmap and AI continuation plan — teldigi5-wq/averis-ai

> 9 November 2026 documentation overlay, draft PR [#109](https://github.com/teldigi5-wq/averis-ai/pull/109); not merged, deployed, or independently test-certified. Original product/engineering roadmap prevails where more specific.

## Recovered checkpoint
Status observed from the current `main` README on 2026-11-09: Evidence-first academic similarity platform (Next.js, FastAPI, Supabase/RLS, Python), beta per README; similarity is not authorship or misconduct proof. No new code build, physical-device QA, merge, deployment, security certification or owner acceptance was performed by writing this file. 

## Next distinct milestones from existing handoff
1. **M1:** Inspect current RLS tenant isolation and upload processing
   - Acceptance: live exact-SHA branch/PR, reproducible tests incl. relevant negative/security cases, owner approval if needed; preserve BLOCKED/NO_GO otherwise.
2. **M2:** reproducibly test TXT/PDF/DOCX ingestion, resource limits and similarity evidence
   - Acceptance: live exact-SHA branch/PR, reproducible tests incl. relevant negative/security cases, owner approval if needed; preserve BLOCKED/NO_GO otherwise.
3. **M3:** resolve only verified dependency/CI failures
   - Acceptance: live exact-SHA branch/PR, reproducible tests incl. relevant negative/security cases, owner approval if needed; preserve BLOCKED/NO_GO otherwise.
4. **M4:** perform privacy/accessibility beta review.
   - Acceptance: live exact-SHA branch/PR, reproducible tests incl. relevant negative/security cases, owner approval if needed; preserve BLOCKED/NO_GO otherwise.

## Progression without repeating stages
1. **Recon:** Read actual README, architecture and roadmap, full paginated branches/PRs, issues, CI/CodeQL/security findings; compare newer commits with historic checkpoint. Do not call previous evidence tests for newer source.
2. **Next unique improvement:** Choose only one unmet milestone from above; use small review branch, protect active PR stack, write failing regression/acceptance test before fix where applicable.
3. **Reliability and security:** Test integration, secrets/auth/permission boundaries, offline/edge cases, accessibility, performance and rollback proportionately. Use zero mandatory-cost tooling.
4. **Release gating:** Re-run exact-head CI, verify merge base/ownership, never auto-promote main or production. Require real provider/device/live state proof and authorization separately.

## Safe CLI checkpoint
```bash
gh repo view teldigi5-wq/averis-ai
gh pr list -R teldigi5-wq/averis-ai --state open --limit 100
gh issue list -R teldigi5-wq/averis-ai --state open --limit 100
gh run list -R teldigi5-wq/averis-ai --limit 20
git fetch --all --prune
git log --all --graph --oneline --decorate -30
```
These calls may not cover >100 branches or all closed PRs; use paginated read-only audit script in original offline archive. Do not bulk modify historical branches or force push. Share this roadmap via reviewed docs PR instead.

## Reporting
Use [milestone ledger](AI_MILESTONES_2026-11-09.md); statuses: PLANNED, CODED, LOCALLY_TESTED, CI_VERIFIED_EXACT_SHA, MERGED, DEPLOYED, OPERATOR_ACCEPTED. Don't imply a later level from an earlier one. No paid integrations or account/data changes without approval.
