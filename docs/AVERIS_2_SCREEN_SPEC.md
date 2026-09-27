# Averis 2.0 — Core Screen Specification

This document turns the product architecture into concrete screen requirements before implementation.

## 1. Landing page

Goal: explain Averis in under 10 seconds and prove the product is real.

### Header
- Averis logo
- Product
- Solutions
- How it works
- Security
- Resources
- Sign in
- Get started

### Hero
Headline:

> Academic integrity, backed by evidence.

Supporting copy:

> Review similarity, discover scholarly sources, and verify citations with transparent evidence designed for human review.

Actions:
- Start free
- Explore the platform

Trust line:
- 5 free evidence-backed scans
- No credit card
- Privacy-first

Hero visual:
- real dashboard/review-workspace preview
- no decorative giant logo as the primary visual

### Following sections
1. Evidence over accusations
2. Product workflow
3. Similarity evidence preview
4. Source intelligence
5. Citation intelligence
6. Privacy/security
7. Final CTA

## 2. Sign up

Goal: create an account without marketing clutter.

Layout:
- compact Averis brand panel
- form panel

Fields:
- name
- email
- password

Support:
- 5 free scans
- no card
- privacy note
- link to sign in

States:
- default
- submitting
- email already used
- weak/invalid password
- network failure
- success / next step

## 3. Sign in

Fields:
- email
- password

Actions:
- Sign in
- Create account

Optional future:
- password recovery

No large landing hero once the user enters auth flow.

## 4. Dashboard

### Header
- `Good afternoon, {name}`
- one-line summary
- New Review button

### Overview row
Cards with useful continuation signals only:
- scan credits remaining
- recent reviews
- sources found recently
- citation issues requiring review

### Recent reviews
Rows:
- filename
- time
- similarity
- matched passages
- source count
- Open Review

### Quick actions
- New Review
- Find Sources
- Check Citations

### Trust strip
- Original upload retention status
- Privacy controls link

## 5. New Review

### Step 1 — Upload
- dropzone
- TXT / PDF / DOCX
- max size
- drag/drop + browse
- selected-file state

### Step 2 — Review settings
- minimum match size
- exclude quotations
- exclude bibliography
- explanation for each control

### Step 3 — Analysis scope
- manual source text optional
- later: source-discovery-assisted mode

Primary CTA:
- Analyze document · 1 credit

Do not show result cards before analysis exists.

## 6. Processing

Use staged system feedback.

Example:

```text
Preparing your review

✓ Upload received
✓ Document extracted
● Finding evidence
○ Checking citations
○ Preparing results
```

Show:
- filename
- elapsed state, not fake ETA
- cancel/leave guidance only if safe

Error state:
- failed stage
- plain-language reason
- retry action
- no credit double-spend on safe retry

## 7. Review results

### Review header
- filename
- reviewed time
- controls applied
- export

### Summary
- Similarity %
- Matched passages
- Sources identified
- High-confidence evidence

Similarity score should not dominate the full page.

### Main content
Primary card:
- `Review evidence`
- strongest match preview
- exact passage + source

Secondary:
- source contribution
- citation summary
- applied controls

## 8. Evidence viewer

### Desktop
Split view.

#### Left pane — Document
- full extracted text
- sentence/paragraph segmentation
- highlighted matched evidence
- selected match indicator
- previous/next match controls

#### Right pane — Evidence
- match score
- matched source text
- source metadata
- explanation
- open source
- source position
- confidence/relevance when supported

### Tablet
Document + slide-over evidence panel.

### Mobile
Document + evidence bottom sheet.

## 9. Source Intelligence

### Header
- title
- explanatory line
- search

### Filters
- publication year
- source type
- author
- subject

Citation count filter is future-only if the provider/data model supports it reliably.

### Result card
- title
- authors
- year
- publication
- DOI
- relevance
- provider
- open source record

Do not call metadata candidates similarity evidence.

## 10. Citation Intelligence

### Summary
- citations detected
- references matched
- inconsistent citations
- missing references
- unmatched citations

### Issue list
Columns/fields:
- issue
- location
- explanation
- action

### Reference detail
- parsed reference
- metadata candidate
- verification state
- DOI/provider details

## 11. History

### Desktop
Table/list with:
- filename
- date
- similarity
- evidence count
- source count
- status
- open
- delete

### Mobile
Stacked review cards.

Destructive action:
- confirm delete
- explain that used credits are not restored
- explain what metadata is removed

## 12. Privacy & Security

Sections:

### Document handling
- what is processed
- what is retained
- what is not retained

### Account data
- profile data
- scan metadata

### Controls
- export my data
- delete scan history
- delete account

### Academic-integrity principles
- evidence over accusations
- no automatic misconduct verdict
- human review required

## 13. Settings

Sections:
- Profile
- Account
- Preferences
- Accessibility
- Privacy

Future:
- notification preferences

## 14. Help

Content:
- How scans work
- How credits work
- What similarity means
- What Averis does not claim
- Supported file types
- Privacy FAQ
- Contact/support path

## Global application shell

### Desktop

```text
┌──────────────────────────────────────────────────────────────┐
│ Topbar: Search / Status / Account                           │
├──────────────┬───────────────────────────────────────────────┤
│ Sidebar      │ Page header                                   │
│              │                                               │
│ Dashboard    │ Main workspace                                │
│ New Review   │                                               │
│ Documents    │                                               │
│ Sources      │                                               │
│ Citations    │                                               │
│ History      │                                               │
│              │                                               │
│ Privacy      │                                               │
│ Settings     │                                               │
│ Help         │                                               │
└──────────────┴───────────────────────────────────────────────┘
```

### Mobile

```text
┌────────────────────────────┐
│ Averis            Account  │
├────────────────────────────┤
│                            │
│ Current screen             │
│                            │
├────────────────────────────┤
│ Home Reviews Sources Cite  │
└────────────────────────────┘
```

## Screen hierarchy rules

- one page title per screen
- one dominant primary CTA per task
- marketing display typography never appears inside authenticated workflows
- status information is visually quieter than actions
- destructive actions separated from ordinary actions
- evidence always paired with provenance where available

## Implementation acceptance gate

Before rebuilding the production UI, the design should prove these flows at desktop + mobile sizes:

1. Landing → Sign up
2. Sign in → Dashboard
3. Dashboard → New Review
4. Upload → Processing → Results
5. Results → Evidence Viewer
6. Results → Source Intelligence
7. Results → Citation Intelligence
8. History → Delete review
9. Privacy → Export/delete account

Only after these flows are visually and interaction-wise stable should the current frontend be refactored into Averis 2.0.