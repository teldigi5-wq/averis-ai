# Averis Zero-Cost SaaS Foundation

This deployment profile is designed for the period before Averis earns revenue.
The hard constraint is **no recurring paid infrastructure dependency**.

## Components

- **Web:** Next.js. Host on a free static/serverless-compatible platform.
- **API:** FastAPI. During development it can run locally; a free public API host can be selected separately.
- **Auth + account database:** Supabase Free.
- **Similarity engine:** Averis deterministic Python engine; no paid LLM required.
- **AI assistance:** local Ollama first. AI is optional and never owns the similarity score.
- **Source control / CI:** GitHub + GitHub Actions.

## Security model

Public SaaS mode is activated with:

```env
SAAS_MODE=true
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<public key>
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<public key>
```

Never put a Supabase `service_role` or secret key in `NEXT_PUBLIC_*` variables.

When `SAAS_MODE=true`:

1. Every document extraction/scan request must include a Supabase access token.
2. The FastAPI service validates that token against Supabase Auth.
3. Similarity is calculated by Averis.
4. The API invokes `consume_scan_credit` using the student's own token.
5. PostgreSQL atomically decrements the balance and records scan metadata.
6. RLS limits profile/history reads and history deletes to the signed-in student.

The browser cannot directly increase its credit balance.

## Create the free database

Create a Supabase Free project, open the SQL editor, and apply:

```text
supabase/migrations/20260926160000_zero_cost_saas_foundation.sql
```

The migration creates:

- `profiles`
- `scans`
- automatic profile creation for new Auth users
- 5 starting beta credits
- row-level security policies
- `consume_scan_credit(...)` RPC

## Privacy behavior in this slice

The current upload endpoint reads the file into API memory, extracts text, and returns the extracted text to the browser. It does **not** write the original PDF/DOCX/TXT to Supabase Storage or the local database.

Persisted scan history contains only:

- user id
- document filename
- reference/source label
- similarity percentage
- credit usage
- timestamp

Students can delete their own scan-history rows. Deleting history does not refund credits.

## Local development

Keep:

```env
SAAS_MODE=false
```

With no public Supabase variables, the web UI displays Developer Mode and the API bypasses account/credit enforcement. This makes deterministic engine development and CI independent of external services.

## Before public launch

- Enable email confirmation and review Supabase Auth rate limits.
- Set `SAAS_MODE=true` on the public API.
- Verify RLS in the actual Supabase project.
- Configure only the public publishable/anon key in the browser.
- Add API-level rate limiting before advertising the beta widely.
- Add abuse limits for document size, requests per account, and concurrent scans.
- Decide a retention policy before storing any original documents.
