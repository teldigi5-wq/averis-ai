# Reference Intelligence Foundation

Averis treats citation/reference analysis as **review assistance**, not an automatic accusation of fabrication or plagiarism.

## Local parsing

Authenticated users can parse a bibliography without sending it to an external service:

- `POST /api/v1/references/parse`

The parser currently extracts:

- first-author matching key
- publication year
- DOI when present
- parsing warnings when those fields are not detected

The input is bounded to 25,000 characters and the parser caps the number of references it processes.

## Author-year consistency audit

Averis can compare common author-year citations in a document against the supplied reference list:

- `POST /api/v1/references/audit`

The audit reports:

- detected in-text citation mentions
- citation mentions that do not have a matching author/year reference
- bibliography entries that are not cited by a detected author/year citation
- the number of matched citation mentions

This check runs locally in the Averis API and does not call Crossref or another external provider.

## Crossref-backed verification

Authenticated users can explicitly request external bibliographic evidence for a small reference batch:

- `POST /api/v1/references/verify`

The default is five references and the hard maximum is ten per request.

For DOI-bearing references, Averis asks Crossref for the exact DOI record. Possible evidence states include:

- `verified_doi` — Crossref returned the DOI record and the compared metadata did not trigger a review flag
- `verified_doi_metadata_review` — the DOI exists but detected year/first-author metadata should be reviewed
- `no_crossref_record` — Crossref did not return that DOI

For references without a DOI, Averis requests one bibliographic candidate and compares the citation text to normalized Crossref metadata:

- `likely_match` — strong local bibliographic similarity without a detected year/author mismatch
- `needs_review` — a candidate exists but metadata or similarity is weak/inconsistent
- `no_candidate_found` — no Crossref candidate was returned

None of these states means “fake reference.” Crossref coverage is broad but not universal, metadata can be incomplete, and bibliographic search can return imperfect candidates.

## Scope boundary

The current local audit is designed for common APA/Harvard-style author-year citations. Numeric styles such as IEEE/Vancouver require a separate parser and are not judged by this check.

An unmatched citation is **not automatically a fake citation**. Formatting variations, organization authors, unusual surnames, missing years, unsupported styles, or provider coverage gaps can produce incomplete matches. The API therefore keeps the raw detected evidence and source candidate visible for human review.

## Privacy and cost

Local parse/audit requests never call an external provider. The `/verify` endpoint sends only the bounded reference strings needed for an explicit Crossref lookup; it does not send the full uploaded assignment.

Crossref verification uses the public no-key API and does not consume Averis scan credits. OpenAlex live calls remain disabled during the zero-cost beta while its current API is metered.
