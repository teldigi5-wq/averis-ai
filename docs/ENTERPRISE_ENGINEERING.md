# Enterprise engineering baseline

Averis is being built as a production SaaS product, not a demo. This baseline defines the engineering rules for changes that could eventually be reviewed by teams with standards similar to WSO2 and other mature software companies.

## Non-negotiable release rules

1. `main` is the canonical release branch.
2. Every change lands through an isolated branch and pull request.
3. API tests and the web production build must pass on the exact PR head before merge.
4. The merged `main` SHA must pass CI again before production deployment starts.
5. Hosted SaaS mode must fail closed when Supabase configuration is incomplete.
6. Production deployment is serialized; concurrent releases are not allowed.
7. A newly deployed API must pass `/readiness` before the web release proceeds.
8. A newly deployed web application must pass a smoke test before any old production deployment is deleted.
9. Cleanup refuses to run if the newly verified deployment cannot be found in Vercel's deployment inventory.
10. Secrets, service-role keys and deployment tokens must never be committed.

## Deployment retention policy

The project owner requested that obsolete Vercel production deployments be deleted after every successful deployment. Averis therefore uses a strict production-retention policy:

- build new release
- deploy new release
- verify it
- confirm the new deployment exists in Vercel inventory
- delete superseded **production** deployments for that same Vercel project

Preview deployments are deliberately not deleted by this job because an active pull request may still depend on them.

This policy trades Vercel's instant deployment rollback history for lower retained deployment count. Git remains the source of truth, so an earlier certified SHA can still be rebuilt and redeployed if rollback is required.

## Supply-chain baseline

- Core frontend dependencies use explicit versions rather than the `latest` tag.
- Node.js runtime is fixed to major version 22 for the current release line.
- Dependabot monitors npm, pip and GitHub Actions dependencies weekly.
- Dependency upgrades must pass the full CI gates before merge.
- Python dependency ranges remain intentionally constrained by major versions; a fully resolved Python lock strategy is a later supply-chain hardening milestone.

## Security baseline

- Supabase Row Level Security is mandatory on exposed student-data tables.
- Authorization is enforced server-side for scan credits.
- Browser code may use only Supabase publishable keys.
- Supabase secret/service-role credentials are prohibited from the browser bundle.
- Original assignment uploads are not retained by the current beta flow.
- Similarity and AI indicators are evidence for human review and must not be represented as automatic proof of misconduct.

## Required Vercel configuration

The release workflow stays disabled until repository variable `VERCEL_RELEASE_ENABLED=true` is set and these GitHub secrets exist:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_API_PROJECT_ID`
- `VERCEL_WEB_PROJECT_ID`

The API Vercel project must contain the production environment described in `docs/DEPLOY_ZERO_COST_BETA.md`. The web Vercel project must contain its corresponding public Supabase and API variables.

## Production maturity roadmap

Before commercial general availability, add resolved dependency lockfiles, vulnerability/SBOM gates, structured logs and request correlation, rate limiting/abuse controls, error monitoring, backup/restore drills, data-retention controls, incident runbooks, SLOs, accessibility testing and end-to-end browser tests.
