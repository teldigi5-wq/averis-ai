# Integrity Report PDF v1

Averis can generate an evidence-first integrity report entirely in memory through:

`POST /api/v1/reports/integrity.pdf`

The endpoint requires the same authenticated student session used by the rest of the SaaS API. Report export is rate-limited separately and does not consume a scan credit.

## Trust boundary

The browser does not submit a score for the PDF. It submits the source/submission text and explicit evidence controls; the API recomputes the deterministic similarity report server-side before rendering the PDF. This prevents an edited client-side percentage from becoming an exported Averis result.

The report contains:

- primary similarity percentage
- exact word-shingle overlap
- passage-strength summary
- selected minimum-match threshold
- original/analyzed/excluded word counts
- exclusions that actually matched text
- matched submission/source passages
- evidence version and scope note
- explicit non-verdict language

The report does not claim plagiarism or misconduct. It does not certify citation correctness, source ownership, or institutional policy compliance.

## Privacy and storage

Generation uses the already-supported PyMuPDF dependency and occurs in memory. The route does not write the original document, source text, or generated PDF to Supabase Storage or local persistent storage.

The response uses `Cache-Control: no-store` and a download-only `Content-Disposition` header.

## Zero-cost policy

No paid PDF service, external rendering service, AI API, or new hosted dependency is required. PyMuPDF is already present in the Averis API for PDF extraction.
