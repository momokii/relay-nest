# How to Resume Work

Execute this protocol at the start of every session. Complete each step in order;
do not begin implementation from memory or from the user's latest message alone.

## Step 1: Read the Orientation

Read `.claude/README.md`.

Understand the current repository purpose, stack, structure, entry points, and the
locations of the project state and standards.

## Step 2: Confirm This Resume Protocol

Continue with this file, `.claude/HOW_TO_RESUME.md`, as the second document in the
startup sequence. The remaining steps below define the actions to perform after
the orientation and resume instructions are loaded.

## Step 3: Read Current Status

Read `.claude/state/CURRENT_STATUS.md`.

Identify what is complete, what is in progress, what is blocked, open questions,
known security notes, and the latest session summary.

Refresh this reading against verified source, tests, evidence, and worktree
status. If state wording conflicts with those facts, treat verified facts as
authoritative and record the discrepancy in the state files.

## Step 4: Read the Task Queue

Read `.claude/state/TASK_QUEUE.md`.

Select the next unblocked task, confirm its dependencies, and check its acceptance
criteria before making changes.

After selecting it, refresh the queue if completed work or new blockers are
visible in verified source/evidence; do not mark the protected plan or execution
ledger complete as a substitute.

## Step 5: Read Agent Rules

Read `.claude/AGENT_RULES.md`.

Re-internalize the behavioral, security, environment, escalation, and self-update
rules before touching files or running commands.

## Step 6: Read Coding Standards

Read `.claude/CODING_STANDARDS.md`.

Apply the current naming, structure, error-handling, testing, documentation, and
verification conventions before writing implementation code.

## Step 7: Read Security Standards

Read `.claude/SECURITY_STANDARDS.md`.

Re-internalize requirements for secrets, input validation, authentication,
authorization, dependencies, external communication, data handling, and containers.

## Step 8: Identify the Active Environment

Check `APP_ENV` or the project's equivalent without exposing secret values. Consult
`.claude/ENVIRONMENT_GUIDE.md` if the environment or permitted actions are unclear.
Treat an unknown context as non-development until confirmed.

## Step 9: Read Task-Relevant Documentation

Read the PRD section, architecture document, API contract, issue, design note, or
operational documentation directly relevant to the selected task. Do not infer
missing requirements when the user or project documentation can clarify them.

## Step 10: Verify the Environment

Run the project's health-check or startup command in the active environment. The
command is not known yet; replace this instruction with the real verified command
once the project has one.

## Step 11: Confirm No Regressions

Run the existing test suite before writing new code. For this workspace use
`pnpm test` or the narrowest relevant Vitest command, and record the exact
result in the live state/evidence.

## Step 12: Execute and Close the Session

Implement the task, run focused and full verification, perform the applicable
security review, report results, and update all relevant `.claude/` state and
standards files before closing the session. The closeout refresh must include
worktree truth, exact verification, remaining blockers, and cleanup of ports,
containers, temporary files, and build/debug artifacts.
