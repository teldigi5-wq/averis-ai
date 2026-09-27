# Secret hygiene

Averis keeps privileged credentials out of source control and does not require a Supabase service-role key in the student browser or current FastAPI beta flow.

## CI gate

`scripts/security/check_tracked_secrets.py` runs in every GitHub CI build and fails on high-confidence privileged material, including:

- private-key blocks
- GitHub classic/fine-grained tokens
- Supabase `sb_secret_...` keys
- non-placeholder `SUPABASE_SERVICE_ROLE_KEY` assignments
- AWS access keys
- Slack tokens
- Stripe live secret keys
- tracked `.env` credential files
- tracked `.vercel/project.json`

The gate intentionally does **not** reject browser-safe public configuration such as Supabase `sb_publishable_...` keys or public API URLs.

## Runtime boundary

Current Averis SaaS requests use the Supabase publishable key plus the authenticated student's JWT. Data access remains constrained by RLS and narrow authenticated RPCs. Privileged database functions live in the private schema and are exposed only through purpose-specific wrappers.

Vercel access tokens, future payment secrets, service-role credentials, signing secrets, and other privileged values must live only in provider secret stores / GitHub Actions Secrets and must never be copied into `NEXT_PUBLIC_*` variables.

## Incident rule

If a real secret is ever committed, deleting it in a later commit is not sufficient. Revoke/rotate the credential first, then remove it from the repository and audit the affected access path.
