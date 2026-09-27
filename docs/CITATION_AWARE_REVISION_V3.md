# Citation-aware Revision v3

Averis now adds citation-proximity evidence to the Revision AI workflow so students can see whether strong matched passages appear to have a nearby recognizable in-text citation marker.

## What is measured

For the strongest lexical/fuzzy matched passages, Averis reports:

- number of matched passages reviewed;
- number with a nearby recognized citation marker;
- number without a nearby recognized citation marker;
- citation-proximity coverage percentage;
- the detected marker, when present.

The first implementation recognizes common author-year forms such as `(Perera, 2024)` and `Perera (2024)`, plus numeric forms such as `[12]`.

## What the metric does not mean

A nearby citation marker does **not** prove that:

- the marker points to the correct source;
- the bibliography contains a valid record;
- the citation style is correct;
- copied wording has been quoted correctly;
- the institution permits the way the source was used.

The metric is therefore revision evidence only. Reference Audit remains the separate source-verification step.

## Revision behavior

When matched passages have no nearby recognized citation marker, the revision plan places an attribution/citation action first. The student is told to add the required attribution or quotation/citation where the wording or idea actually came from a source.

Averis does not automatically fabricate or insert a citation. It also does not rewrite the passage merely to reduce a detector score.

## Relationship to semantic evidence

Citation proximity is independent of semantic calibration. Uncalibrated semantic cosine scores remain candidate evidence only and cannot change the `low review` / `review` / `high review` band. Exact/fuzzy evidence and citation context remain available when the AI runtime is disabled.
