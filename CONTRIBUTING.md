# Contributing to RelayNest

Thanks for helping. This project is strict about scope and secrets — the
checklist below keeps every contribution mergeable on the first pass.

## Ground rules

- Keep the locked boundaries: one tenant, hard Personal/Business scope
  separation, Admin-created users, explicit session grants, server-side WAHA
  credentials, one-time text schedules, human-approved AI suggestions. No
  media, campaigns, broadcasts, autonomous sending, scraping, spam, stealth,
  public registration, or publicly exposed WAHA.
- Never put secrets or sensitive content in code, fixtures, logs, browser
  storage, evidence, or documentation. Key material travels only as Docker
  secret file paths, never as values.
- Match existing patterns before inventing new ones. Small, focused changes
  merge faster than refactors.
- Never suppress type errors (`as any`, `@ts-ignore`) and never delete a
  failing test to make a suite pass.

## Development setup

You need Docker Engine with Compose v2 plus Node `>=22.23.1 <23` and pnpm
`10.12.4`. For the disposable app stack, follow the README Fast development
section (`dev:bundled` on port 8081). For code iteration without Compose,
provide your own PostgreSQL via `DATABASE_URL` as documented in
`.env.example` and run the package `dev` scripts.

## Workflow per change

1. Every behavior change needs regression coverage in `tests/`.
2. Run only the fast verifier while iterating:

```bash
npx --yes pnpm@10.12.4 feature \
  --test-file tests/<regression>.test.ts \
  --test-name "<focused behavior>" \
  --paths <changed-source> <regression-test>
```

3. Before opening a pull request, run the explicit release checks from the
   README (lint, typecheck, test, test:e2e, audit, docs:check) and keep the
   tree green.

## Commit and pull-request style

- Keep commits atomic with semantic Conventional Commit subjects, for example
  `fix(auth): preserve unavailable WAHA errors` or
  `feat(users): enable disabled accounts`.
- Inspect `git status` and the staged diff before committing; stage only
  intended files and never commit secrets, generated runtime artifacts, or
  `.secrets/`.
- Describe what changed, how it was verified (commands plus results), and any
  residual risk. Link the issue the work resolves.
- Documentation changes that touch `README.md` or `docs/` must keep
  `docs:check` green; do not add release-style completion claims.

## Reporting security issues

Do not open a public issue for vulnerabilities. Use GitHub private
vulnerability reporting on this repository instead; see `SECURITY.md`.
