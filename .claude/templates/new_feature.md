# New Feature Implementation Checklist

Use this checklist for any new user-facing or system-facing capability. Copy it
into the task notes when useful, and keep the task's acceptance criteria in
`state/TASK_QUEUE.md`.

## Before Starting

- [ ] Task is defined in `state/TASK_QUEUE.md` with measurable acceptance criteria.
- [ ] All task dependencies are complete.
- [ ] Relevant PRD, issue, architecture, API, and operational documents are read.
- [ ] Existing verification checks pass in the identified development environment.
- [ ] Active environment is identified and confirmed safe for implementation.

## Design

- [ ] Feature scope lists every file, interface, data shape, and boundary expected to change.
- [ ] Success, failure, boundary, and rollback behavior are defined.
- [ ] Security implications are identified before implementation begins.
- [ ] A new dependency, schema change, or architectural decision is surfaced for explicit user confirmation first.
- [ ] Any proposed dependency has a vulnerability check planned and logged.
- [ ] Compatibility and migration impact are understood.

## Implementation

- [ ] Code follows `CODING_STANDARDS.md` and established repository patterns.
- [ ] External input is validated at the boundary before business logic.
- [ ] Every expected failure path has deliberate handling.
- [ ] Logs contain useful redacted context and no secrets or sensitive values.
- [ ] Configuration uses the approved environment mechanism rather than hardcoded environment branches.

## Security Review

- [ ] No secrets, tokens, credentials, or personal data are hardcoded or exposed.
- [ ] Authentication and authorization checks are enforced with a default-deny posture.
- [ ] Dependency vulnerability checks are complete and logged in `state/DECISIONS_LOG.md`.
- [ ] Error responses and logs reveal no internal stack traces, paths, or sensitive data.
- [ ] `.env.example` is updated for any new required variable, and secret files remain ignored.
- [ ] Development conveniences are not enabled by production configuration.

## Testing

- [ ] Unit tests cover new business logic and important boundaries.
- [ ] Integration tests cover changed persistence or external-service behavior.
- [ ] Authorization, validation failure, and sensitive-data cases are tested where applicable.
- [ ] New and existing tests pass.
- [ ] Relevant lint, type, static-analysis, and security checks pass.

## Completion

- [ ] Task is marked `DONE` in `state/TASK_QUEUE.md`.
- [ ] `state/CURRENT_STATUS.md` has the verified result and session summary.
- [ ] Significant decisions are logged.
- [ ] Relevant README, standards, environment, API, and operational documentation is current.
