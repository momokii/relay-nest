# RelayNest Design System

## 1. Atmosphere & Identity

RelayNest is a quiet operational command center: trustworthy under pressure,
clear when a transport is unavailable, and dense without feeling frantic. The
signature is tonal depth: cool off-white and charcoal surfaces form a measured
stack, while one amber safety accent marks decisions that deserve attention.
This is an authenticated product surface, not a marketing canvas; every state
must help an operator understand what is known, what is pending, and what still
requires human action.

## 2. Color

### Palette

| Role | Token | Light | Dark | Usage |
|------|-------|-------|------|-------|
| Surface / canvas | `--color-canvas` | `#F3F5F4` | `#161A19` | Page background |
| Surface / primary | `--color-surface` | `#FCFDFC` | `#1C2220` | Main panels and forms |
| Surface / raised | `--color-raised` | `#FFFFFF` | `#232B28` | Focused or selected panel |
| Surface / inset | `--color-inset` | `#E8ECEA` | `#111513` | Tables, code-like metadata, disabled fields |
| Text / primary | `--color-ink` | `#1C2522` | `#F0F4F2` | Headings and operational values |
| Text / secondary | `--color-muted` | `#5C6A65` | `#ABB8B2` | Explanations and secondary labels |
| Text / tertiary | `--color-subtle` | `#7E8A85` | `#7E8A85` | Metadata and unavailable hints |
| Border / default | `--color-border` | `#D5DDDA` | `#35403B` | Control outlines and dividers |
| Border / strong | `--color-border-strong` | `#AEBBB5` | `#53615A` | Focused or selected control edges |
| Accent / safety | `--color-amber` | `#A96316` | `#E0A24B` | Human decisions, warnings, primary action |
| Accent / safety-soft | `--color-amber-soft` | `#F7EBD7` | `#3B2B18` | Approval and warning backgrounds |
| Status / success | `--color-success` | `#287055` | `#6FC59A` | Acknowledged or healthy |
| Status / warning | `--color-warning` | `#A96316` | `#E0A24B` | Pending, attention, safety gates |
| Status / error | `--color-error` | `#B4493F` | `#ED8E82` | Failed, denied, destructive |
| Status / info | `--color-info` | `#3D6679` | `#8BB7CC` | Informational and unknown evidence |

### Rules

- Cool neutrals are the default. Amber is the only action accent and is never
  used as decoration or as a proxy for success.
- Status colors always appear with text labels; color alone never communicates
  delivery, authorization, or approval.
- Never display a raw secret, token, message payload, prompt, or WAHA key.
- If a new semantic role is needed, add its token here before using it.

## 3. Typography

### Scale

| Level | Token | Size | Weight | Line height | Usage |
|-------|-------|------|--------|-------------|-------|
| Display | `--type-display` | `clamp(2rem, 4vw, 3rem)` | 700 | 1.1 | Authenticated page title |
| H1 | `--type-h1` | `2rem` | 700 | 1.2 | Major section title |
| H2 | `--type-h2` | `1.5rem` | 650 | 1.3 | Panel group title |
| H3 | `--type-h3` | `1.125rem` | 650 | 1.4 | Panel title |
| Body | `--type-body` | `1rem` | 400 | 1.5 | Default content |
| Body small | `--type-small` | `0.875rem` | 400 | 1.45 | Supporting content and controls |
| Caption | `--type-caption` | `0.75rem` | 600 | 1.35 | Metadata and status labels |
| Overline | `--type-overline` | `0.6875rem` | 700 | 1.3 | Section labels, uppercase |

### Font stack

- Primary: `ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`.
- Mono: `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`.
- The product uses one sans family and one system mono family. Body text never
  drops below the small token; long headings use the display clamp to avoid
  awkward mobile wrapping.

## 4. Spacing & Layout

All spacing derives from a 4px base unit.

| Token | Value | Usage |
|-------|-------|-------|
| `--space-1` | `0.25rem` | Icon-to-label and compact gaps |
| `--space-2` | `0.5rem` | Inline groups and dense rows |
| `--space-3` | `0.75rem` | Form control inner spacing |
| `--space-4` | `1rem` | Standard panel and control spacing |
| `--space-5` | `1.25rem` | Comfortable group spacing |
| `--space-6` | `1.5rem` | Panel padding |
| `--space-8` | `2rem` | Between related panel groups |
| `--space-10` | `2.5rem` | Page section separation |
| `--space-12` | `3rem` | Major page rhythm |
| `--space-16` | `4rem` | Desktop shell breathing room |

### Grid and breakpoints

- Content max width: `80rem` with `--space-6` desktop gutters and `--space-4`
  mobile gutters.
- The shell uses a fixed `15rem` navigation rail from `48rem` upward. Below
  `48rem`, navigation becomes a disclosure drawer and the main content uses one
  column.
- Breakpoints: compact `23.4375rem` (375px evidence), tablet `48rem` (768px),
  wide `80rem` (1280px evidence).
- Operational panels use a 12-column grid at wide widths, 6 columns at tablet,
  and one column on compact screens. Rows must reflow without horizontal scroll.

## 5. Components

### App shell and navigation

- **Structure**: `header`, navigation disclosure, `nav`, `main`, and scoped
  status footer.
- **Variants**: expanded rail, mobile drawer, active destination, role-denied
  destination.
- **Spacing**: `--space-4`, `--space-6`, `--space-8`.
- **States**: default, hover, active, focus-visible, disabled, unavailable.
- **Accessibility**: named landmarks, skip link, keyboard drawer toggle, visible
  focus, `aria-current` on the active destination.
- **Motion**: drawer uses transform and opacity only; reduced motion is instant.

### Panel and state panel

- **Structure**: `section` with heading, optional context line, and content.
- **Variants**: standard, inset, warning, error, unavailable, role-denied,
  loading, empty.
- **Spacing**: `--space-4` through `--space-8`.
- **States**: tonal surface changes plus explicit status copy; no fake metrics.
- **Accessibility**: heading hierarchy and live-region messaging only for state
  changes that need announcement.
- **Motion**: optional opacity entry; no layout animation.

### Status badge and delivery state

- **Structure**: text label with a short status descriptor.
- **Variants**: healthy, pending, submitted, acknowledged, failed, unknown,
  cancelled, denied.
- **Spacing**: `--space-1`, `--space-2`.
- **States**: always text-readable and never color-only.
- **Accessibility**: status text is available to assistive technology.
- **Motion**: none by default.

### Action control and form field

- **Structure**: semantic `button`, `input`, `select`, or `textarea` with label
  and helper/error text.
- **Variants**: primary safety action, quiet action, destructive action,
  disabled, busy, invalid.
- **Spacing**: `--space-3`, `--space-4`; control minimum height is `--control-height`.
- **States**: default, hover, active, focus-visible, disabled, busy, invalid.
- **Accessibility**: labels are explicit, errors are associated, destructive
  actions require confirmation, and busy actions expose `aria-busy`.
- **Motion**: micro transitions use `--motion-micro` on transform/opacity.

### Recipient selector and contact directory

- **Structure**: one labelled recipient region per surface containing the
  manual E.164 entry field, at most one live directory choice list, the
  explicit authorized-session selector, and the server-derived consent state.
  Contacts, Send, and Scheduled surfaces each expose exactly one such region;
  there is never a second recipient control on a surface.
- **Contract rules**:
  - Exactly one selectable target is represented at any time. There is no
    multi-select, bulk, or group target.
  - Manual entry accepts a country-code E.164 number only.
  - Selecting a directory row whose chat ID derives an E.164 number
    (`@c.us`) resolves the target through the existing server
    contact-resolution seam and keeps the returned verified `contactId` as the
    submission value. Raw directory chat IDs are never submitted.
  - Directory rows whose chat ID does not derive an E.164 number
    (`@lid` or any other non-derivable individual form) stay visible but
    unavailable, with guidance to use manual E.164 entry instead. They are
    never selected, never resolved, and never serialized.
  - Group rows (`@g.us`) stay visible but disabled with an accessible
    explanation that groups cannot receive individual text. Submission
    validation rejects group chat addresses independently.
- **Variants**: idle, manual-entry focused, directory loading, directory
  error/unavailable, directory empty, row selected/resolving, resolved,
  resolution failed, consent granted/denied/opted-out, busy, denied role.
- **Spacing**: `--space-3`, `--space-4`; rows use `--space-2` gaps and respect
  the `--control-height` minimum for interactive rows.
- **States**: the selected session is always explicit and scope-filtered;
  changing scope or session clears a prior-scope session and any target that
  depended on it. Consent state is presented as server truth and is never
  inferred from a resolvable number or a working session; a server
  `consent_required` denial renders as a visible denied state, not a silent
  retry. Manual input clears any stale resolved `contactId`.
- **Accessibility**: the region has a named label; directory rows are real
  buttons whose disabled state and unavailable reason are exposed to
  assistive technology as text; resolution, consent, and denial outcomes use
  polite live-region announcements; keyboard order follows
  session → manual entry → directory → consent → submit.
- **Motion**: selection and state swaps use `--motion-micro` on
  transform/opacity only; disabled rows never animate; reduced motion renders
  state changes instantly per the motion rules in section 6.

### AI review checkpoint

- **Structure**: provenance line, suggestion content, review state, reject and
  approve controls, and a separate send action.
- **Variants**: unavailable, proposed, rejected, approved-not-sent.
- **Spacing**: `--space-4`, `--space-5`, `--space-6`.
- **States**: a suggestion is visibly `Not sent` until the existing send flow is
  separately confirmed; prompt content is never rendered or stored by the UI.
- **Accessibility**: the checkpoint is a labelled region with clear action
  names and keyboard order.
- **Motion**: none for approval semantics; only restrained opacity transitions.

## 6. Motion & Interaction

| Type | Token | Duration | Easing | Usage |
|------|-------|----------|--------|-------|
| Micro | `--motion-micro` | `120ms` | `ease-out` | Control feedback |
| Standard | `--motion-standard` | `240ms` | `ease-in-out` | Drawer and state swap |
| Emphasis | `--motion-emphasis` | `420ms` | `cubic-bezier(0.16, 1, 0.3, 1)` | Initial shell entry only |

- Only `transform` and `opacity` are animated. Layout, color semantics, and
  delivery state changes are not animated in a way that could obscure meaning.
- Every interactive element has hover, active, focus-visible, and disabled
  behavior. Focus uses `--focus-ring` and remains visible on dark and light
  surfaces.
- `prefers-reduced-motion: reduce` disables non-essential transitions and entry
  animation while preserving focus and state changes.

## 7. Depth & Surface

### Strategy: tonal-shift with restrained control borders

Surface hierarchy comes primarily from `--color-canvas`, `--color-surface`,
`--color-raised`, and `--color-inset`. Borders are reserved for controls,
table dividers, and focus/denial affordances; cards do not rely on heavy shadows.

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-control` | `0.5rem` | Inputs and standard buttons |
| `--radius-panel` | `0.75rem` | Panels and grouped surfaces |
| `--radius-pill` | `999px` | Compact status badges only |
| `--control-height` | `2.75rem` | Inputs and primary controls |
| `--focus-ring` | `0 0 0 0.1875rem var(--color-amber-soft)` | Keyboard focus |
| `--depth-rest` | `0 0.0625rem 0.125rem rgb(28 37 34 / 0.06)` | Rare raised panel support |

Avoid decorative gradients, glass effects, and pure-black shadows. Depth should
make authorization, scope, and delivery evidence easier to read, never make a
surface look promotional.
