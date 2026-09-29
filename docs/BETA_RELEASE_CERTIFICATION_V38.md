# Averis v38 Beta Release Certification

This document defines the final beta release boundary for the zero-cost student deployment.

## Canonical beta architecture

- **Web:** GitHub Pages static export (`https://teldigi5-wq.github.io/averis-ai/`)
- **API:** Azure App Service (`https://averis-api-beta-db36dd7d.azurewebsites.net`)
- **Authentication/data:** Supabase free tier
- **Optional Cloud AI:** server-side OpenAI-compatible provider configured on Azure; currently intended for a free-tier account only
- **Private Browser AI:** browser/device runtime when supported
- **Local Ollama:** local runtime when the student chooses it

No release step in v38 enables a paid inference fallback.

## What the v38 workflow certifies

`Beta Release Certification` runs against one exact commit and proves:

1. tracked-secret hygiene passes;
2. the release certificate invariants pass;
3. release-critical API/security tests pass;
4. the API container starts with beta-safe explicit CORS;
5. `/health` and `/readiness` satisfy their code-level contracts;
6. SaaS mode fails closed when Supabase configuration is absent;
7. the GitHub Pages build uses the canonical Azure API;
8. all beta-critical static routes exist;
9. the exported browser bundle contains no high-confidence privileged secret material;
10. the existing full browser-quality suite, Student Dashboard v36 suite, and Onboarding v37 suite pass on desktop and 390px mobile;
11. release evidence is uploaded for the exact commit SHA.

The resulting certificate intentionally records:

```text
release_stage = code-certified
live_deployment_verified = false
```

until the candidate is explicitly merged/deployed and the live URLs are checked.

## Azure App Service settings required before live beta verification

The API host should use explicit environment settings similar to the following. Secret values belong only in Azure App Service configuration and must never be committed or exposed through `NEXT_PUBLIC_*` variables.

```env
APP_ENV=beta
WEB_ORIGIN=https://teldigi5-wq.github.io
SAAS_MODE=true

SUPABASE_URL=<Supabase project URL>
SUPABASE_PUBLISHABLE_KEY=<Supabase publishable key>

AI_REVISION_ENABLED=true
AI_CLOUD_ENABLED=true
AI_API_BASE_URL=https://api.groq.com/openai/v1
AI_API_MODEL=openai/gpt-oss-20b
AI_API_KEY=<server-side provider secret>
AI_CLOUD_TIMEOUT_SECONDS=30

CROSSREF_BASE_URL=https://api.crossref.org
CROSSREF_TIMEOUT_SECONDS=8
```

`AI_CLOUD_ENABLED` may remain `false` if Cloud AI is intentionally disabled. Averis must remain usable for evidence/review workflows without Cloud AI.

### CORS boundary

For beta/production, `WEB_ORIGIN` is explicit-only:

- wildcard `*` is rejected;
- non-HTTPS public origins are rejected;
- no legacy Vercel origin is added automatically.

If another real frontend origin is temporarily required, add it explicitly as a comma-separated HTTPS value and remove it when it is no longer needed.

## Secret checklist

Before a live beta release:

- confirm `AI_API_KEY` is present only in Azure App Service configuration;
- confirm no provider key exists in GitHub source, GitHub Pages output, browser DevTools variables, or `NEXT_PUBLIC_*` values;
- confirm any provider key that was ever pasted into a public/shared location has been revoked and replaced;
- never place a Supabase `service_role`/secret key in the web application;
- public Supabase publishable/anon keys are allowed in the browser by design, with authorization enforced by Supabase policies and API auth checks.

## Zero-cost guardrails

Averis v38 is designed around free/student allocations, but third-party quotas and terms can change. Before release:

- keep GitHub Pages on the free repository Pages path;
- keep Azure inside the available student/free allocation and do not upgrade to a paid App Service plan for this beta;
- keep Supabase inside the free project quota;
- keep the configured Cloud AI account on its free tier;
- do not configure automatic paid provider/model fallback;
- if a free-tier AI quota is exhausted, surface the rate-limit state instead of purchasing capacity automatically.

## Post-deploy live verification

Only after an explicitly approved merge/deploy, verify the exact deployed commit.

### API

Open/call:

```text
https://averis-api-beta-db36dd7d.azurewebsites.net/health
https://averis-api-beta-db36dd7d.azurewebsites.net/readiness
```

Expected readiness characteristics for the public beta:

```json
{
  "status": "ready",
  "service": "averis-api",
  "saas_mode": true,
  "supabase_configured": true,
  "original_upload_retained": false
}
```

Do not declare the live beta healthy if `/readiness` returns 503 or reports missing Supabase configuration.

### Web

Verify the deployed GitHub Pages site and these routes:

- `/averis-ai/`
- `/averis-ai/dashboard/`
- `/averis-ai/multi-source/`
- `/averis-ai/revision/`
- `/averis-ai/refine/`
- `/averis-ai/studio/`
- `/averis-ai/private-ai/`
- `/averis-ai/privacy/`

Then perform one authenticated student flow:

1. sign in;
2. complete/reopen the v37 Product Guide;
3. create or open a local Assignment Workspace;
4. open the Student Dashboard;
5. run the Studio evidence gate;
6. generate a bounded revision proposal with an intentionally selected runtime;
7. Accept/Keep sentence decisions manually;
8. run the final evidence re-check;
9. open Submission Readiness;
10. sign out and confirm protected dashboard content is not immediately exposed.

If Cloud AI is enabled, run one small test and confirm a provider outage/rate limit produces a safe error with **no paid or local automatic fallback**.

## Local-workspace privacy note

Assignment Workspace data is browser-local. A user on the same browser profile may be able to access it. Students using shared/public machines should export what they need and delete local workspaces before leaving.

## Release decision boundary

v38 does **not** merge `main` and does **not** deploy production automatically.

A release is ready for an explicit merge/deploy decision only when:

- normal CI is green;
- Web Product Quality is green;
- Beta Release Certification is green on the same exact head SHA;
- the PR is mergeable;
- no unresolved security/privacy regression is present.

After merge/deploy, perform the live checks above before calling the public beta fully released.
