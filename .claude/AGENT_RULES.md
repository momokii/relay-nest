# Agent Rules

These rules apply to every agent in every session. Treat them as non-negotiable
operating constraints. When a rule conflicts with an assumption or a shortcut,
stop and follow the rule.

## Session Start — Mandatory Before Any Action

- Read `README.md` first; it is the mandatory entry point for every session.
- Immediately afterward, read `HOW_TO_RESUME.md` before doing anything else.
- Read `state/CURRENT_STATUS.md` to understand the exact current state.
- Read `state/TASK_QUEUE.md` to identify the next task.
- Read `CODING_STANDARDS.md` and internalize its conventions before writing code.
- Read `SECURITY_STANDARDS.md` and internalize its requirements before writing code.
- Identify the active environment before running any command; consult `ENVIRONMENT_GUIDE.md` when uncertain.
- Confirm that the working environment and existing verification commands are functional before writing code.

## During Implementation

- Keep every change within the scope of the current task.
- Never delete or overwrite an existing file without explicit user instruction.
- Surface a proposal and receive explicit confirmation before introducing a dependency, changing a schema, or making an architectural decision.
- Preserve the zero-regression rule: existing passing tests must remain passing after every change.
- Follow `CODING_STANDARDS.md`; log any new pattern or convention in `state/DECISIONS_LOG.md` before adopting it broadly.
- Prefer the smallest change that fully satisfies the acceptance criteria.
- Keep implementation, documentation, tests, and state files synchronized when behavior changes.

## Security Rules — Non-Negotiable

- Never store, log, or expose secrets, tokens, credentials, or other sensitive values in source code, test fixtures, logs, or responses.
- Validate and sanitize every external input at the boundary before it reaches business logic.
- Never implement an authentication bypass as temporary work; incomplete authentication is a blocker.
- Before adding a dependency, check it for known vulnerabilities with the appropriate stack tool and document the check in `state/DECISIONS_LOG.md`.
- Consult `SECURITY_STANDARDS.md` before implementing input handling, authentication, external communication, or data storage.

## Environment Awareness Rules

- Identify the active environment before every command that can affect the project.
- In development, use the standard workflow and development-safe services.
- In staging or production, present a written plan and receive explicit confirmation before any change, migration, or destructive operation.
- Never expose debug ports, seed scripts, or development tooling through production configuration.
- Verify that `.env` is ignored before the first commit of every session.
- Consult `ENVIRONMENT_GUIDE.md` whenever environment-specific behavior is unclear.

## Session End — Mandatory Before Closing

- Update `state/CURRENT_STATUS.md` with accurate state and a session summary.
- Update `state/TASK_QUEUE.md`: mark completed tasks and add newly discovered tasks.
- Log every significant decision in `state/DECISIONS_LOG.md`.
- Update `CODING_STANDARDS.md` when new patterns or conventions are established.
- Update `SECURITY_STANDARDS.md` when new security patterns or stack guidance are established.
- Update `ENVIRONMENT_GUIDE.md` when environment configuration or commands change.
- Update `README.md` when project-level context or orientation changes.
- Record verification results, including any pre-existing failures that were not caused by the session.

## Self-Maintenance Directive

- Proactively replace general content with accurate, project-specific content as the project evolves.
- Update `CODING_STANDARDS.md` and `SECURITY_STANDARDS.md` immediately when the stack is determined.
- Update `README.md` and `state/DECISIONS_LOG.md` when architecture is decided.
- Update `ENVIRONMENT_GUIDE.md` with verified commands when Docker or another runtime setup is established.
- Treat `.claude/` maintenance as part of every task, not as optional housekeeping.

## Escalation Rule

When blocked, uncertain about scope, or facing a decision with significant
architectural, security, or user-experience impact, document the blocker in
`state/CURRENT_STATUS.md` and ask the user. Do not silently choose an irreversible
or high-impact option.
