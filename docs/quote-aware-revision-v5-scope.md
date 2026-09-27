# Quote-aware Revision v5

This stage adds quotation context around matched passages without changing Averis similarity scores.

Averis may classify a matched passage as quoted or unquoted and may report whether a nearby recognizable citation marker exists. These are review signals only. A quotation mark does not prove that quoting is permitted, a citation marker does not prove the source is correct, and an unquoted matched passage is not automatically misconduct.

The stage preserves the existing evidence-first boundary: no detector-evasion rewriting, no automatic plagiarism verdict, no AI-authorship verdict, and no semantic-threshold promotion without a labeled benchmark.
