# Agent Orientation

## Repository Purpose

This repository is the planned foundation for a self-hosted WAHA-based WhatsApp
Command Center. It will manage separate Personal and Business WhatsApp sessions,
provide authenticated multi-user access, and add durable text-message scheduling,
analytics, notifications, retention controls, and safety guardrails around WAHA.
Product implementation has not started; the decision-complete plan is in
`.omo/plans/waha-command-center.md` and is awaiting an explicit implementation
start command.

## Required Orientation Sequence

The first file any agent reads is this README. Then follow `HOW_TO_RESUME.md`,
which repeats this entry point as Step 1 and defines the complete ordered protocol:

1. Read this `README.md` to orient yourself.
2. Read `HOW_TO_RESUME.md` for the session protocol.
3. Read `state/CURRENT_STATUS.md` for the exact current state.
4. Read `state/TASK_QUEUE.md` and identify the next unblocked task.
5. Read `AGENT_RULES.md` and apply its behavioral guardrails.
6. Read `CODING_STANDARDS.md` before inspecting or writing implementation code.
7. Read `SECURITY_STANDARDS.md` before handling input, identity, communication, or storage.
8. Identify the active environment using `ENVIRONMENT_GUIDE.md`.
9. Read task-specific product, architecture, API, or operational documentation.
10. Verify that the environment and existing checks are functional before editing.

Do not skip earlier steps because a task appears small. The state files and rules
are the source of truth for what may safely happen next.

## Where Project State Lives

- `state/CURRENT_STATUS.md` records completed work, active work, blockers, open questions, and the latest session summary.
- `state/TASK_QUEUE.md` is the ordered backlog. Add measurable acceptance criteria before starting a task.
- `state/DECISIONS_LOG.md` records significant technical, product, security, and architectural decisions with their rationale.

## Standards and Environment References

- `AGENT_RULES.md` contains mandatory behavior for every session.
- `CODING_STANDARDS.md` contains the current coding conventions and verification expectations.
- `SECURITY_STANDARDS.md` contains mandatory security requirements.
- `ENVIRONMENT_GUIDE.md` defines development, staging, and production behavior.
- `templates/` contains checklists for common work types.
- `.omo/plans/waha-command-center.md` contains the approved-scope candidate plan, WAHA capability evidence, dependencies, and executable acceptance checks.
- `.omo/drafts/waha-command-center.md` contains the durable planning decisions and approval gate.

## Self-Update Directive

At the end of every working session, update the relevant `.claude/` files before
closing. Replace general statements with verified project-specific facts as the
stack, patterns, architecture, environments, and decisions become known. In
particular, update this README whenever the repository purpose, structure, entry
points, or orientation sequence changes. Never preserve stale guidance merely
because it was part of the initial scaffold.

The standards began general and now include the confirmed product boundary where
appropriate. They remain living documentation, not a one-time setup artifact;
keeping them accurate is part of implementation.
