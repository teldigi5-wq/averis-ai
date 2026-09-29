# Averis 2.0 — Design System Foundation

## Design intent

Averis should feel like professional academic/research software: calm, precise, trustworthy, and evidence-oriented.

The visual system should not imitate another company. It should use enterprise product qualities—clarity, consistency, accessibility, responsiveness, and strong information hierarchy—while keeping the existing Averis dark ink + cyan/teal identity.

## Visual principles

- dark ink foundation rather than pure black
- neutral surfaces with one distinctive Averis accent
- restrained gradients
- fine borders
- limited elevation
- 8–12px radius system
- strong type hierarchy
- generous but intentional whitespace
- semantic color only where meaning exists
- no decorative glow as a primary hierarchy device
- no excessive card nesting
- no random animation

## Color tokens

### Core

```text
--av-bg:              #07111B
--av-bg-elevated:     #0A1622
--av-surface-1:       #0D1A26
--av-surface-2:       #112230
--av-surface-3:       #162A39
--av-border-subtle:   #203746
--av-border-strong:   #315063

--av-text-primary:    #F5F8FB
--av-text-secondary:  #B6C4CF
--av-text-muted:      #8193A2
--av-text-disabled:   #60717E

--av-accent:          #62D7CD
--av-accent-strong:   #39C8BE
--av-accent-soft:     rgba(98, 215, 205, .12)
--av-accent-border:   rgba(98, 215, 205, .28)
```

### Semantic

```text
--av-success:         #58C98D
--av-warning:         #E6B85C
--av-danger:          #F07788
--av-info:            #69B8F2
```

Use semantic colors for meaning, never as decorative accents.

## Typography

Preferred family: Inter or a metrically stable system sans fallback.

### Scale

```text
Display XL  56/60  700   marketing only
Display L   44/48  700   marketing sections
H1          32/38  700   application page title
H2          26/32  700
H3          20/26  650
Title       16/22  650
Body L      16/26  400
Body        14/22  400
Small       13/19  400
Caption     12/16  500
Overline    11/14  700   uppercase, tracking .08em
```

Rules:
- marketing copy may use larger display styles
- authenticated application titles must not compete with marketing display typography
- avoid bold body paragraphs
- use muted text only for secondary information, never for critical instructions

## Spacing

4px base grid.

```text
--space-1: 4px
--space-2: 8px
--space-3: 12px
--space-4: 16px
--space-5: 20px
--space-6: 24px
--space-8: 32px
--space-10: 40px
--space-12: 48px
--space-16: 64px
```

Application density target:
- standard component gap: 12–16px
- card inner padding: 16–24px
- page section gap: 24–32px
- marketing section gap: 64–96px

## Radius

```text
--radius-sm: 8px
--radius-md: 10px
--radius-lg: 12px
--radius-pill: 999px
```

Pills are for tags/status only. Do not make ordinary cards/buttons pill-shaped by default.

## Borders and elevation

Default surface border:

```text
1px solid var(--av-border-subtle)
```

Focused/selected border:

```text
1px solid var(--av-accent-border)
```

Elevation should be subtle:

```text
--shadow-1: 0 8px 24px rgba(0,0,0,.16)
--shadow-2: 0 14px 36px rgba(0,0,0,.22)
```

Most app cards should use border + background without shadow.

## Grid

### Desktop

- max content width: 1440px
- sidebar: 240–264px
- page gutters: 24–32px
- 12-column content grid

### Tablet

- 8-column grid
- gutters: 20–24px
- collapsible sidebar

### Mobile

- 4-column grid
- gutters: 16px
- single-column primary content

## Component system

### Button

Variants:
- Primary
- Secondary
- Ghost
- Destructive
- Icon

States:
- default
- hover
- focus-visible
- active
- loading
- disabled

Primary buttons use accent fill with dark text only when contrast is sufficient.

### Input / Textarea

Requirements:
- visible label
- helper/error text region
- 44px minimum touch height
- clear focus ring
- no placeholder-only labeling

### Select

Same height/label/error behavior as input.

### Search

Use a dedicated search field pattern with optional keyboard shortcut hint, not a generic input pretending to be navigation.

### Card

Use card surfaces only when grouping meaningfully related information.

Avoid card-inside-card unless the inner surface represents a distinct interactive item.

### Badge

Categories:
- neutral status
- success
- warning
- danger
- informational

Badges are metadata, not buttons.

### Tabs

Use for peer views of the same object (for example Passages / Documents), not for primary application navigation.

### Modal / Drawer / Bottom sheet

Desktop modal for focused interruptions.
Tablet/mobile drawer or bottom sheet for contextual evidence and filters.

### Tooltip

Supplementary only. Never hide critical instructions exclusively in a tooltip.

### Toast

Use for transient confirmation. Errors that block work must appear inline near the relevant workflow.

### Table

Desktop:
- sticky header when long
- clear row hover/focus
- sortable state when applicable

Mobile:
- convert to stacked rows/cards
- preserve labels

### Progress

Use determinate progress when a real percentage/stage exists.
Otherwise show staged processing messages rather than a fake percentage.

### File Upload

Required content:
- drag/drop affordance
- click/browse affordance
- supported file types
- max file size
- selected filename
- selected state
- extracting state
- success state
- validation/error state

### Navigation

Desktop:
- persistent sidebar
- selected item has accent background/border and distinct icon

Mobile:
- bottom navigation limited to 5 primary destinations

### Avatar / Account menu

Account metadata belongs together. Status information should not visually compete with destructive/session actions.

### Empty State

Every empty state should answer:
1. What is missing?
2. Why does it matter?
3. What should I do next?

### Error State

Every blocking error should include:
- what happened
- what the user can do
- retry path where possible
- request ID only when useful for support

## Iconography

Use one icon system with consistent:
- stroke weight
- viewBox
- optical size
- corner treatment

Semantic mapping:
- Dashboard — grid/home
- New Review — file plus / scan
- Documents — document stack
- Sources — magnifying glass
- Citations — quote/checklist
- History — clock/history
- Privacy — shield/lock
- Settings — sliders/gear
- Help — question circle

Avoid symbolic text glyphs as primary icons.

## Data visualization

Use charts sparingly.

Suitable visualizations:
- similarity breakdown
- source contribution
- citation health
- processing stages

Rules:
- always provide exact values in text
- color alone must not encode meaning
- no decorative gauges without actionable interpretation

## Motion

Motion communicates state, not decoration.

Allowed:
- 120–180ms hover/focus transitions
- 180–240ms drawers/panels
- subtle progress transitions

Avoid:
- looping ambient motion in authenticated workflows
- parallax
- cursor effects
- animated gradients behind reading-heavy content

Respect `prefers-reduced-motion`.

## Accessibility rules

- keyboard operable navigation and controls
- `:focus-visible` on every interactive element
- minimum 44x44px touch target for primary mobile actions
- semantic heading order
- semantic button vs link behavior
- descriptive `aria-label` only when visible labels are absent
- form errors associated with fields
- status changes announced where appropriate
- contrast checked for normal text, large text, focus indicators, and controls

## Responsive behavior rules

### Sidebar

Desktop: persistent.
Tablet: collapsible.
Mobile: replaced by bottom nav + account sheet.

### Evidence Viewer

Desktop: split pane.
Tablet: primary document with evidence drawer.
Mobile: document stack + bottom sheet evidence.

### Tables

Desktop: table.
Mobile: structured stacked list.

### Filters

Desktop: inline/side panel.
Mobile: filter sheet.

## Naming conventions

Prefer component names that describe product meaning:
- EvidenceCard
- ReviewSummary
- CitationIssueRow
- SourceResultCard
- UploadDropzone
- ProcessingSteps
- PrivacyNotice

Avoid visual-only names such as `BlueCard` or `RoundedBox`.

## Implementation direction

The current frontend should migrate gradually toward:

- shared tokens
- reusable primitives
- feature-level components
- route-level composition

Recommended future folder shape:

```text
apps/web/
  app/
    (marketing)/
    (app)/
  components/
    ui/
    layout/
    review/
    evidence/
    sources/
    citations/
  styles/
    tokens.css
    components.css
  lib/
```

Do not perform a large visual refactor until the architecture and screen specifications are accepted.