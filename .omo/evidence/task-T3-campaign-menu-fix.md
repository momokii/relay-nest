# T3 campaign menu fix evidence

## Scope

- `apps/web/src/campaign-api.ts`
- `apps/web/src/components/campaign-list.tsx`
- `apps/web/src/components/campaign-page.tsx`

The campaign boundary now parses the subject, preview, timezone, and the
cancelled state. Titles prefer a trimmed `wahaGroupSubject` and fall back to
the legacy JID (or `Custom group` when no JID exists). The list uses the
existing `Panel` and `StatusBadge` primitives, renders the full metadata, and
only renders Cancel for non-terminal scheduled campaigns. Session names are
resolved from the already scope-filtered session prop; no authorization or
creator-scoping path was changed.

## Focused red -> green verification

The requested focused command was run against the pre-change web files first.
It failed on the title assertion because the row rendered the raw JID and the
panel eyebrow was `Durable jobs`.

After restoring the implementation, the same command passed:

```text
✓ tests/campaign-view.test.ts (7 tests | 6 skipped)
Checked 4 files in 41ms. No fixes applied.
```

The complete campaign-view regression file also passes:

```text
✓ tests/campaign-view.test.ts (7 tests)
```

Additional scoped checks:

```text
biome check apps/web/src/campaign-api.ts apps/web/src/components/campaign-list.tsx apps/web/src/components/campaign-page.tsx tests/campaign-view.test.ts
Checked 4 files in 22ms. No fixes applied.

tsc -b --pretty false
passed with no diagnostics

git diff --check
passed
```

## Manual QA

The local web endpoints were reachable on ports 5173 and 8080, but the
Playwright browser could not start because the required Chrome binary is not
installed:

```text
Chromium distribution 'chrome' is not found at /opt/google/chrome/chrome
Run "npx playwright install chrome"
```

Therefore no screenshot is claimed or attached. The rendered static-markup
regressions cover subject-vs-JID, the `Campaigns` eyebrow, all metadata,
malformed optional fields, badge tones, and scheduled-only Cancel visibility;
real browser create-campaign QA remains pending until Chrome is available.
