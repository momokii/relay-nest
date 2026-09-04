# T9 — Composer, tooltip, and sent-history accessibility

## Scope

This evidence records the T9 accessibility and authorization polish. Values that
could identify users, recipients, sessions, providers, message content, or
credentials are omitted.

## Implemented checks

- The message textarea has an explicit accessible name and a stable
  `aria-describedby` relationship to its character-limit/helper text.
- The formatting region retains `role="toolbar"` and named controls for every
  formatting action.
- `InfoHint` exposes its tooltip through `role="tooltip"` and
  `aria-describedby` while open, advertises Escape as its dismissal shortcut,
  and removes the relationship on dismissal.
- Sent history uses a semantic table with a scope-specific accessible name,
  column headers, and keyboard-reachable pagination controls.
- Existing global `:focus-visible` rings and reduced-motion media rules remain
  active for controls, transitions, and entry animations.
- Sent-history API rejects callers without a role in the requested account
  scope before repository access or decryption. Repository rows remain
  grant-filtered by user, session, and matching account scope.

## Verification

- `npx --yes pnpm@10.12.4 exec vitest run apps/api/src/sent-history.test.ts -t "scope"`
  — passed (1 test).
- `npx --yes pnpm@10.12.4 exec vitest run apps/api/src/sent-history.test.ts`
  — passed (8 tests).
- `npx --yes pnpm@10.12.4 typecheck` — passed.
- Scoped Biome check for changed source/tests — passed.
- `git diff --check` — passed.
- Web production build — passed.
- Full repository `biome check` was attempted and remains blocked by existing
  diagnostics outside this change, including temporary historical test config,
  unrelated source formatting, and host `/etc` permission/format diagnostics.

The requested Playwright invocation was attempted with a temporary Chromium
configuration, but the repository global setup could not start in this
environment (`webServer` exited with code 1). No browser pass, axe result, or
headed screenshot is claimed. `/tmp/qa-t9.png` and `/tmp/qa-t9.txt` were not
fabricated.

## Security notes

The API regression asserts a missing scoped role returns HTTP 403 and that the
repository is not queried. No plaintext, secret, prompt, token, or raw provider
error was recorded in this artifact.
