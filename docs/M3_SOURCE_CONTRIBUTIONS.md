# M3 Per-source contribution v1

Averis can estimate how much of the analyzed submission is represented by each manually supplied source through:

`POST /api/v1/similarity/contributions`

## Calculation boundary

This is **not** a second plagiarism percentage.

The service applies the same explicit document evidence controls used by the primary similarity scan, then evaluates eligible submission sentences against up to five supplied sources. Each submission sentence can be assigned to at most one source: the source with the strongest qualifying passage match. This prevents overlapping or duplicate sources from double-counting the same submission sentence.

For each source Averis returns:

- matched sentence count
- matched document-word count
- percentage of analyzed document words assigned to that source
- average passage match score
- up to 12 strongest assigned passage pairs

The report also returns total unique matched-document coverage, word-exclusion accounting, and the evidence controls actually applied.

## Zero-cost / abuse boundary

- maximum 5 sources per request
- maximum 80,000 document characters
- maximum 40,000 characters per source
- maximum 600 eligible sentences per document/source
- uses the existing authenticated distributed similarity request limit
- does not call an external AI or scholarly API
- does not consume an additional scan credit because it is a breakdown of already supplied evidence, not a new primary scan verdict

## Interpretation

Coverage means that the submission sentence was assigned to the strongest source match at or above the current passage threshold. It does not establish authorship, plagiarism, misconduct, citation correctness, or source ownership. Human review remains required.
