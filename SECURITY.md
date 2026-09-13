# Security Policy

## Reporting a vulnerability

Do not open a public issue, discussion, or pull request for a suspected
vulnerability. Report it through GitHub private vulnerability reporting on
this repository so details stay confidential until a fix is ready. Include
the affected version or commit, steps to reproduce, and the impact you
observed. Do not include live credentials, real session material, or other
sensitive content in the report.

## Scope

In scope: authentication and session handling, per-scope authorization,
envelope encryption and key handling, WAHA credential storage, webhook
signature verification, CSRF and same-origin controls, and Docker secret
wiring. Out of scope: the unofficial WhatsApp client itself (restriction
and ban risk is inherent and documented in the README), third-party WAHA
provider infrastructure, and social-engineering reports.

## Ground rules for testing

Use only disposable local stacks (`dev:bundled`, disposable test
databases). Never test against another operator's deployment, never
exfiltrate data, and never publish proof-of-concept credentials. The
project treats scanning, spam, stealth, anti-detection, and ban-evasion
behavior as out of bounds, including while testing.
