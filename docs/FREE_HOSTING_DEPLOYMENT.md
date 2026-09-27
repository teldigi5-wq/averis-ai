# Averis zero-cost hosting path

This document describes the current no-recurring-subscription deployment path for the Averis beta while Vercel Hobby builds are rate limited.

## Preferred beta architecture

- Web: GitHub Pages static export from `apps/web`
- API: Railway from `services/api`
- Auth/data: existing Supabase project
- Temporary API fallback while Railway is not connected: existing `https://averis-api.vercel.app`

No service-role key belongs in the frontend. The original student upload remains processed in memory by the current beta flow and is not intentionally persisted by this hosting change.

## 1. Railway API

`services/api/railway.json` defines the backend build/start/health configuration.

For the Railway service use:

- repository: `teldigi5-wq/averis-ai`
- branch: the exact branch/SHA being certified
- root directory: `/services/api`
- config path: `/services/api/railway.json`
- health check: `/health`

Set these runtime variables:

- `APP_ENV=beta`
- `SAAS_MODE=true`
- `SUPABASE_URL=https://lydepiaatemwpremgekt.supabase.co`
- `SUPABASE_PUBLISHABLE_KEY=<current publishable key>`
- `WEB_ORIGIN=<exact trusted web origin>`

Do not add a Supabase service-role key.

After deployment verify:

- `https://<railway-host>/health`
- `https://<railway-host>/readiness`

Readiness must report `status=ready`, `saas_mode=true`, `supabase_configured=true`, and `original_upload_retained=false`.

Railway's zero-dollar/free-credit tier is intended only for low-usage beta validation. If the included usage allowance is exhausted, do not enable paid usage automatically; keep the pre-revenue recurring-cost boundary at Rs. 0.

## 2. GitHub Pages web

`apps/web/next.config.ts` supports a static export when `GITHUB_PAGES=true`.

The `Averis Static Web Certification` workflow proves that these routes export successfully before deployment:

- `/`
- `/multi-source`
- `/privacy`

GitHub Pages must be enabled once in repository settings with GitHub Actions as the publishing source. The current ChatGPT GitHub integration cannot change that repository-admin setting.

For the Pages build use:

- `NEXT_PUBLIC_API_URL=https://<api-host>`
- `NEXT_PUBLIC_SUPABASE_URL=https://lydepiaatemwpremgekt.supabase.co`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<current publishable key>`

Do not put a service-role key or any server secret in a `NEXT_PUBLIC_*` variable.

## 3. Netlify / Render fallbacks

The repository still contains `netlify.toml` and `render.yaml` as portable fallbacks. Render service creation was not used for the current beta because the connected Render account required a payment card even for service creation. No card or paid plan is required by the Averis codebase itself.

## 4. CORS

`WEB_ORIGIN` accepts a comma-separated list of exact trusted browser origins during migration. Example:

`https://averis-web.vercel.app,https://teldigi5-wq.github.io`

The API normalizes and de-duplicates exact origins. It does not use wildcard CORS.

When the final web host is known, keep only the origins that are actually required.

## 5. Production evidence test

After web and API are live:

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
