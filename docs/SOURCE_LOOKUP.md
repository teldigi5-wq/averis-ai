# Zero-Cost Scholarly Source Lookup

Averis uses external scholarly metadata only where the provider fits the project's zero-recurring-cost beta rule.

## Enabled provider: Crossref

The beta uses Crossref's public REST API for:

- bibliographic source search
- DOI resolution
- normalized title, DOI, authors, publication year and source URL metadata

No Crossref API key or paid Crossref Plus token is required for this integration.

The API endpoints are authenticated Averis endpoints rather than an anonymous proxy:

- `GET /api/v1/sources/search?q=<citation or title>&limit=1..5`
- `GET /api/v1/sources/resolve?doi=<doi>`

Source lookups do not consume scan credits. Results are metadata candidates for evidence review; a Crossref match by itself does not prove that a student copied from the source.

## Request controls

Averis bounds source search to five Crossref results per request and applies a short upstream timeout. Upstream rate limiting or temporary failures are translated into a temporary service error instead of silently fabricating a result.

`CROSSREF_MAILTO` is optional. When configured, it is sent to Crossref as operational contact information along with an identifying User-Agent.

## OpenAlex policy

Averis keeps OpenAlex metadata parsing/provider interfaces in the codebase, but **live OpenAlex API calls are disabled in the zero-cost beta** because the current OpenAlex API documents metered usage for search/list operations.

We can revisit live OpenAlex access only when either:

1. a clearly non-billable allowance is sufficient and explicitly approved for production use, or
2. Averis has revenue and the API cost is intentionally budgeted.

This avoids hidden cost creep before the product earns money.

## Privacy

Search queries are sent to Crossref only when an authenticated user explicitly performs a scholarly source lookup. Averis does not automatically send the full uploaded assignment to Crossref.

The current beta continues to avoid retaining original student uploads. Source metadata and derived fingerprints remain separate from academic-misconduct judgments.
