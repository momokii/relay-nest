# Bug Fix Checklist

Use this checklist to keep a bug fix minimal, reproducible, secure, and protected
against regression.

## Reproduce First

- [ ] Bug reproduces in development or another explicitly safe environment.
- [ ] Reproduction steps, inputs, versions, and environment are documented.
- [ ] Expected behavior is stated.
- [ ] Actual behavior, error, and impact are stated.
- [ ] No production data or secrets are copied into the reproduction.

## Root Cause Analysis

- [ ] Root cause is identified and documented before changing code.
- [ ] Related code paths and neighboring cases are checked for the same defect.
- [ ] Regression boundary and likely triggering inputs are understood.
- [ ] Security impact is assessed, including data exposure, authorization bypass, injection, and denial-of-service risk.
- [ ] Suspected security vulnerabilities are escalated to the user before proceeding with a normal fix.

## Fix

- [ ] Fix is minimal and targeted; unrelated refactoring is excluded.
- [ ] Fix changes only the behavior required to resolve the stated bug.
- [ ] Input validation, authorization, error handling, and logging remain secure.
- [ ] No new dependency, schema change, or architecture change is introduced without explicit confirmation.

## Verification

- [ ] Original reproduction no longer fails.
- [ ] Regression test fails before the fix and passes after it.
- [ ] Relevant edge cases are covered.
- [ ] Full test suite and applicable lint, type, static-analysis, and security checks pass.
- [ ] Pre-existing failures are separated from failures caused by this fix.

## Completion

- [ ] Root-cause insight is logged in `state/DECISIONS_LOG.md` when it affects future work.
- [ ] `state/CURRENT_STATUS.md` records the result and verification evidence.
- [ ] `state/TASK_QUEUE.md` and relevant documentation are current.
