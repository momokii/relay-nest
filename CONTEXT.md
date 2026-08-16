# Domain Context

This glossary defines the product's domain language. It intentionally contains
no implementation, deployment, or storage prescriptions.

## Core concepts

### Tenant

The single self-hosted product boundary. This product has one tenant; it is not
a multi-tenant SaaS product.

### User

An authenticated person who uses the command center. Users are created by an
Admin. The product has no public registration.

### Role

A user's product-level responsibility. The roles are Admin, Operator, and
Viewer.

- **Admin:** manages users, access, connections, settings, and other privileged
  product operations.
- **Operator:** performs permitted operational work within granted sessions.
- **Viewer:** observes permitted sessions and records without mutating them.

### WAHA connection

The configured connection to the WAHA service that provides WhatsApp session
transport. The product initially has one active connection profile.

### Session

One linked WhatsApp account managed through the WAHA connection. Personal and
Business are distinct account scopes, and each scope may contain one or more
sessions.

### Account scope

The Personal or Business boundary to which a session, user grant, message,
contact, schedule, analytic view, AI context, retention policy, export, or audit
record belongs. Personal and Business scopes are never interchangeable.

### Session grant

An explicit permission that gives a user access to a particular session. A role
does not grant access to sessions by itself.

### Contact target

The individual WhatsApp recipient resolved from a WAHA contact lookup or a
validated manually entered phone number.

### Text message

The MVP communication unit: text addressed to one individual Contact target.
Media, groups, broadcasts, and campaigns are outside the MVP.

## Scheduling and delivery

### Schedule

A request to send one individual text message at one specified time and
timezone. MVP schedules are one-time only.

### Dispatch attempt

One bounded effort to submit a scheduled or immediate text message through its
authorized session.

### Acknowledgment

Transport or event evidence that a submitted message was accepted or otherwise
advanced by the WAHA/WhatsApp path. It is not proof that the recipient saw or
received the message.

### Delivery evidence

The evidence available about message progress. The product distinguishes
`scheduled`, `attempting`, `submitted`, `acknowledged`, `failed`, `unknown`, and
`cancelled`; an HTTP response alone is not recipient-delivery evidence.

### Recovery state

A visible state describing what happened when a schedule was missed, a service
was unavailable, or a dispatch could not be conclusively classified. Recovery
states are not silently converted into a late success.

## Data lifecycle and communication

### Retention policy

The rule describing how long a category of product data is kept. Policies are
configurable by an Admin and changing a policy does not itself mean that data is
deleted.

### Purge

An intentional deletion of selected retained data after preview and explicit
confirmation. Minimal content-free deletion accountability remains after a
purge; backup expiry is a separate lifecycle.

### Notification

An optional operational alert delivered through Email or Telegram. Each channel
is independently enabled and its settings are managed by an Admin.

### AI suggestion

A provider-agnostic summary, classification, or draft proposed for human
review. A suggestion never authorizes a send by itself.

### Consent

The recipient and operator permission basis required before a message may be
sent. Consent is a prerequisite, not an inferred property of a valid phone
number or a working session.

### Safety gate

A product condition that must pass before sending, including consent, pacing and
budgets, quiet hours, duplicate/burst protection, newly-linked cooldowns,
timelock, and capping.

## Product boundary terms

### Immediate send

An operator-approved individual text message dispatched without a future
schedule, subject to the same authorization and safety gates.

### Human approval

The explicit user action required before an AI-generated draft or suggestion can
be used for a send.

### Unofficial-client risk

The inherent possibility that using a reverse-engineered WhatsApp client can
cause account restriction or banning. Safety guardrails reduce risk but do not
guarantee account safety.
