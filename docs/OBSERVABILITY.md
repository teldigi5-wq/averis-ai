# API observability

Averis uses zero-cost, privacy-safe request correlation before introducing any paid monitoring vendor.

## Request IDs

Every API response receives an `X-Request-ID` header. A caller-supplied ID is accepted only when it matches a conservative 8–128 character allowlist (`A-Z`, `a-z`, digits, `.`, `_`, `-`). Invalid or missing values are replaced with a server-generated random ID.

`X-Request-ID` is listed in CORS `Access-Control-Expose-Headers`, so the Averis web application can surface the correlation ID to a student or support workflow.

## Structured request logs

The API emits one JSON record per request with only:

- `event=http_request`
- request ID
- HTTP method
- URL path (never the query string)
- status code
- duration in milliseconds
- coarse outcome (`ok`, `handled_error`, `unhandled_error`)
- exception class name for an unhandled 5xx error, without the exception message

The middleware does **not** log request or response bodies, query strings, IP addresses, authorization headers, cookies, email addresses, filenames, assignment/source text, DOI/search queries, or exception messages.

This means standard Vercel/runtime logs can provide basic troubleshooting without deliberately copying student content into an observability system.

## Scope

This is an M8 foundation, not a full monitoring platform. Future revenue-stage observability may add bounded metrics, alerting, SLO dashboards, and longer retention policies. Any external monitoring provider must preserve the same content-minimization boundary.
