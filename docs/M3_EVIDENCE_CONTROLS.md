# M3 Evidence Controls v1

Averis M3 evidence controls let a student explicitly choose how the primary similarity evidence is prepared before scoring. These controls are transparent analysis settings, not hidden score manipulation.

## Controls

### Quote exclusion
When enabled, Averis removes explicit straight or curly double-quoted spans from the student's analysis text before primary similarity scoring. Single quotes/apostrophes are not treated as quotation blocks.

The response reports `quotes` in `exclusions_applied` only when an explicit quoted span was actually detected and removed.

### Bibliography exclusion
When enabled, Averis removes text beginning at a standalone bibliography heading such as `References`, `Bibliography`, `Works Cited`, or `Reference List`.

The heading must appear on its own line (optionally as a Markdown heading). Ordinary prose containing words such as “references” or “bibliography” is not removed.

### Minimum match words
`min_match_words` is bounded from 3 through 50. It controls both:

- the minimum sentence/passage size eligible for fuzzy passage evidence; and
- the minimum exact-overlap window when the selected threshold is stricter than the five-word baseline.

This prevents a short passage from disappearing from the evidence list while still silently contributing to the primary exact-overlap score.

## Evidence transparency
The similarity response includes:

- `exclusions_applied`
- `min_match_words`
- `document_words_original`
- `document_words_analyzed`
- `document_words_excluded`
- `evidence_version = m3-evidence-controls-v1`

The stable `document_hash` remains calculated from the original submission text so document identity does not change when a student changes analysis controls. Candidate MinHash/vector signals use the selected analysis text but remain separate from `similarity_percent`.

## Boundary
These controls do not determine whether a quotation was cited correctly, whether a bibliography entry is valid, or whether academic misconduct occurred. They only change which explicitly identified text is included in the primary comparison evidence. Citation/reference verification remains a separate evidence workflow.
