# Fix 2: WhatsApp composer rich history overview formatting

## Change

Formatted `apps/web/src/components/overview-pages.tsx` with the repository's
Biome formatter. The change only corrected indentation of JSX `info` props; it
does not change behavior.

## Verification

- `npx --yes pnpm@10.12.4 exec biome check apps/web/src/components/overview-pages.tsx`
  passed: `Checked 1 file in 11ms. No fixes applied.`
- An earlier `npx --yes pnpm@10.12.4 typecheck` run passed (`tsc -b --pretty false` exited 0).
  The final rerun now exits 1 on unrelated `apps/web/src/components/message-composer.tsx`
  errors (`React` is imported as type-only but used as a value at lines 41-53).
- Full-repository output was captured at `/tmp/qa-fix2.txt` as requested.

The exact full-repository command,
`npx --yes pnpm@10.12.4 exec biome check`, exited 1 in this workspace because
of diagnostics outside the scoped file: API `useLiteralKeys` and
`useOptionalChain` findings, an unused suppression, `.tmp/playwright-t5.config.ts`,
system `/etc` and `/usr/share` files, and `tests/task-13-analytics-db-fixture.ts`.
No diagnostic references `overview-pages.tsx` after the fix.
