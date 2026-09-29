# Averis 2.0 Figma handoff

Figma file: https://www.figma.com/design/r51Iy0ynbde5VP8FW1N4CM

This file is the high-fidelity visual companion to the Averis 2.0 product architecture and design-system documents on this branch.

## Current screen set

### Foundation
- Design System

### Public and authentication
- Landing
- Sign In
- Sign Up
- Mobile Sign In

### Desktop core flow
- Dashboard
- New Review
- Processing
- Results Summary
- Evidence Viewer
- Source Intelligence
- Citation Intelligence

### Desktop secondary/account
- History
- Privacy & Security
- Settings
- Help

### Mobile core flow
- Mobile Dashboard
- Mobile New Review
- Mobile Results
- Mobile Evidence Viewer

## Visual direction

Averis 2.0 uses a dark ink foundation, restrained cyan/teal accent, compact enterprise SaaS spacing, fine borders, consistent radii, clear typographic hierarchy, and evidence-first review patterns.

The visual goal is not to make the existing beta prettier. It is to make Averis read as professional academic-integrity and research software that could credibly be adopted by students, researchers, and institutions.

The signed-out marketing/authentication experience is intentionally separated from the authenticated application shell. Marketing can use larger editorial typography and product explanation; authenticated screens remain compact, task-oriented, and evidence-dense.

## Core product principle

**Evidence over accusations.**

The UI should show the passage, source, provenance, confidence, controls, and next review action without presenting an automatic misconduct verdict.

## Public journey represented in Figma

1. Landing
2. Sign In / Sign Up
3. Enter private workspace

## Core desktop journey represented in Figma

1. Dashboard
2. New Review
3. Processing
4. Results Summary
5. Evidence Viewer
6. Source Intelligence
7. Citation Intelligence
8. History
9. Privacy / Settings / Help

## Mobile journey represented in Figma

1. Sign In
2. Dashboard
3. New Review
4. Results Summary
5. Evidence Viewer

## Implementation order

1. Design tokens and application shell
2. Public/auth shell separation
3. Authenticated dashboard
4. New Review flow
5. Processing state
6. Review Results
7. Evidence Viewer
8. Source Intelligence
9. Citation Intelligence
10. History / Privacy / Settings / Help
11. Mobile shell and mobile review/evidence flow

## Safety / scope boundary

This design work does not change:

- authentication behavior
- scan-credit behavior
- similarity/evidence scoring logic
- privacy or retention behavior
- Supabase schema
- Azure hosting configuration

The existing certified beta remains unchanged until a separate implementation PR is created and validated.
