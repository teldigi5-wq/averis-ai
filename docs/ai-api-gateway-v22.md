# Averis AI API Gateway v22

Averis already has two AI execution paths: local Ollama and Private Browser AI. v22 adds a third, optional **server-side AI API** path for devices where local/browser inference is not appropriate.

## Runtime choices

- **Local Ollama** — existing local backend runtime.
- **Private Browser AI** — Qwen WebGPU runtime executing on the user's device after model assets are loaded.
- **AI API** — optional OpenAI-compatible server-side provider.

## Why this exists

The Azure F1 API cannot realistically host a full LLM itself. A server-side AI API adapter lets Averis use a separately hosted or external OpenAI-compatible model without exposing provider credentials to the frontend.

The adapter is vendor-neutral and disabled by default. No provider is silently selected and there is no automatic paid fallback.

## Configuration

Configure these API environment variables only when an operator intentionally enables the server AI runtime:

- `AI_REVISION_ENABLED=true`
- `AI_API_ENABLED=true`
- `AI_API_BASE_URL=<OpenAI-compatible /v1 base URL>`
- `AI_API_KEY=<server-side secret>`
- `AI_API_MODEL=<model id>`
- optional `AI_API_PROVIDER_LABEL=<safe display label>`
- optional `AI_API_TIMEOUT_SECONDS=<seconds>`

The browser can read `/api/v1/ai/revision/runtimes`, which returns only non-secret availability metadata. The API key and base URL are never returned.

## Safety / integrity boundary

Every AI API revision request still passes through the same authenticated, rate-limited revision route and deterministic guardrails before a provider call. Detector-evasion goals are blocked before generation. Generated wording is treated as a candidate only and must pass citation, number, and DOI preservation checks before adoption.

No new persistence path, database table, scan-credit charge, or automatic provider fallback is introduced.
