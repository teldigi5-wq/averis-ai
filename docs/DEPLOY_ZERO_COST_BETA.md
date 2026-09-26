# Averis zero-cost beta deployment

This document describes the pre-revenue beta configuration. It is intentionally designed so Averis can be tested without adding a paid dependency.

## Live Supabase project

- Project: `averis`
- Project ref: `lydepiaatemwpremgekt`
- Region: `ap-south-1`
- API URL: `https://lydepiaatemwpremgekt.supabase.co`

Do **not** commit a service-role or secret key. The browser uses only a Supabase publishable key. The backend may also use the same publishable key to validate a signed-in user's access token against Supabase Auth.

## Web environment

Set these on the frontend hosting provider:

```env
NEXT_PUBLIC_SUPABASE_URL=https://lydepiaatemwpremgekt.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<current Supabase publishable key>
NEXT_PUBLIC_API_URL=<public Averis API URL>
```

The publishable key is designed for browser use, but keeping it in hosting environment configuration makes rotation and project changes easier and prevents forks of this repository from automatically targeting the production project.

## API environment

Set these on the API hosting provider:

```env
APP_ENV=beta
SAAS_MODE=true
SUPABASE_URL=https://lydepiaatemwpremgekt.supabase.co
SUPABASE_PUBLISHABLE_KEY=<current Supabase publishable key>
WEB_ORIGIN=<public Averis web URL>
```

Never set a Supabase service-role/secret key in the browser application.

## Readiness gate

Before exposing the beta, verify:

```text
GET /health
GET /readiness
```

`/readiness` must return `status=ready`, `saas_mode=true`, and `supabase_configured=true` in the hosted API. If SaaS mode is enabled without Supabase configuration, the readiness endpoint intentionally returns HTTP 503.

## Required student-flow proof

Do not call the beta ready until one real test account proves this exact flow:

1. Create account.
2. Confirm email if Supabase requires confirmation.
3. Sign in.
4. Verify profile starts with 5 credits.
5. Upload TXT/PDF/DOCX and extract text.
6. Run one similarity analysis.
7. Verify credits change from 5 to 4.
8. Verify scan metadata appears in history.
9. Delete scan history.
10. Verify the original uploaded file is not retained in Supabase Storage.

## Cost boundary

This configuration is for pre-revenue testing. When Averis begins charging students, review hosting terms and move to a commercial-compatible paid plan or provider before accepting payments.
