# Averis zero-cost hosting path

This document describes the current no-recurring-subscription deployment path for the Averis beta while Vercel Hobby builds are rate limited.

## Certified beta architecture

- Web: GitHub Pages static export from `apps/web`
- API: Azure App Service F1 Free from `services/api`
- Auth/data: existing Supabase project

No service-role key belongs in the frontend. The original student upload remains processed in memory by the current beta flow and is not intentionally persisted by this hosting change.

## 1. Azure App Service API

The student subscription has an F1 Free Linux App Service plan in Malaysia West:

- resource group: `averis-beta-rg`
- plan: `averis-beta-f1-plan`
- plan SKU: `F1`
- plan tier: `Free`
- web app: `averis-api-beta-db36dd7d`
- public API: `https://averis-api-beta-db36dd7d.azurewebsites.net`

The currently running API deployment originated from branch `feat/professional-ui-brand-v1` at SHA `7b2c12f502a94aab8f9a41caba30a3534c9d551d`. Later branch commits currently change only deployment/web-certification documentation or workflow wiring; the deployed API source remains the certified API code from that SHA until the next exact-head API redeploy.

Runtime settings:

- `APP_ENV=beta`
- `SAAS_MODE=true`
- `SUPABASE_URL=https://lydepiaatemwpremgekt.supabase.co`
- `SUPABASE_PUBLISHABLE_KEY=<current publishable key>`
- `WEB_ORIGIN=<comma-separated exact trusted web origins>`
- `SCM_DO_BUILD_DURING_DEPLOYMENT=true`
- `ENABLE_ORYX_BUILD=true`

Do not add a Supabase service-role key.

The startup command is:

`python -m uvicorn app.main:app --host 0.0.0.0 --port 8000`

The API is deployed as a ZIP containing only `services/api`, so `requirements.txt` is at the deployment root and Azure Oryx can install Python dependencies.

Certified probes:

- `GET /health` -> `status=ok`, `service=averis-api`
- `GET /readiness` -> `status=ready`, `saas_mode=true`, `supabase_configured=true`, `original_upload_retained=false`

Keep the App Service plan at F1 Free. Do not scale up or enable paid add-ons automatically. F1 is appropriate for beta validation and has strict shared quotas.

## 2. GitHub Pages web

`apps/web/next.config.ts` supports a static export when `GITHUB_PAGES=true`.

The `Averis Static Web Certification` workflow proves these routes export successfully:

- `/`
- `/multi-source`
- `/privacy`

The certification build points `NEXT_PUBLIC_API_URL` to the certified Azure API:

`https://averis-api-beta-db36dd7d.azurewebsites.net`

GitHub Pages must be enabled once in repository settings with GitHub Actions as the publishing source. The current ChatGPT GitHub integration cannot change that repository-admin setting.

Public browser build values:

- `NEXT_PUBLIC_API_URL=https://averis-api-beta-db36dd7d.azurewebsites.net`
- `NEXT_PUBLIC_SUPABASE_URL=https://lydepiaatemwpremgekt.supabase.co`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<current publishable key>`

Do not put a service-role key or any server secret in a `NEXT_PUBLIC_*` variable.

## 3. Provider fallbacks

Portable fallback configuration remains in the repository for Railway, Render, Netlify, and generic Docker/container hosts.

Railway could not be used because the connected account trial had expired and required selecting a plan. Render Free service creation was rejected for the connected account because payment information was required. Back4app automation was blocked by account/human-verification onboarding. None of those providers is required for the certified Azure student beta path.

## 4. CORS

`WEB_ORIGIN` accepts a comma-separated list of exact trusted browser origins during migration. For the current migration use:

`https://averis-web.vercel.app,https://teldigi5-wq.github.io`

The API normalizes and de-duplicates exact origins. It does not use wildcard CORS.

When the final web host is known, keep only origins that are actually required.

## 5. Production evidence test

After the public web host points to the Azure API:

1. Verify `/health` and `/readiness`.
2. Sign in through the public web URL.
3. Confirm 5 scan credits before the first certified scan.
4. Select a TXT/PDF/DOCX file and extract it.
5. Run one integrity analysis.
6. Verify the account changes from 5 to 4 credits.
7. Verify exactly one private scan-history row is created.
8. Verify no original upload is stored in Supabase Storage.
9. Verify any stored fingerprint retains no original submission text.
10. Delete the history through the application and verify the metadata deletion.

Do not mutate Supabase manually to simulate any of these E2E results.
