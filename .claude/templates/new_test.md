# New Test Scenario Checklist

Use this checklist for unit, integration, end-to-end, contract, load, or security
test scenarios. Keep test data safe, deterministic, and representative of the
behavior being protected.

## Before Starting

- [ ] Test objective names the exact behavior and risk being verified.
- [ ] Test type is identified: unit / integration / end-to-end / contract / load / security.
- [ ] Expected behavior and failure condition are explicit.
- [ ] Test environment is functional and safe.
- [ ] Active environment is confirmed; destructive tests never target staging or production without explicit authorization.

## Implementation

- [ ] Test file follows established naming, directory, and framework conventions.
- [ ] Test is isolated and does not depend on uncontrolled shared state.
- [ ] No real secrets, credentials, personal data, or production records are used.
- [ ] External systems are mocked, sandboxed, or explicitly covered by an integration test.
- [ ] Setup and teardown are complete and safe on failure.
- [ ] Assertions are specific and meaningful rather than merely checking that no error was thrown.
- [ ] The test covers the boundary, authorization, and error behavior relevant to the scenario.

## Completion

- [ ] Test fails for the intended reason before the implementation change when it is a regression test.
- [ ] Test passes reliably after the change.
- [ ] Test is included in the standard suite.
- [ ] Run the test at least three times when flakiness is plausible.
- [ ] Update `state/CURRENT_STATUS.md` and relevant task acceptance evidence.
