# T2 Analytics tooltip verification

## Scope

- Replaced the bespoke metric info drawing with the canonical Lucide Info geometry at 16px.
- Preserved the existing `Metric` rendering and tooltip hover, focus, click-pin, pill, and focus-ring behavior.
- Added `aria-describedby` while open and Escape/blur close behavior.

## Verification

- `npx --yes pnpm@10.12.4 exec biome check apps/web/src/components/ui.tsx` — passed.
- `npx --yes pnpm@10.12.4 exec biome check apps/web/src/styles.css apps/web/src/components/ui.test.tsx tests/tooltip.spec.ts` — passed.
- `npx --yes pnpm@10.12.4 exec tsc -b --pretty false` — passed.
- `npx --yes pnpm@10.12.4 exec vitest run apps/web/src/components/ui.test.tsx` — could not discover the test because the repository Vitest `include` only allows `tests/**/*.test.ts` and `apps/web/src/lib/**/*.test.ts`.
- `npx --yes pnpm@10.12.4 exec playwright test tests/tooltip.spec.ts --project=chromium` — blocked because the repository Playwright config defines no `chromium` project.
- A temporary test-only Playwright config that adds the `chromium` project and collects the requested root-level test ran `2 passed` in headed Chromium under `xvfb-run`; global setup/teardown completed.
- A temporary Vitest config collected `apps/web/src/components/ui.test.tsx`; `1 passed`.

## Manual QA

- Headed Chromium captured `/tmp/qa-t2.png` (1280x720) with the tooltip open.
- Headed Chromium wrote `/tmp/qa-t2.txt`; it records `aria-expanded="true"`, matching `aria-controls`/`aria-describedby` IDs, preserved `aria-label="More information"`, and `role="tooltip"`.
