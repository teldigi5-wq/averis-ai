# Production deployment certification

## Recovery point — 2026-09-27

Canonical recovery SHA:

`96754eba5c328546a56c19f3962fce123f5daac2`

Evidence at this SHA:

- GitHub `security-gate`: successful
- GitHub `api-tests`: successful
- GitHub `web-build`: successful
- Vercel `averis-api`: successful
- Vercel `averis-web`: successful
- the hardened ignored-build fallback no longer causes the web deployment to fail immediately when the last successful deployment SHA is stale/unavailable

The recovery change is tested in CI with a temporary Git repository covering:

1. docs-only change → project deployment may be skipped
2. project-scoped change → project must build
3. missing/stale previous deployment SHA → project must build instead of failing the ignored-build command

## Remaining production proof

Vercel deployment success is infrastructure evidence, not a substitute for the student workflow test. App-level production certification still requires:

- `/health` returns healthy
- `/readiness` returns `status=ready`, `saas_mode=true`, `supabase_configured=true`, `original_upload_retained=false`
- student sign-in works
- account starts with the expected beta credit balance
- TXT/PDF/DOCX extraction works through the production browser/API path
- one real integrity scan consumes exactly one credit
- scan history is private and deletable
- source/reference tools work with their documented evidence boundaries
- account export works

The current ChatGPT/Vercel connector is not authorized to the user's personal Vercel scope, so HTTP endpoint verification must not be claimed solely from deployment status.
