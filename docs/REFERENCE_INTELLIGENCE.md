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

For numeric citation styles, the bibliography order is also treated as the reference number: the first parsed entry is reference 1, the second is reference 2, and so on. Explicit prefixes such as `[1]` or `1.` are stripped for metadata parsing but preserve that order.

## Citation consistency audit

Averis can compare common in-text citation forms against the supplied reference list:

- `POST /api/v1/references/audit`

### Author-year citations

Common APA/Harvard-style forms remain supported, including parenthetical and narrative mentions. The audit reports:

- detected author-year citation mentions
- author-year mentions without a matching parsed author/year reference
- matched author-year citation count

### Square-bracket numeric citations

Averis also detects conservative IEEE and bracketed Vancouver-style candidates such as:

- `[1]`
- `[2, 4]`
- `[3-5]`
- `[1; 3-4]`

Bounded ranges are expanded and checked against bibliography order. The audit returns:

- each detected numeric citation and its expanded reference numbers
- numeric citation mentions containing numbers that do not exist in the supplied bibliography
- the exact missing reference numbers
- matched numeric citation count
- detected citation styles

Four-digit bracket values such as `[2024]` are intentionally not treated as numeric citations. Parenthesized numbers such as `(1)` are also excluded because they are too ambiguous in ordinary prose. Descending or excessively large ranges are ignored rather than guessed.

When numeric citations are present, uncited-reference checks can use bibliography position even when author/year metadata is unavailable. Mixed documents can use both author-year and numeric evidence when deciding whether a parsed reference appears to be cited.

All local parse/audit checks run inside the Averis API and do not call Crossref or another external provider.

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

Numeric bracket detection is deliberately conservative but still cannot prove that every bracketed number is a citation; numbered equations, requirements, list labels, and other document conventions may look similar. Likewise, unmatched author-year citations can result from formatting variations, organization authors, unusual surnames, missing years, or parser limits.

An unmatched citation or missing numeric reference is **not automatically a fake citation**. The API keeps the raw detected evidence visible for human review.

## Privacy and cost

Local parse/audit requests never call an external provider. The `/verify` endpoint sends only the bounded reference strings needed for an explicit Crossref lookup; it does not send the full uploaded assignment.

Crossref verification uses the public no-key API and does not consume Averis scan credits. OpenAlex live calls remain disabled during the zero-cost beta while its current API is metered.
