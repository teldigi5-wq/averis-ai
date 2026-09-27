# Document ingestion security

Averis accepts only TXT, PDF, and DOCX for the student beta. Uploaded bytes are read into the request process for text extraction and are not persisted by the beta upload flow.

## Current controls

- 15 MB request-level upload limit.
- Client filenames are reduced to a safe basename, control characters and platform-reserved filename characters are removed/replaced, and long names are bounded.
- The server returns a canonical media type derived from the validated file class rather than trusting the browser-supplied `Content-Type` header.
- TXT must be valid UTF-8, must not contain NUL bytes, and is rejected when excessive binary-style control characters are present.
- PDF must contain a real PDF header near the beginning of the file, must not be encrypted/password-protected, is limited to 300 pages, and has a bounded extracted-text budget.
- DOCX must be a valid ZIP/Office package containing `[Content_Types].xml` and `word/document.xml`.
- DOCX preflight rejects encrypted archive members, traversal paths, excessive entry counts, oversized entries, excessive total uncompressed size, and suspicious compression ratios before `python-docx` parses content.
- Extracted text is capped at 2,000,000 characters before it can enter downstream comparison logic.
- Malformed/unsafe documents return explicit 4xx errors instead of parser tracebacks.

## Truth boundary

These controls reduce parser abuse, malformed-container risk, spoofed file types, archive bombs, and accidental resource exhaustion. They are not a claim that Averis can prove an uploaded document is malware-free.

A future higher-risk production profile may add sandboxed malware scanning/quarantine. The current beta does not execute Office macros, does not accept `.docm`, and does not intentionally execute active PDF content during text extraction.
