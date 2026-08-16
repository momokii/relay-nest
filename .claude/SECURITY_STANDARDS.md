# Security Standards

This document governs every security decision. Consult it before implementing any
feature involving input, authentication, external communication, persistence,
serialization, file access, or privileged operations. Extend it with stack-specific
controls as soon as the stack is known; do not weaken these baseline requirements
without an explicit, documented decision.

## Secrets and Environment Variables

- Never hardcode secrets, API keys, tokens, passwords, private keys, or sensitive values in source code, tests, fixtures, examples, documentation, or shell history.
- Manage secrets through runtime environment injection or the stack's approved secret store; never commit actual `.env` files.
- Keep `.env` and environment-specific secret files ignored by version control.
- Maintain a committed root `.env.example` containing every required variable name, a safe placeholder, and a description comment; never put real values in it.
- Never print, log, return, or include environment variable values in error messages or debug output.
- Redact secrets and sensitive identifiers before logging structured context.

## Environment Configuration

- Distinguish `development`, `staging`, and `production` environments.
- Use `APP_ENV` or the stack's equivalent to control environment-specific behavior.
- Drive differing log levels, debug modes, service URLs, credentials, and rate limits through configuration, not scattered hardcoded conditionals.
- Default to the safest behavior when an environment variable is missing or invalid.
- Keep production credentials and configuration outside the repository.

## Input Validation and Sanitization

- Treat HTTP bodies, query parameters, path parameters, headers, uploaded files, messages, webhooks, CLI arguments, and runtime environment values as untrusted input.
- Validate input against an explicit schema at the boundary before invoking business logic.
- Reject malformed or unexpected input with a clear, stable error; do not silently coerce or guess intent.
- Normalize and sanitize data only according to the destination's requirements.
- Enforce size, length, type, encoding, and rate limits at boundaries.
- Never trust client-supplied data for identity, ownership, role, or authorization decisions.
- Use parameterized queries or the framework's safe data-access mechanism; never concatenate untrusted input into commands or queries.

## Authentication and Authorization

- Use the established framework or a well-maintained security library rather than ad-hoc authentication logic.
- Protect every non-public route and operation with explicit authorization; default to deny.
- Never add a temporary authentication bypass. If auth is incomplete, stop and escalate.
- Validate session tokens, API keys, and JWTs on every request, including signature, issuer, audience, expiry, and required claims where applicable.
- Apply least privilege to users, services, database accounts, and deployment identities.
- Protect credentials in transit and at rest according to the stack and deployment environment.

## External Communication and Data Handling

- Use encrypted transport for external communication and verify certificates by default.
- Validate external responses before using them and enforce timeouts, size limits, retries, and safe failure behavior.
- Prevent server-side request forgery by restricting destinations and validating redirects where applicable.
- Minimize collection and retention of personal or sensitive data.
- Do not expose internal identifiers, stack traces, filesystem paths, or sensitive records in user-facing responses.
- Apply appropriate security headers, CSRF protections, CORS restrictions, and content policies when the platform supports them.

## Dependency Security

- Before adding a dependency, use the appropriate vulnerability tool for the stack, such as `npm audit`, `pip-audit`, `govulncheck`, or `bundle audit`.
- Prefer maintained, widely adopted packages with clear licensing and a small transitive footprint.
- Pin versions or use the repository's lockfile; avoid open-ended ranges that silently upgrade.
- Record the dependency, rationale, version, vulnerability-check command, and result in `state/DECISIONS_LOG.md`.
- Review dependency updates for security advisories and breaking changes.

## Docker and Container Security

- Run application containers as a non-root user.
- Expose only required ports, especially in production.
- Never commit `.env` files or bake secrets into images; inject secrets at runtime.
- Use specific image tags or digests; never use `latest` for production.
- Keep images minimal, patched, and free of build-time credentials.
- Separate development conveniences from production images and Compose configuration.

## WAHA Command Center Controls

- Keep the WAHA master API key and any session-scoped keys on the server side; never place them in browser state, client bundles, URLs, or ordinary logs.
- Keep bundled WAHA on the internal Compose network. Publish the dashboard port only; never publish the WAHA master API port by default.
- Validate WAHA webhook signatures, timestamps, and replay identifiers before accepting events.
- Treat WAHA `WORKING` status and HTTP acceptance as transport signals, not proof of recipient delivery.
- Gate scheduled and immediate sends on authorization, session health, consent policy, rate budgets, quiet hours, and WAHA timelock/capping signals.
- Never create automatic restart loops for WAHA timelock or message-capping failures.
- Persist only the minimum message/contact/media data required by the configured retention policy, and encrypt sensitive fields at the application layer.
- Document the unofficial reverse-engineered WhatsApp-client ban risk prominently; safety controls reduce risk but cannot guarantee account safety.

## Security Verification

- Include security cases in tests for validation, authorization, secret handling, and failure behavior when relevant.
- Review changed files for secrets and unsafe logging before completion.
- Run the stack's dependency, static-analysis, and security checks before declaring security-sensitive work complete.
- Escalate suspected vulnerabilities, auth bypasses, data exposure, or uncertainty immediately; do not conceal or defer them.

## Self-Update

When the stack is confirmed, extend this document with its concrete guidance: ORM
injection prevention, framework auth configuration, CSRF and CORS settings, rate
limiting middleware, security headers, serialization rules, container hardening, and
the exact commands used for security verification.
