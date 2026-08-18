# RelayNest live Compose visual and interaction audit

**Date:** 2026-08-18  
**Target:** `http://127.0.0.1:38080` (default `relaynest-dev` Compose stack)  
**Browser:** Playwright MCP over the existing CDP browser at `127.0.0.1:9222`; Chrome/Chromium `151.0.7922.34`  
**Mode:** Read-only audit; no source, Compose, design, state, plan, ledger, or secret files were edited.

## Executive result

The live default stack is reachable and renders the authentication boundary at all
three requested widths. The authenticated dashboard could not be exercised safely:
the database guard returned `users=1`, so the requested temporary Admin creation
condition was false, and no usable credential fixture exists for the sole existing
user. I did not guess credentials, brute-force login, reset the volume, or use the
separate `38081` QA stack as a substitute.

The live auth boundary has no horizontal overflow and has good semantic labeling,
keyboard focus styling, and measured contrast. It does have a visible desktop
heading wrap, an asymmetric/underfilled auth column, and a contradictory error
message after the safe existing-user bootstrap conflict.

## Reproduction and safety receipt

1. Confirmed default Compose API and web services healthy; web is published on
   `38080`, API on `33000`.
2. Read-only database guard before interaction:

   ```text
   users=1
   user_roles=2
   auth_sessions=1
   ```

3. Opened the target URL in Playwright Chromium. `/auth/me` returned `401`, and
   the login boundary rendered.
4. Switched to the first-run form and submitted a generated dummy probe. The API
   returned `409`; this did not create a user or session.
5. Read-only database guard after interaction returned the same counts:

   ```text
   users=1
   user_roles=2
   auth_sessions=1
   ```

6. No real WAHA credentials were used. The default Compose configuration points
   at the invalid placeholder `https://waha.example.invalid`, and the default
   stack's WAHA profile was not started or published.

## Evidence index

### Live screenshots

- `auth-375-viewport.png` — login boundary at 375x900.
- `bootstrap-375.png` — first-run form at 375x900.
- `auth-768.png` — login boundary at 768x900.
- `auth-1280-viewport.png` — login boundary at 1280x900.

The browser screenshot helper timed out twice while waiting for fonts on the first
1280px error-state capture. The successful 1280px login viewport capture is kept;
the error state is represented by the accessibility snapshot and metrics below.

### Accessibility snapshots and DOM metrics

- `auth-375-accessibility.yml`, `auth-375-metrics.json`
- `bootstrap-375-accessibility.yml`
- `auth-768-accessibility.yml`, `auth-768-metrics.json`
- `auth-1280-accessibility.yml`, `auth-1280-metrics.json`
- `bootstrap-1280-error-metrics.json`

## Prioritized findings

### P0 — Authenticated dashboard audit blocked by unsafe account precondition

**Live evidence:** the database contains one existing user, while the only
available bootstrap path is for an empty database. No credential file exists in
`.tmp/playwright`, and the repository only contains isolated test fixtures.

**Impact:** shell/navigation, mobile drawer, scope switching, dashboard pages,
loading/empty/unavailable panels, and authenticated keyboard flows remain
unverified against the required default stack. This is an audit blocker, not a
claim that those surfaces are broken.

**Recommended fix:** provide a valid non-secret local Admin fixture for this
retained default database, or rerun the audit only after an explicit guarded
environment reset makes `users=0`. Do not add an auth bypass or reuse the
separate `38081` stack.

### P1 — Existing-user bootstrap conflict produces contradictory copy

**Live reproduction:** `POST /auth/bootstrap` returned HTTP `409`. The page
continued to show `The server denied this scoped request.` above the form, while
the form `role=alert` showed `The server could not complete this request.`

**Source:** `apps/web/src/dashboard-http.ts:3-6` classifies only `401/403` as
`denied`; `apps/web/src/dashboard-api.ts:190-201` then maps `409` to generic
`error`; `apps/web/src/components/auth-boundary.tsx:23-26,89-90` renders both
messages in separate regions.

**Impact:** first-run users receive two different interpretations of the same
safe, expected state. The alert is generic and does not explain that the system
is already configured.

**Recommended fix:** give `409 /auth/bootstrap` a dedicated `already-configured`
classification and copy such as “RelayNest is already configured. Sign in with
an existing Admin account.” Keep the message in one clearly associated live
region and do not expose server internals.

### P1 — Auth form width shifts after an error response

**Live evidence:** before the 409 probe, the 1280px login form and controls were
245px wide. After the error, the first-run form expanded to 326px because the
alert became part of the grid's intrinsic sizing. The error snapshot records the
expanded form at `box=416,334,326,363`.

**Source:** `apps/web/src/styles.css:668-676` defines the auth grid without an
explicit form width or a zero-minimum grid track; `apps/web/src/styles.css:683-686`
styles the message, and `apps/web/src/components/auth-boundary.tsx:89-90`
conditionally inserts the alert below the submit button.

**Impact:** an expected error causes a layout shift and changes the apparent
control width. This is especially distracting in an authentication boundary.

**Recommended fix:** constrain the auth form and its controls to a deliberate
tokenized width (for example `width: min(100%, ...)`) and allow the alert to wrap
inside that width rather than changing the grid track. Verify both login and
bootstrap error states at all three widths.

### P2 — Desktop auth heading wraps despite available viewport space

**Live evidence:** at 1280px, “Sign in to RelayNest” wraps as “Sign in to” /
“RelayNest” in `auth-1280-viewport.png` and the accessibility snapshot records
the heading at `448x105.6px`.

**Source:** `apps/web/src/styles.css:678-681` applies the display clamp, which
reaches 48px at 1280px; the auth container is 512px wide with 32px padding at
`styles.css:668-676`, leaving only a 448px content track.

**Impact:** the login title reads like a narrow mobile composition on desktop and
creates avoidable vertical weight.

**Recommended fix:** set a tokenized max-inline-size or responsive auth title
scale that keeps this short title on one line at wide widths, while preserving
the intentional two-line treatment where it is actually needed on compact
screens.

### P2 — Auth content is left-anchored with a large unused right rail

**Live evidence:** at 375px the form starts at x=32 and controls are 245px wide;
at 1280px the centered 512px boundary begins at x=384 but content starts at
x=416 and the controls remain 245px wide before the error state. The screenshot
shows substantially more empty space to the right than to the left.

**Source:** `apps/web/src/styles.css:668-676` uses `place-items: start` and the
form has no explicit width. This makes the intrinsic form width determine the
visible content column.

**Impact:** the auth surface feels accidentally narrow rather than intentionally
quiet, and the error-state width change makes the asymmetry unstable.

**Recommended fix:** choose one explicit auth composition—either a centered,
tokenized form column or a deliberately editorial split—and encode its width and
alignment instead of relying on intrinsic grid sizing.

## Verified positives

- No horizontal overflow at 375, 768, or 1280px: `scrollWidth === clientWidth`
  for document and body in every metrics capture.
- The page exposes a `main` landmark and explicit Email, Password, and Display
  name labels in the accessibility snapshots.
- The 375px tab sequence reaches Display name/Email/Password/submit/toggle in
  order in bootstrap mode; no hidden dashboard controls are in the unauthenticated
  tab order.
- Focus styling is present: focused input computed style includes the amber-soft
  3px focus ring (`rgb(59, 43, 24) 0 0 0 3px`).
- Measured contrast in the live dark theme: muted message `8.55:1`, labels
  `15.83:1`, and primary button text/background `6.52:1`.
- The source review shows explicit mobile drawer semantics (`aria-hidden`,
  `inert`, Escape handling, and trigger focus return) in
  `apps/web/src/components/app-shell.tsx:44-65,121-127`; this is source evidence,
  not an authenticated live verification.

## Not verified because of P0

The following required authenticated surfaces were not claimed as exercised:

- shell rail, mobile drawer open/close, Escape, and focus return;
- Personal/Business scope selector and scope-isolated page contents;
- Overview, Sessions, Contacts, Send, Schedule, Analytics, Notifications,
  Retention, Users, and Settings pages;
- loading, ready-empty, unavailable, denied, and backend error panels;
- authenticated sign-out, destructive confirmation, and provider-unavailable
  interactions;
- dashboard screenshots and accessibility snapshots at 375/768/1280.

Source inspection found explicit state components and routes, but source presence
is not a substitute for the requested live interaction audit.

## Cleanup receipt

- No temporary Admin was created because the precondition was `users=1`, not zero.
- Dummy form values were cleared from the browser page after the conflict probe.
- The default `relaynest-dev` Compose stack remains running and healthy.
- The separate `relaynest-compose-external-qa` Compose stack remains running and
  was not used as a substitute for the target dashboard.
- Intentional audit deliverables remain in this directory; no source, Compose,
  state, plan, ledger, volume, or secret artifacts were removed or changed.
