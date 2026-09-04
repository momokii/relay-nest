# T6 Composer toolbar verification

## Scope

Added the six-button formatting toolbar to `apps/web/src/components/message-composer.tsx`.
The toolbar is above the textarea and uses the existing button, spacing, radius,
focus, and disabled-state tokens. Bold, italic, strikethrough, and monospace use
the shared selection replacement helper; monospace inserts triple backticks.
Bullet and numbered list controls prefix the selected or insertion point with
`- ` and `1. ` respectively. Submit validation and account scope handling were
not changed.

## Regression coverage

- `tests/composer-toolbar.spec.ts`
- Selected text + Bold click produces `*hello*` and updates the strong preview.
- Keyboard focus reaches the toolbar from the textarea, and Bold with no
  selection inserts `**` and returns focus to the textarea.

## Verification log

- `npx --yes pnpm@10.12.4 typecheck` — passed.
- `npx --yes pnpm@10.12.4 exec biome check apps/web/src/components/message-composer.tsx tests/composer-toolbar.spec.ts` — passed.
- `npx --yes playwright test composer-toolbar.spec.ts --config=/tmp/playwright-t6.config.ts` — passed, 2 tests.
- `COMPOSER_QA=1 xvfb-run -a npx --yes playwright test composer-toolbar.spec.ts --config=/tmp/playwright-t6.config.ts --headed --workers=1` — passed, 2 tests.
- Headed screenshot captured at `/tmp/qa-t6.png` with Numbered list focused before Bold activation.

The repository Playwright config targets `tests/e2e`, so the focused toolbar
run used a temporary config at `/tmp/playwright-t6.config.ts` with the same
production preview server and global setup/teardown, but a test directory that
includes this focused spec.
