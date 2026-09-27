# Reference-linked Revision v4 runtime policy

Linked DOI verification is bounded to five distinct lookups per Revision AI request. Crossref failure must degrade to `verification_unavailable`; it must not fail the entire revision analysis. Non-DOI references remain local linkage evidence and should be reviewed through Reference Audit.
