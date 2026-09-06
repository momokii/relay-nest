# Fix-3 — F3 browser/API failure captures

Date: 2026-09-04

## Scope

Test-only fix-forward for the F3 gaps covering composer breaklines and lists,
tooltip dismissal/accessibility, and authenticated sent-history scope isolation.
No product logic was changed.

## Exact verification invocations

- `npx --yes pnpm@10.12.4 exec vitest run apps/api/src/sent-history.test.ts`
  — **PASS**, 1 file / 9 tests. Output: `/tmp/qa-fix3.txt`.
- `npx --yes pnpm@10.12.4 exec playwright test tests/composer.spec.ts tests/tooltip.spec.ts --config=/tmp/qa-fix3-playwright.config.ts`
  — **PASS**, 6 tests. Output: `/tmp/qa-fix3.txt`.

The browser run used `/tmp/qa-fix3-playwright.config.ts`, which points the
repository's existing Playwright global setup at the root `tests/` directory;
the checked-in config intentionally limits discovery to `tests/e2e`.

## Captured evidence

| Behavior | Happy/failure assertion | Artifact |
|---|---|---|
| Enter breakline | Enter inserts `\\n` and does not submit | `/tmp/qa-fix3-composer-enter.txt`, `/tmp/qa-fix3-composer-enter.png` |
| Bullet list | Bullet toolbar inserts `- ` at the caret | `/tmp/qa-fix3-composer-bullet.txt`, `/tmp/qa-fix3-composer-bullet.png` |
| Numbered list | Numbered toolbar inserts `1. ` at the caret | `/tmp/qa-fix3-composer-numbered.txt`, `/tmp/qa-fix3-composer-numbered.png` |
| Tooltip accessibility | Open tooltip has matching `aria-describedby` and tooltip ID | `/tmp/qa-t2.txt`, `/tmp/qa-t2.png` |
| Tooltip Escape failure/dismissal | Escape removes `aria-describedby` and tooltip | `/tmp/qa-fix3-tooltip-escape.txt`, `/tmp/qa-fix3-tooltip-escape.png` |
| Tooltip blur failure/dismissal | Blur removes `aria-describedby` and tooltip | `/tmp/qa-fix3-tooltip-blur.txt`, `/tmp/qa-fix3-tooltip-blur.png` |
| Viewer without grant | Authenticated Viewer requesting an ungranted Business scope receives 403 and repository is not queried | Vitest output in `/tmp/qa-fix3.txt` |
| Cross-scope isolation | A mismatched Personal row returned for a Business request produces an empty item list | Vitest output in `/tmp/qa-fix3.txt` |

The closed-tooltip captures contain `ariaExpanded: "false"`,
`ariaDescribedBy: null`, and `tooltipCount: 0`. Composer captures contain the
observable textarea values and `submitted: false` for Enter.

## Additional checks

- `npx --yes pnpm@10.12.4 typecheck` — **PASS**.
- `npx --yes pnpm@10.12.4 exec biome check tests/composer.spec.ts tests/tooltip.spec.ts apps/api/src/sent-history.test.ts` — **PASS**.
