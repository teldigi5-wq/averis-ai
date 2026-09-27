# Averis 2.0 Figma handoff

Figma file: https://www.figma.com/design/r51Iy0ynbde5VP8FW1N4CM

This file is the high-fidelity visual companion to the Averis 2.0 product architecture and design-system documents on this branch.

## Current screen set

- Design System
- Dashboard
- New Review
- Evidence Viewer
- Source Intelligence
- Citation Intelligence
- Mobile Dashboard
- Mobile New Review

## Visual direction

Averis 2.0 uses a dark ink foundation, restrained cyan/teal accent, compact enterprise SaaS spacing, fine borders, consistent radii, clear typographic hierarchy, and evidence-first review patterns.

The visual goal is not to make the existing beta prettier. It is to make Averis read as professional academic-integrity and research software that could credibly be adopted by students, researchers, and institutions.

## Core product principle

**Evidence over accusations.**

The UI should show the passage, source, provenance, confidence, controls, and next review action without presenting an automatic misconduct verdict.

## Implementation order

1. Design tokens and application shell
2. Authenticated dashboard
3. New Review flow
4. Processing state
5. Review Results
6. Evidence Viewer
7. Source Intelligence
8. Citation Intelligence
9. History / Privacy / Settings
10. Mobile shell and mobile evidence bottom sheet

## Safety / scope boundary

This design work does not change:

- authentication behavior
- scan-credit behavior
- similarity/evidence scoring logic
- privacy or retention behavior
- Supabase schema
- Azure hosting configuration

The existing certified beta remains unchanged until a separate implementation PR is created and validated.
