# WAHA capability matrix (live contract)

**Research date:** 2026-08-16 (Asia/Jakarta)
**Repository plan:** `.omo/plans/waha-command-center.md`, Todo 1.
**Status convention:** `Not implemented / no repository test` means the product scaffold has no API, UI, adapter, or test suite yet. This note records the contract and test obligations; it does not claim runtime verification against a WAHA instance.

## Evidence and contract identity

- Live OpenAPI: [openapi.json](https://waha.devlike.pro/swagger/openapi.json), retrieved 2026-08-16; OpenAPI `3.1.0`, `info.version` `2026.8.1`, 139 paths, SHA-256 `58cb7725d8e687fd98baa6767118963c27335a8d35f1920b1d9a503c255854cb`.
- OpenAPI version: 2026.8.1
- OpenAPI retrieval date (UTC): 2026-08-16
- OpenAPI source: https://waha.devlike.pro/swagger/openapi.json
- OpenAPI SHA-256: 58cb7725d8e687fd98baa6767118963c27335a8d35f1920b1d9a503c255854cb
- Primary documentation: [Dashboard](https://waha.devlike.pro/docs/how-to/dashboard/), [Sessions](https://waha.devlike.pro/docs/how-to/sessions/), [Send messages](https://waha.devlike.pro/docs/how-to/send-messages/), [Contacts](https://waha.devlike.pro/docs/how-to/contacts/), [Chats](https://waha.devlike.pro/docs/how-to/chats/), [Events](https://waha.devlike.pro/docs/how-to/events/), [Security](https://waha.devlike.pro/docs/how-to/security/), [Storages](https://waha.devlike.pro/docs/how-to/storages/), [Engines](https://waha.devlike.pro/docs/how-to/engines/), [Observability](https://waha.devlike.pro/docs/how-to/observability/), [Install](https://waha.devlike.pro/docs/how-to/install/), [Avoid blocking](https://waha.devlike.pro/docs/overview/how-to-avoid-blocking/), and [Changelog](https://waha.devlike.pro/docs/overview/changelog/).
- OpenAPI auth scheme is `api_key` in `X-Api-Key`; `GET /api/sessions` additionally advertises OAuth2 `read:items`. Official security docs define session-key actions: `read`, `send`, `control`, `setting`, `app`, and `delete`; `delete` defaults false and admin keys have full access. The matrix below records both: **transport auth** is `api_key` unless noted, while **session action** is the minimum intended scoped-key permission.
- Engine order used below: `WEBJS`, `WPP`, `GOWS`, `NOWEB`. `All` means the official engine matrix marks all four; `—` means the docs mark unsupported or conditional.

## Pinned WAHA contract

| Pin field | Value | Verification status |
|---|---|---|
| WAHA image/version target | `devlikeapro/waha:2026.8.1` | Concrete version target; image runtime test is not claimed in this repository |
| Immutable image digest | Not recorded; no image digest was verified | Runtime image pin remains an implementation follow-up |
| Exact contract pin | OpenAPI `3.1.0`; `info.version` `2026.8.1`; SHA-256 `58cb7725d8e687fd98baa6767118963c27335a8d35f1920b1d9a503c255854cb` | Verified against the live OpenAPI retrieval |
| Contract verification | `curl -fsSL --retry 2 --max-time 30 https://waha.devlike.pro/swagger/openapi.json -o "$tmp" && sha256sum "$tmp" && python3 -c '...info.version...'` | PASS: version `2026.8.1`, SHA-256 `58cb7725d8e687fd98baa6767118963c27335a8d35f1920b1d9a503c255854cb` |
| Image runtime verification | Docker `29.3.1` is installed, but no WAHA container was started | NOT RUN; no claim of live image behavior |

## Command Center-owned boundaries

WAHA is the transport and session capability surface. It has no general scheduling or durable analytics layer, so these behaviors remain owned by the Command Center rather than being inferred from a WAHA endpoint.

| Boundary ID | Capability | Ownership | WAHA limitation | Evidence |
|---|---|---|---|---|
| `scheduling` | One-time scheduling and timezone persistence | Command Center-owned | No general delayed-send/scheduling endpoint | https://waha.devlike.pro/swagger/openapi.json |
| `retries` | Bounded retry, lease recovery, and outage classification | Command Center-owned | WAHA transport responses/events do not provide the product retry state machine | https://waha.devlike.pro/docs/how-to/events/ |
| `idempotency` | Duplicate prevention and dispatch identity | Command Center-owned | WAHA endpoints do not establish the product's durable exactly-once-like boundary | https://waha.devlike.pro/swagger/openapi.json |
| `retention` | Configurable retention, purge preview, and deletion accountability | Command Center-owned | WAHA storage settings are not the product retention policy or purge audit | https://waha.devlike.pro/docs/how-to/storages/ |
| `analytics` | Durable aggregates, scoped projections, and delivery evidence | Command Center-owned | WAHA exposes events/status signals, not the product analytics layer | https://waha.devlike.pro/docs/how-to/events/ |
| `application-authorization` | Admin/Operator/Viewer roles and per-session grants | Command Center-owned | WAHA API keys are transport scopes, not the product's user/session authorization model | https://waha.devlike.pro/docs/how-to/security/ |

## Native dashboard floor

The official Dashboard is at `/dashboard`, has dashboard authentication, can connect to WAHA with an API key, provides API-key administration, an Event Monitor, and a sample Chat UI. The dashboard docs explicitly point implementers to Chats, Send Messages, Message ACK, and WebSockets for a live-chat surface. **Plan status:** no product dashboard exists; native-floor parity is therefore `Not implemented / no repository test`.

| Floor capability | Exact WAHA contract | Auth / engine caveat | Implementation / test status |
|---|---|---|---|
| Session list/detail/create/update/delete | `GET /api/sessions`; `GET /api/sessions/{session}`; `POST /api/sessions`; `PUT /api/sessions/{session}`; `DELETE /api/sessions/{session}` | `api_key`; all engines. Use `read` for reads, `setting` for update, `delete` for delete. | Not implemented / no repository test |
| Lifecycle | `POST /api/sessions/{session}/start`; `/stop`; `/restart`; `/logout` | `api_key`; all engines; `control`. Destructive logout needs confirmation. | Not implemented / no repository test |
| Account identity | `GET /api/sessions/{session}/me` | `api_key`; all engines; `read`. | Not implemented / no repository test |
| QR | `GET /api/{session}/auth/qr?format=image|raw` | `api_key`; all engines; `control`. Refresh when `session.status=SCAN_QR_CODE`. | Not implemented / no repository test |
| Pairing code | `POST /api/{session}/auth/request-code` | `api_key`; all engines in engine docs; `control`; phone-number request body required by schema. | Not implemented / no repository test |
| Passkey challenge/assertion/confirmation | `GET /api/{session}/auth/passkey/challenge`; `POST /api/{session}/auth/passkey`; `GET /api/{session}/auth/passkey/confirmation`; `POST /api/{session}/auth/passkey/confirm` | `api_key`; **GOWS only** per Sessions docs; browser WebAuthn must run on `https://web.whatsapp.com`; status-driven (`PASSKEY_REQUIRED`, `PASSKEY_CONFIRMATION_REQUIRED`). `control`. | Not implemented / no repository test |
| Timelock / capping | `GET /api/sessions/{session}/timelock`; `GET /api/sessions/{session}/capping` | `api_key`; docs support timelock in GOWS/NOWEB/WEBJS; capping is exposed in live 2026.8.1 contract. Read-only `read`. Implemented by the WAHA adapter and scheduler safety path: `463 = timelock`, `475 = capping`; both remain visible gates while the session is `WORKING`. | mvp |
| Screenshot / native event monitor | `GET /api/screenshot`; WebSocket `/ws` | `api_key`; screenshot only WEBJS/WPP. WebSocket is documented, not represented as an OpenAPI path. `control` for browser-facing screenshot key; `read` for events. | Not implemented / no repository test |

## Capability matrix

The following parity table is the validator's canonical completeness contract. The detailed tables below carry the endpoint-level evidence behind each row.

| ID | Capability | Method/Path | Auth Scope | Engine Caveat | Evidence URL | Implementation Status | Test Status |
|---|---|---|---|---|---|---|---|
| `native-dashboard` | Native dashboard floor | N/A — native dashboard at `/dashboard`; parity is an application UI surface | `api_key` to WAHA; Admin-only application surface | Dashboard, Event Monitor, and sample Chat UI are WAHA-provided; do not expose WAHA credentials to browsers | https://waha.devlike.pro/docs/how-to/dashboard/ | mvp | manual |
| `sessions` | Session lifecycle and identity | GET /api/sessions; POST /api/sessions; GET /api/sessions/{session}; PUT /api/sessions/{session}; DELETE /api/sessions/{session}; POST /api/sessions/{session}/start | `api_key`; read, setting, delete, or control by operation | Lifecycle is documented across WEBJS, WPP, GOWS, and NOWEB; status remains engine-dependent | https://waha.devlike.pro/docs/how-to/sessions/ | mvp | adapter-contract |
| `qr-pairing-passkey` | QR, pairing code, and passkey linking | GET /api/{session}/auth/qr; POST /api/{session}/auth/request-code; GET /api/{session}/auth/passkey/challenge; POST /api/{session}/auth/passkey | `api_key`; control | Passkey is GOWS-only; QR and pairing response/status formats must be discovered and tested | https://waha.devlike.pro/docs/how-to/sessions/ | mvp | adapter-contract |
| `messaging` | Individual text and message operations | POST /api/sendText; POST /api/sendSeen | `api_key`; send | Text is MVP; ACK is transport evidence, not recipient delivery | https://waha.devlike.pro/docs/how-to/send-messages/ | mvp | adapter-contract |
| `contacts` | Contact lookup and number validation | GET /api/contacts/all; GET /api/contacts/check-exists; GET /api/{session}/contacts/{id} | `api_key`; read | NOWEB contact operations require Store; validate before first send | https://waha.devlike.pro/docs/how-to/contacts/ | mvp | adapter-contract |
| `chats` | Chat list, state, and message history | GET /api/{session}/chats; GET /api/{session}/chats/{chatId}/messages; POST /api/{session}/chats/{chatId}/messages/read | `api_key`; read, send, or delete by operation | NOWEB requires Store; archive/delete/message support varies by engine | https://waha.devlike.pro/docs/how-to/chats/ | mvp | adapter-contract |
| `media` | Media send, conversion, and download | POST /api/sendImage; POST /api/sendFile; POST /api/{session}/media/convert/voice; GET /api/files/{filename} | `api_key`; send/read; dedicated media key for file URLs | `/api/files` is documented but absent from live OpenAPI; media is deferred in the MVP | https://waha.devlike.pro/docs/how-to/receive-messages/ | deferred | pinned-contract |
| `webhooks` | Signed event delivery and configuration | POST /api/sessions; PUT /api/sessions/{session}; POST /api/{session}/events | Session `api_key`; setting/send; inbound HMAC is separate | Verify raw-body HMAC, timestamp, request ID, retries, duplicates, and out-of-order events | https://waha.devlike.pro/docs/how-to/events/ | mvp | adapter-contract |
| `websockets` | Live event stream | WS /ws | Narrow `api_key` in query; read | Documented but not represented in OpenAPI; WebSocket is not the durable event source | https://waha.devlike.pro/docs/how-to/events/#websockets | mvp | adapter-contract |
| `health` | Service and session health signals | GET /ping; GET /health; GET /api/server/version; GET /api/server/status | `api_key`, except configured health exclusions; read for server APIs | Service health does not prove WhatsApp session readiness | https://waha.devlike.pro/docs/how-to/observability/ | mvp | adapter-contract |
| `environment` | Server environment discovery with safe-field projection | GET /api/server/environment | `api_key`; read | OpenAPI defines an object response without named fields; the adapter allowlists safe scalar fields and excludes secrets | https://waha.devlike.pro/docs/how-to/observability/ | mvp | adapter-contract |
| `api-key-scopes` | Scoped API-key authorization | N/A — scopes are key configuration applied to API paths | `X-Api-Key`; read, send, control, setting, app, delete | Delete defaults false; Admin/master keys stay server-side | https://waha.devlike.pro/docs/how-to/security/ | mvp | adapter-contract |
| `storage` | Session and media persistence | N/A — server-side storage configuration | Server configuration; no browser scope | Local sessions, PostgreSQL, and S3 are supported; MongoDB is deprecated; Store is required for some NOWEB features | https://waha.devlike.pro/docs/how-to/storages/ | operational | operational |
| `engine-differences` | WEBJS/WPP/GOWS/NOWEB capability negotiation | N/A — engine capability table and runtime version are discovery inputs | `api_key`; read for `/api/server/version` | Never assume parity; passkey, Store, media, ACK payloads, and event data vary | https://waha.devlike.pro/docs/how-to/engines/ | operational | adapter-contract |
| `timelock-capping` | Outreach safety gates | GET /api/sessions/{session}/timelock; GET /api/sessions/{session}/capping | `api_key`; read | `463` is timelock and `475` is capping; both are visible safety/recovery states; do not restart automatically | https://waha.devlike.pro/docs/overview/how-to-avoid-blocking/ | mvp | adapter-contract |
| `deployment` | Dashboard-only and bundled-WAHA deployment | N/A — Docker image, internal network, and reverse-proxy configuration | Server secrets; no public WAHA API | Exact invocations use `docker-compose.yml` plus `docker-compose.override.yml` and either `docker-compose.external-waha.yml` or `docker-compose.bundled-waha.yml`; only web publishes a host port, API/WAHA remain internal; public access requires TLS/firewall hardening; bundled profile is fail-closed pending a verified image and secret boundary | https://waha.devlike.pro/docs/how-to/install/ | operational | external-mode manual; bundled blocked |

### Sessions, health, and deployment

| Capability | Method / path | Auth scope | Engine caveat | Implementation / test status | Evidence |
|---|---|---|---|---|---|
| Ping | `GET /ping` | Exempt only if configured with the runtime-supported exclusion variable; otherwise `api_key` | Service liveness, not session readiness | RelayNest configures no exclusion while bundled mode is blocked; exact source/docs variable spelling requires runtime verification | [Observability](https://waha.devlike.pro/docs/how-to/observability/#ping) |
| Health | `GET /health` | `api_key` in OpenAPI; RelayNest configures no exclusion | Reports service/storage indicators, not WhatsApp account readiness; 200 healthy, 503 unhealthy | Bundled mode is fail-closed; any future exclusion requires exact-source runtime verification | [Observability](https://waha.devlike.pro/docs/how-to/observability/#health-check) |
| Version | `GET /api/server/version` | `api_key`; `read` | Returns installed version, engine, tier, browser | Not implemented / no repository test | [Observability](https://waha.devlike.pro/docs/how-to/observability/#get-server-version) |
| Server status | `GET /api/server/status` | `api_key`; `read` | Process uptime only | Not implemented / no repository test | [Observability](https://waha.devlike.pro/docs/how-to/observability/#get-server-status) |
| Deployment image | `devlikeapro/waha:{pinned-version}`; image families `latest`, `chrome`, `noweb`, `gows`, ARM variants | Image/secret configuration, not API scope | Docs show unpinned examples; production plan must pin a tested `2026.8.1` image/tag and record digest before implementation | Not implemented / no repository test | [Engines](https://waha.devlike.pro/docs/how-to/engines/#docker-images), [Install](https://waha.devlike.pro/docs/how-to/install/#docker) |
| Persistence | Local `/app/.sessions`; PostgreSQL session storage; S3/PostgreSQL/local media | Server-side config | Session storage is required to avoid QR re-pairing; MongoDB is deprecated; each engine has namespaces | Not implemented / no repository test | [Storages](https://waha.devlike.pro/docs/how-to/storages/) |

### Text and media messaging

| Capability | Method / path | Auth scope | Engine caveat | Implementation / test status | Evidence |
|---|---|---|---|---|---|
| Text | `POST /api/sendText` | `api_key`; `send` | All engines; use `check-exists` first for new numbers, especially Brazil | Not implemented / no repository test | [Send text](https://waha.devlike.pro/docs/how-to/send-messages/#send-text), [OpenAPI](https://waha.devlike.pro/swagger/openapi.json) |
| Read/seen | `POST /api/sendSeen` | `api_key`; `send` | All engines; `messagesIds` control documented for GOWS/NOWEB | Not implemented / no repository test | [Send seen](https://waha.devlike.pro/docs/how-to/send-messages/#send-seen) |
| Image | `POST /api/sendImage` | `api_key`; `send` | All engines; JPEG recommended; URL or base64 | Not implemented / no repository test | [Send image](https://waha.devlike.pro/docs/how-to/send-messages/#send-image) |
| File | `POST /api/sendFile` | `api_key`; `send` | All engines in current matrix | Not implemented / no repository test | [Features](https://waha.devlike.pro/docs/how-to/send-messages/#features) |
| Voice / video | `POST /api/sendVoice`; `POST /api/sendVideo` | `api_key`; `send` | All engines; conversion endpoints below | Not implemented / no repository test | [Features](https://waha.devlike.pro/docs/how-to/send-messages/#features) |
| Media conversion | `POST /api/{session}/media/convert/voice`; `POST /api/{session}/media/convert/video` | `api_key`; `send` | All engines | Not implemented / no repository test | [OpenAPI](https://waha.devlike.pro/swagger/openapi.json) |
| Location / vCard | `POST /api/sendLocation`; `POST /api/sendContactVcard` | `api_key`; `send` | All engines in current docs | Not implemented / no repository test | [Features](https://waha.devlike.pro/docs/how-to/send-messages/#features) |
| Typing / presence | `POST /api/startTyping`; `POST /api/stopTyping`; `POST /api/{session}/presence` | `api_key`; `send` | All engines | Not implemented / no repository test | [Features](https://waha.devlike.pro/docs/how-to/send-messages/#features) |
| Edit/delete/reaction/star | `PUT /api/{session}/chats/{chatId}/messages/{messageId}`; `DELETE .../{messageId}`; `PUT /api/reaction`; `PUT /api/star` | `api_key`; `send` | Engine support differs for star/reaction details; test selected engine | Not implemented / no repository test | [Chats](https://waha.devlike.pro/docs/how-to/chats/), [Send](https://waha.devlike.pro/docs/how-to/send-messages/) |
| Media download | Docs use `GET /api/files/{filename}` with `X-Api-Key` or lowercase `x-api-key` query fallback | Dedicated media key: `read=false,send=false,control=false,setting=false,app=false,delete=false` | Media URL/key flow is documented but **no `/api/files` path appears in live OpenAPI**; treat docs as authoritative only after an integration test | Not implemented / no repository test | [Security](https://waha.devlike.pro/docs/how-to/security/#use-x-api-key-query-parameter), [Receive media](https://waha.devlike.pro/docs/how-to/receive-messages/#media-files) |

### Contacts and chats

| Capability | Method / path | Auth scope | Engine caveat | Implementation / test status | Evidence |
|---|---|---|---|---|---|
| Contact lookup/list | `GET /api/contacts/all`; `GET /api/contacts`; `GET /api/{session}/contacts/{id}` | `api_key`; `read` | NOWEB requires Store for contacts; current OpenAPI includes the session-specific GET | Not implemented / no repository test | [Contacts](https://waha.devlike.pro/docs/how-to/contacts/) |
| Number validation | `GET /api/contacts/check-exists`; `GET /api/checkNumberStatus` | `api_key`; `read` | All engines in docs; resolve returned `chatId` before new send | Not implemented / no repository test | [Check exists](https://waha.devlike.pro/docs/how-to/contacts/#check-phone-number-exists), [OpenAPI](https://waha.devlike.pro/swagger/openapi.json) |
| Contact profile/about/picture | `GET /api/contacts/about`; `GET /api/contacts/profile-picture` | `api_key`; `read` | About is not supported by NOWEB/GOWS in docs; picture cache/refresh caveat | Not implemented / no repository test | [Contacts](https://waha.devlike.pro/docs/how-to/contacts/) |
| Contact update/block | `PUT /api/{session}/contacts/{chatId}`; `POST /api/contacts/block`; `POST /api/contacts/unblock` | `api_key`; `send` | Update is WEBJS/NOWEB/GOWS; block/unblock only WEBJS/WPP in matrix | Not implemented / no repository test | [Contacts](https://waha.devlike.pro/docs/how-to/contacts/#update-contact) |
| LID mapping | `GET /api/{session}/lids`; `/lids/count`; `/lids/{lid}`; `/lids/pn/{phoneNumber}` | `api_key`; `read` | NOWEB requires Store | Not implemented / no repository test | [LIDs](https://waha.devlike.pro/docs/how-to/contacts/#api---lids) |
| Chat list/overview | `GET /api/{session}/chats`; `GET /api/{session}/chats/overview`; `POST /api/{session}/chats/overview` | `api_key`; `read` | NOWEB requires Store; pagination required for large lists | Not implemented / no repository test | [Chats](https://waha.devlike.pro/docs/how-to/chats/#get-chats-overview) |
| Chat state | `GET /api/{session}/chats/{chatId}/picture`; `POST .../archive`; `POST .../unarchive`; `POST .../unread`; `DELETE /api/{session}/chats/{chatId}` | `api_key`; `read` for picture, `send` for mutations; `delete` for chat deletion | Archive/unarchive/delete support is not uniform; consult engine matrix | Not implemented / no repository test | [Chats feature matrix](https://waha.devlike.pro/docs/how-to/chats/#features) |
| Message history | `GET /api/{session}/chats/{chatId}/messages`; `GET .../{messageId}`; `POST .../messages/read`; `DELETE .../messages` | `api_key`; `read` for reads, `send` for read/delete mutations | NOWEB requires Store; GOWS/NOWEB support `chatId=all`/plain IDs in documented cases | Not implemented / no repository test | [Chats API](https://waha.devlike.pro/docs/how-to/chats/#api) |

### Events, WebSockets, and acknowledgments

| Capability | Method / path | Auth scope | Engine caveat | Implementation / test status | Evidence |
|---|---|---|---|---|---|
| Session webhook configuration | In `POST /api/sessions` or `PUT /api/sessions/{session}` body: `config.webhooks[]` | `api_key`; `setting` | Per-session and global env configuration; event support varies | Not implemented / no repository test | [Events](https://waha.devlike.pro/docs/how-to/events/#session-webhooks), [OpenAPI](https://waha.devlike.pro/swagger/openapi.json) |
| Webhook authenticity | Headers `X-Webhook-Request-Id`, `X-Webhook-Timestamp`, `X-Webhook-Hmac`, algorithm `sha512` over raw body | Inbound HMAC shared secret; not API-key scope | Retry policies `constant`, `linear`, `exponential`; verify timestamp, raw-body HMAC, request/event idempotency | mvp | adapter-contract |
| WebSocket stream | `ws(s)://host/ws?x-api-key=...&session=...&events=...` | API key in query string; use narrow key, never master key | `events=*` excludes `engine.event` unless explicitly requested; WebSocket is not OpenAPI-described | Not implemented / no repository test | [WebSockets](https://waha.devlike.pro/docs/how-to/events/#websockets) |
| Session/message events | `session.status`, `message`, `message.any`, `message.ack`, `message.edited`, `message.revoked`, `message.reaction`, plus engine/group/chat events | Webhook HMAC or WebSocket API key | `message.waiting` is WEBJS-only; payload `_data` is engine-specific; ACK values distinguish server/device/read/played, not delivery proof | mvp | adapter-contract |
| Event message | `POST /api/{session}/events` | `api_key`; `send` | Current OpenAPI includes it; engine feature table marks GOWS-only | Not implemented / no repository test | [OpenAPI](https://waha.devlike.pro/swagger/openapi.json), [Engines](https://waha.devlike.pro/docs/how-to/engines/#-event-message) |

## Stale documentation discrepancies

1. **QR verb conflict:** live OpenAPI is `GET /api/{session}/auth/qr`; Sessions and Engines pages still print `POST /api/{session}/auth/qr`. Implement the live OpenAPI verb and add a contract test that rejects the stale verb.
2. **Session update verb conflict:** live OpenAPI is `PUT /api/sessions/{session}`; Sessions/Engines feature tables still show `POST /api/sessions/{name}/`. Use `PUT`; treat the table as stale.
3. **Logout path conflict:** live OpenAPI canonical path is `POST /api/sessions/{session}/logout`; older docs/engine tables show `POST /api/sessions/logout`, which remains only as a deprecated OpenAPI compatibility endpoint. Do not build against the deprecated endpoint.
4. **OpenAPI/docs coverage gap:** official receive/security docs describe media download under `/api/files/...`, but the retrieved OpenAPI has no `/api/files` path. Keep media out of the MVP as the plan requires; if later enabled, prove the path against the pinned runtime.
5. **Engine-table lag:** current docs say Passkey is GOWS-only and changelog records it in 2026.7.1, while older broad session tables do not list passkey. Capability discovery must use status plus live behavior, not only the generic table.
6. **Version drift in examples:** Install, storage, and engine pages use unpinned `devlikeapro/waha`/`latest` examples. The plan requires a pinned production image; 2026.8.1 is the observed OpenAPI version, not yet a tested Docker image digest in this repository.
7. **Health semantics:** `GET /health` is API-key protected in OpenAPI and RelayNest configures no exclusion. Keep it internal; do not infer session connectivity or recipient delivery from a 200 health response. RelayNest API startup runs migrations before listen, and Compose health dependencies are readiness ordering, not WhatsApp linking proof.
8. **Repository status discrepancy:** `.claude/state/CURRENT_STATUS.md` says an official capability audit was completed, but this repository had no `docs/` research artifact before this note and no product code/tests. This note is the first durable matrix; plan state remains untouched.

## Required implementation/test checklist

- Pin and record a tested WAHA image tag/digest, then run adapter contract tests against that exact runtime.
- Cover every floor row above, including both stale endpoint negatives (`POST` QR and `POST` update) and deprecated logout avoidance.
- Assert `X-Api-Key` stays server-side; use dedicated media/control/session keys for browser URLs and WebSockets.
- Test engine capability negotiation for WEBJS/WPP/GOWS/NOWEB, especially NOWEB Store, GOWS Passkey, media, ACK payloads, and engine-specific `_data`.
- Test HMAC raw-body verification, timestamp/replay rejection, duplicate/out-of-order events, webhook retry behavior, and WebSocket loss without treating WebSocket as the durable source.
- Test `463` timelock and `475` capping as visible paused/recovery states; never restart or re-pair automatically.
- Keep media, recurring jobs, campaigns, broadcasts, full inbox parity, and autonomous AI sending deferred per the plan.
