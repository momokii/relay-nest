# Environment Guide

This guide defines the environments an agent may encounter and the behavior required
in each. The initial commands are intentionally generic; replace them with verified
project commands as the runtime and deployment setup become known.

## Environment Definitions

| Environment | Purpose | Characteristics |
|---|---|---|
| `development` | Local development and feature work | Debugging may be enabled, logs may be verbose, hot reload may be used, and external services should be local, mocked, or sandboxed. |
| `staging` | Pre-production validation | Configuration should mirror production, services should be sandboxed or explicitly approved, and debug mode must be disabled. |
| `production` | Live system | Debugging is disabled, logging is minimized and redacted, configuration is hardened, and real services and secrets are used. |

## Identifying the Active Environment

1. Check `APP_ENV` or the project's equivalent configuration variable without exposing its value.
2. Inspect the active process, Compose profile, deployment context, or documented startup command when the variable is absent.
3. Treat an unknown environment as non-development until the user confirms otherwise.
4. Record uncertainty in `state/CURRENT_STATUS.md` and ask before running risky commands.

## Agent Behavior by Environment

### Development

- Use the standard development workflow and safe local services.
- Verbose, redacted logging is acceptable and useful for debugging.
- Debug ports, profilers, database GUIs, seed data, and fixtures may be used when they are local and task-relevant.
- Hot reload and source volume mounts are acceptable.
- Run destructive test data operations only against explicitly disposable local resources.

### Staging

- Present a written plan and receive explicit confirmation before executing migrations, destructive data operations, deployments, or configuration changes.
- Use sandbox credentials and services; never substitute production secrets.
- Keep debug mode, development seed scripts, and unrestricted admin tooling disabled.
- Treat staging data as sensitive and redact it from logs and reports.

### Production

- Present a written plan and receive explicit confirmation before every change, migration, deployment, or destructive operation.
- Never directly edit production configuration or secrets from the repository workspace.
- Never run `DROP`, `DELETE`, `TRUNCATE`, irreversible migrations, cleanup scripts, or equivalent operations without explicit written approval and a recovery plan.
- Never expose debug ports, seed scripts, development tooling, source mounts, or verbose sensitive logging.
- Prefer read-only inspection and documented deployment mechanisms.

## Docker Compose Pattern

When Docker is adopted, use this separation unless the project documents a safer
verified alternative:

- `docker-compose.yml` — base, environment-agnostic service definitions.
- `docker-compose.override.yml` — development-only hot reload, debug ports, and live-code mounts; loaded automatically by the default Compose workflow.
- `docker-compose.prod.yml` — production-only hardening, resource limits, restart policies, no source mounts, and no debug ports; loaded explicitly.

Illustrative commands, to be replaced with the project's verified commands:

```bash
# Development: the override file is loaded automatically when supported.
docker-compose up

# Production: use only the base and production override, after confirmation.
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

Always ask before running a Compose command that is not clearly development. Confirm
the selected files, profile, service targets, and environment before execution.

## Planned WAHA Command Center Topology

The implementation plan defines one Compose setup with two supported modes:

- **Dashboard-only:** the dashboard and PostgreSQL run locally and connect to an external WAHA URL configured at runtime.
- **Bundled:** the dashboard, PostgreSQL, and a pinned WAHA image run together; WAHA remains reachable only on the internal Compose network.

The dashboard is planned to bind to `0.0.0.0` for LAN/VPN convenience, so the host
firewall or private network must restrict access. This is not a claim that public
exposure is safe. A public deployment requires a reverse proxy, HTTPS/TLS, secure
headers/cookies, login rate limiting, and explicit firewall rules. Replace this
planned topology with verified commands and image tags when the deployment task is
implemented.

The WAHA API must not be published directly to the host by default. The dashboard
holds WAHA credentials server-side and proxies only authorized, scoped operations.

## Environment Files

The expected pattern is:

```text
.env.example        # committed; safe variable names, placeholders, and comments
.env                # ignored; local development values
.env.staging        # ignored; staging values
.env.production     # ignored; production values
```

Never commit actual secret files. Update the root `.env.example` whenever a required
configuration variable is introduced, and update this guide when the project adopts
a different secret-management mechanism.

## Self-Update

Once the project stack, startup command, health check, test command, Docker setup,
deployment mechanism, and environment variable conventions are known, replace the
generic guidance and illustrative commands with real, verified instructions. Record
environment changes in `state/DECISIONS_LOG.md` when they affect architecture or risk.
