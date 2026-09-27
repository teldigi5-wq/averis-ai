# Reference-linked Revision v4

This stage connects citation-proximity evidence to the bibliography supplied by the student.

## Evidence chain

For the strongest lexical/fuzzy matched passages Averis can now:

1. detect a common nearby author-year or numeric citation marker;
2. map that marker to a supplied bibliography entry by author/year or numeric position;
3. preserve ambiguous and unresolved mappings as review findings rather than guessing;
4. for linked DOI-bearing entries, perform up to five bounded Crossref DOI lookups;
5. show Crossref title/year/DOI metadata when the DOI resolves;
6. keep local-only, missing, rate-limited, and unresolved states explicit in the response and UI.

## What a successful link means

A successful local link means only that an in-text marker can be mapped to a bibliography entry. A `verified_doi` state additionally means that Crossref returned a record for that DOI.

Neither state proves that:

- the cited work supports the student's claim;
- copied wording is correctly quoted;
- the citation style is correct;
- the bibliography entry is complete;
- the student complied with an institution's academic-integrity rules.

Those remain human-review questions. Reference Audit remains the dedicated broader consistency/verification workflow.

## Failure behavior

Crossref verification is bounded and non-blocking for the academic review flow. If Crossref is unavailable, Averis keeps the local citation/reference linkage and reports `verification_unavailable` instead of failing the whole Revision AI request.

## Product boundaries

- no detector-evasion rewriting;
- no automatic plagiarism or AI-authorship verdict;
- no scan-credit changes;
- no primary similarity-score changes;
- no Supabase schema changes;
- no original-upload retention changes;
- no wildcard CORS;
- no paid inference requirement;
- semantic thresholds still require the separate labeled calibration gate from AI Evidence Calibration v2.
