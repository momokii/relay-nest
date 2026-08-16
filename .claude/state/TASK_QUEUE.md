# Task Queue

The product brief and planning decisions are now established. The detailed
implementation backlog lives in `.omo/plans/waha-command-center.md`; this file
tracks the top-level gate so a fresh agent knows whether execution may begin.
Keep tasks ordered by dependency and do not start implementation while the gate is
blocked.

## Task Template

Use this format for every task added:

| Field | Value |
|---|---|
| Task ID | `TASK-001` |
| Name | A concise task name |
| Priority | High / Medium / Low |
| Status | TODO / IN PROGRESS / DONE / BLOCKED |
| Complexity | S / M / L |
| Depends On | Task IDs that must be complete first, or `None` |
| Scope | Exact files, behavior, and boundaries included |
| Acceptance Criteria | Measurable conditions that define done |
| Security Concerns | Task-specific security risks and checks, or `None` |

## Current Queue

| Field | Value |
|---|---|
| Task ID | `TASK-001` |
| Name | Execute the WAHA Command Center implementation plan |
| Priority | High |
| Status | BLOCKED — awaiting explicit user start command |
| Complexity | L |
| Depends On | `.omo/plans/waha-command-center.md` approval gate |
| Scope | Execute the 16 planned tasks across WAHA research artifacts, secure foundation, session parity, text scheduling, analytics, notifications, Compose deployment, and final verification |
| Acceptance Criteria | All plan tasks and F1–F4 gates pass with evidence; no unresolved Must-have or security blocker |
| Security Concerns | WAHA credentials, encrypted message/contact data, cross-session authorization, webhook authenticity, duplicate sends, Docker exposure, retention/purge, and unofficial-client ban risk |
