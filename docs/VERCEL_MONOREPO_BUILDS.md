# Vercel monorepo build filtering

Averis deploys two Vercel projects from one repository:

- `apps/web` → `averis-web`
- `services/api` → `averis-api`

Each project uses the shared `scripts/vercel/ignored_build.sh` helper from its `vercel.json`.

## Exit-code contract

Vercel's Ignored Build Step contract is:

- exit `0` → ignore/skip the deployment
- exit `1` → continue with a real build

`VERCEL_GIT_PREVIOUS_SHA` identifies the last successful deployment SHA. That SHA can become stale relative to the current checkout when a project has not deployed successfully for many commits.

The helper therefore follows a fail-open-to-build policy:

1. no previous SHA → build
2. previous SHA not available in the checkout → build
3. current SHA unavailable → compare using checked-out `HEAD`
4. no project-scoped changes → skip
5. project-scoped changes → build
6. any unexpected `git diff` error → build rather than fail the Vercel deployment

This prevents an unavailable historical SHA from turning an optimization into a production deployment outage.

## CI proof

`scripts/vercel/test_ignored_build.sh` creates a temporary Git repository and proves:

- docs-only changes skip both project builds
- a web change requests a web build
- a missing previous SHA requests a build instead of returning a fatal git error

The test runs in the repository CI security/configuration gate.
