# Averis 2.0 — Product Architecture

## Product definition

Averis is a professional academic-integrity and research-intelligence platform built around one principle: **evidence over accusations**.

The product should help a student or researcher answer four questions:

1. What in my work deserves review?
2. Which sources appear related?
3. Are my citations and references internally consistent?
4. What evidence supports the result?

Averis must not present itself as an automated misconduct judge. It should surface reviewable evidence, provenance, confidence, and controls so a human can decide what needs correction or investigation.

## Product principles

1. **Evidence first** — every score should resolve to passages, sources, metadata, or explicit rules.
2. **Human review over verdicts** — avoid accusatory language and unsupported conclusions.
3. **Privacy by default** — make document handling, retention, deletion, and account controls visible.
4. **Findability** — the next important action should be obvious without reading the whole screen.
5. **Consistency** — navigation, component behavior, states, spacing, and terminology should be predictable.
6. **Accessibility first** — keyboard access, visible focus, contrast, semantic structure, reduced motion, scalable type, and understandable error states.
7. **Responsive by design** — desktop, tablet, and mobile are distinct layouts, not scaled copies.
8. **System status is always visible** — uploading, extracting, analyzing, finding evidence, checking citations, saving, and deleting should all have clear states.
9. **No dark patterns** — credits, limits, destructive actions, and privacy consequences must be explicit.
10. **Enterprise credibility without enterprise clutter** — serious, calm, clear, and data-oriented.

## Primary personas

### Student

Goals:
- review a paper before submission
- understand matched passages
- discover likely scholarly sources
- fix citation/reference inconsistencies
- retain control over uploaded work

Needs:
- fast onboarding
- plain-language evidence
- confidence that the platform does not retain original documents unnecessarily
- mobile-friendly review for quick checks

### Researcher

Goals:
- review drafts and manuscripts
- inspect source relationships
- validate citations and reference lists
- revisit prior reviews

Needs:
- denser evidence views
- reliable metadata
- clear provenance
- strong document navigation

### Institution reviewer (future)

Goals:
- review usage at an organizational level
- manage students/departments/policies
- audit evidence workflows
- export aggregate reports

Needs:
- role-based access
- policy controls
- reporting
- integration boundaries

Institution workflows are future scope and must not distort the student/researcher product now.

## Information architecture

### Public site

- Home
- Product
- Solutions
- How it works
- Security & Privacy
- Resources
- Sign in
- Get started

### Authenticated application

Primary navigation:

- Dashboard
- New Review
- Documents
- Sources
- Citations
- History

Secondary navigation:

- Privacy & Security
- Settings
- Help
- Sign out

### Core entities

- User
- Document
- Review
- Match
- Source
- Citation
- Reference
- Evidence item
- Review settings
- Privacy preference

## Navigation model

### Desktop

Persistent left sidebar:
- Dashboard
- New Review
- Documents
- Sources
- Citations
- History

Bottom section:
- Privacy & Security
- Settings
- Help

Top bar:
- global search
- processing status / notifications
- user avatar / account menu

### Tablet

Collapsible sidebar with icons + labels when expanded.

### Mobile

Bottom navigation:
- Home
- Reviews
- Sources
- Citations
- Profile

Evidence/detail panels open as drawers or bottom sheets rather than permanent secondary columns.

## Core user journey

### Landing → Account → Review → Evidence → Improve

1. User lands on the marketing site.
2. User creates or signs into an account.
3. Dashboard explains the workspace and current credit/status state.
4. User starts a new review.
5. User uploads TXT, PDF, or DOCX.
6. Averis extracts the document in memory.
7. User chooses analysis controls.
8. Averis runs similarity/evidence analysis.
9. Processing states show what is happening.
10. Results show similarity overview + concrete matched passages.
11. User opens the evidence viewer.
12. User optionally searches scholarly sources.
13. User checks citations/references.
14. User exports or revisits the review.
15. User can delete stored review metadata from History.

## Core application screens

### Dashboard

Purpose: orientation and continuation.

Content:
- greeting + one-line workspace summary
- credits/status
- recent reviews
- quick action: New Review
- recent source activity
- citation-health summary
- privacy status

Avoid vanity metrics. Every metric should lead somewhere useful.

### New Review

Three-step structure:

1. Upload document
2. Choose review controls
3. Analyze

Keep source comparison optional until the document is extracted.

### Processing

Do not use a generic spinner as the only feedback.

Show stages such as:
- Extracting document
- Preparing text
- Finding evidence
- Checking citations
- Discovering sources

Each stage should expose success/failure/retry states.

### Review Results

Top-level summary:
- overall similarity
- matched passages
- source count
- high-confidence evidence count
- controls applied

Primary action: **Review evidence**.

A score without traceable evidence should never be the visual endpoint.

### Evidence Viewer

Desktop: split screen.

Left:
- document text
- highlighted evidence spans
- location indicators

Right:
- matched passage
- source metadata
- similarity/confidence
- evidence explanation
- actions: open source / next match / previous match

Mobile: document first, evidence as bottom sheet.

### Source Intelligence

Features:
- scholarly search
- year/source-type/author/subject filters
- relevance score
- DOI/metadata availability
- open source record
- add/reference action when supported

This area should feel like research tooling, not a decorative add-on to plagiarism checking.

### Citation Intelligence

Summary:
- citations detected
- references matched
- inconsistent citations
- missing references
- unmatched citations

Issue table/list:
- type
- location
- explanation
- review action

### History

- prior reviews
- document name
- date/time
- similarity summary
- source count
- review status
- delete action

Original uploaded content should not be implied to exist when only metadata remains.

### Privacy & Security

Expose:
- original-upload handling
- metadata retained
- deletion behavior
- account export
- account deletion
- processing transparency
- academic-integrity principles

## Marketing architecture

### Navigation

- Product
- Solutions
- How it works
- Security
- Resources
- Sign in
- Get started

### Hero

Recommended headline:

> Academic integrity, backed by evidence.

Supporting line:

> Review similarity, discover scholarly sources, and verify citations with transparent evidence designed for human review.

Primary CTA: Start free
Secondary CTA: Explore the platform

Trust line:

> 5 free evidence-backed scans · No credit card · Privacy-first

The hero should show a real product workspace preview, not a decorative logo as the primary visual.

## Responsive model

### Desktop — 1280–1440+

- persistent sidebar
- two/three-column evidence layouts where useful
- dense data tables
- sticky contextual panels

### Tablet — 768–1024

- collapsible navigation
- two-column layouts collapse selectively
- evidence panel becomes overlay/drawer

### Mobile — 320–430

- bottom navigation
- one primary task per screen
- evidence and source details as sheets
- tables become stacked rows/cards
- upload, analysis, and result actions stay thumb-reachable

## Required states

Every major interactive component must define:

- default
- hover (pointer devices)
- focus-visible
- loading
- empty
- success
- error
- disabled
- permission denied
- offline/network failure
- processing
- completed

## Accessibility acceptance criteria

Target WCAG 2.2 AA principles.

Minimum requirements:
- full keyboard navigation
- no keyboard traps
- 3:1 visible focus indicators against adjacent colors
- sufficient text/background contrast
- semantic landmarks/headings
- labels for every form control
- useful error text, not color alone
- reduced-motion mode
- 200% text zoom without lost functionality
- responsive reflow without horizontal scrolling for ordinary content

## Trust language

Preferred language:
- evidence
- review
- matched passage
- source candidate
- citation issue
- reference consistency
- human review
- processing transparency

Avoid:
- guilt language
- definitive misconduct labels
- unsupported AI certainty
- claims that Averis is equivalent to institutional plagiarism systems

## Product rollout

### Phase 1 — Product UX architecture

Status: this document.

Deliverables:
- personas
- information architecture
- primary flows
- responsive navigation model
- trust principles
- state model

### Phase 2 — Design system

Deliverables:
- tokens
- typography
- spacing
- color system
- components
- interaction states
- accessibility rules

### Phase 3 — Core screen designs

Design:
- Landing
- Sign up
- Sign in
- Dashboard
- New Review
- Upload
- Processing
- Review Results
- Evidence Viewer
- Source Intelligence
- Citation Intelligence
- History
- Settings
- Privacy & Security

### Phase 4 — Responsive variants

Every screen receives desktop, tablet, and mobile specifications.

### Phase 5 — Prototype validation

Test:

Landing → Create account → Upload → Analyze → Review evidence → Find source → Check citations

Track friction before implementation.

### Phase 6 — Production implementation

Only after the architecture and design system stabilize should the main frontend be aggressively refactored.

## Definition of success

Averis 2.0 should make a first-time reviewer think:

> “This is a serious academic review product I could trust with a draft.”

The experience should feel like a coherent product system rather than a collection of individual pages.