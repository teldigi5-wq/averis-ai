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

## Scope boundary

The current audit is designed for common APA/Harvard-style author-year citations. Numeric styles such as IEEE/Vancouver require a separate parser and are not judged by this check.

An unmatched citation is **not automatically a fake citation**. Formatting variations, organization authors, unusual surnames, missing years, or unsupported styles can produce incomplete matches. The API therefore labels findings as review aids and keeps the raw detected evidence visible.

## Next verification layer

The next scholarly-verification slice can use the already-integrated Crossref public API to verify DOI-bearing references and retrieve bounded bibliographic candidates for references without a DOI. That external step should remain explicit and bounded so entire assignments are never silently sent to third-party APIs.
