# How to Resume Work

Use the short path below for ordinary feature work. Use the full protocol only
for release work, security-sensitive changes, or when the user explicitly asks
for broad verification.

## Fast path

1. Read `README.md`, `.claude/README.md`, `CONTEXT.md`, current status, and the
   task-relevant files/docs.
2. Check `git status --short` and identify the active environment without
   printing secrets.
3. Add or update the focused regression test before implementation when the
   behavior is new or broken.
4. Run the focused loop after implementation:

   ```bash
   npx --yes pnpm@10.12.4 feature \
     --test-file tests/<regression>.test.ts \
     --test-name "<focused behavior>" \
     --paths <changed-source> <regression-test>
   ```

5. Start the app for manual testing with:

   ```bash
   npx --yes pnpm@10.12.4 dev:bundled
   ```

## Full path, only when requested

Run `npx --yes pnpm@10.12.4 release` for release/final-gate work. That path
includes the full build, tests, E2E, dependency audit, repository checks, and
documentation checks. Do not run it by default for a feature.

## Safety retained on both paths

- Preserve authorization and Personal/Business scope checks, CSRF/same-origin,
  encryption, redaction, server-side WAHA credentials, internal WAHA networking,
  no-real-delivery claims, and protected plan/ledger rules.
- Update state only for durable decisions, blockers, or multi-session work.
- Clean disposable ports, containers, temporary files, and build artifacts.
