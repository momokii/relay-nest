# New API Endpoint Checklist

Use this checklist when adding or changing an HTTP, RPC, messaging, or equivalent
external endpoint. Adapt protocol-specific terms to the confirmed stack.

## Before Starting

- [ ] Endpoint is defined in the API contract or task specification.
- [ ] Method, route or message name, input schema, output schema, and behavior are clear.
- [ ] Authentication, authorization, ownership, and rate-limit requirements are clear.
- [ ] Active environment is identified and confirmed as development.
- [ ] Existing tests and checks pass before editing.

## Implementation

- [ ] Route or handler is registered using the established project pattern.
- [ ] Boundary validation rejects malformed, oversized, unexpected, or unsupported input.
- [ ] Business logic is separated from transport-specific handling where the architecture requires it.
- [ ] Success and error status codes or protocol responses are correct and consistent.
- [ ] Error responses use the project's standard envelope and reveal no internal details.
- [ ] Timeouts, cancellation, pagination, idempotency, and caching are handled where applicable.
- [ ] Logging is structured, useful, and free of secrets or sensitive payloads.

## Security Review

- [ ] Authentication is enforced on every protected path.
- [ ] Authorization is checked server-side using trusted identity and ownership data.
- [ ] No authentication bypass, insecure default, or client-controlled privilege is present.
- [ ] Injection, SSRF, replay, CSRF, CORS, and rate-limit risks are assessed for this protocol.
- [ ] Any new dependency is vulnerability-checked and recorded in `state/DECISIONS_LOG.md`.
- [ ] `.env.example` is updated for new configuration variables, without real values.
- [ ] Development-only tools, debug ports, and verbose sensitive output are absent from production configuration.

## Testing

- [ ] Happy path is covered.
- [ ] Missing, malformed, oversized, and boundary inputs are covered.
- [ ] Authentication and authorization failures are covered.
- [ ] Not-found, conflict, timeout, dependency-failure, and retry behavior are covered where relevant.
- [ ] Contract or compatibility tests are updated.
- [ ] All focused and full verification checks pass.

## Completion

- [ ] API contract and examples are updated.
- [ ] Endpoint observability and runbook guidance are updated where needed.
- [ ] `state/TASK_QUEUE.md` and `state/CURRENT_STATUS.md` reflect the result.
