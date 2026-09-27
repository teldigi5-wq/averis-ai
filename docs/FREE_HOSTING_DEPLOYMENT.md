# Averis zero-cost hosting path

This document describes the current no-recurring-cost deployment path for Averis while Vercel Hobby builds are rate limited.

## Architecture

- Web: Netlify (Next.js from `apps/web`)
- API: Render Free web service (FastAPI from `services/api`)
- Auth/data: existing Supabase project

No service-role key belongs in the frontend. The original student upload remains processed in memory by the current beta flow and is not intentionally persisted by this hosting change.

## 1. Render API

The repository root contains `render.yaml`.

Create a Render Blueprint from this repository and branch. The blueprint configures:

- service name: `averis-api`
- runtime: Python
- free plan
- root directory: `services/api`
- build: `pip install -r requirements.txt`
- start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- health check: `/health`

Provide these values in Render when prompted:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `WEB_ORIGIN`

`APP_ENV=beta` and `SAAS_MODE=true` are declared in the blueprint.

After deployment, verify:

- `https://<render-host>/health`
- `https://<render-host>/readiness`

Readiness must report `status=ready`, `saas_mode=true`, `supabase_configured=true`, and `original_upload_retained=false`.

## 2. Netlify web

The repository root contains `netlify.toml` and points Netlify at `apps/web`.

Connect this GitHub repository in Netlify. The committed configuration uses:

- base: `apps/web`
- build command: `npm run build`
- publish directory: `.next`
- Node: `22`

Set these variables in Netlify before the first real production test:

- `NEXT_PUBLIC_API_URL=https://<render-host>`
- `NEXT_PUBLIC_SUPABASE_URL=https://lydepiaatemwpremgekt.supabase.co`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<current publishable key>`

Do not add a Supabase service-role key to Netlify.

## 3. CORS

Set Render `WEB_ORIGIN` to the exact Netlify site origin. During migration it may contain a comma-separated list of exact trusted origins, for example:

`https://averis-web.vercel.app,https://<averis-netlify-site>.netlify.app`

The API normalizes and de-duplicates those exact origins. It does not use wildcard CORS.

## 4. Production evidence test

After both services are live:

1. Sign in through the Netlify web URL.
2. Confirm 5 scan credits before the first certified scan.
3. Select a TXT/PDF/DOCX file and extract it.
4. Run one integrity analysis.
5. Verify the account changes from 5 to 4 credits.
6. Verify exactly one private scan-history row is created.
7. Verify no original upload is stored in Supabase Storage.
8. Verify any stored fingerprint retains no original submission text.
9. Delete the history through the application and verify the metadata deletion.

Do not mutate Supabase manually to simulate any of these E2E results.
