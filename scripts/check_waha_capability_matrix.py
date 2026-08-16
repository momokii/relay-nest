#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path


EXPECTED_OPENAPI_VERSION = "2026.8.1"
EXPECTED_RETRIEVAL_DATE = "2026-08-16"
EXPECTED_OPENAPI_URL = "https://waha.devlike.pro/swagger/openapi.json"
EXPECTED_OPENAPI_SHA256 = "58cb7725d8e687fd98baa6767118963c27335a8d35f1920b1d9a503c255854cb"
REQUIRED_IDS = (
    "native-dashboard",
    "sessions",
    "qr-pairing-passkey",
    "messaging",
    "contacts",
    "chats",
    "media",
    "webhooks",
    "websockets",
    "health",
    "environment",
    "api-key-scopes",
    "storage",
    "engine-differences",
    "timelock-capping",
    "deployment",
)
REQUIRED_METHOD_PATHS = {
    "native-dashboard": "N/A — native dashboard at `/dashboard`; parity is an application UI surface",
    "sessions": "GET /api/sessions; POST /api/sessions; GET /api/sessions/{session}; PUT /api/sessions/{session}; DELETE /api/sessions/{session}; POST /api/sessions/{session}/start",
    "qr-pairing-passkey": "GET /api/{session}/auth/qr; POST /api/{session}/auth/request-code; GET /api/{session}/auth/passkey/challenge; POST /api/{session}/auth/passkey",
    "messaging": "POST /api/sendText; POST /api/sendSeen",
    "contacts": "GET /api/contacts/all; GET /api/contacts/check-exists; GET /api/{session}/contacts/{id}",
    "chats": "GET /api/{session}/chats; GET /api/{session}/chats/{chatId}/messages; POST /api/{session}/chats/{chatId}/messages/read",
    "media": "POST /api/sendImage; POST /api/sendFile; POST /api/{session}/media/convert/voice; GET /api/files/{filename}",
    "webhooks": "POST /api/sessions; PUT /api/sessions/{session}; POST /api/{session}/events",
    "websockets": "WS /ws",
    "health": "GET /ping; GET /health; GET /api/server/version; GET /api/server/status",
    "environment": "GET /api/server/environment",
    "api-key-scopes": "N/A — scopes are key configuration applied to API paths",
    "storage": "N/A — server-side storage configuration",
    "engine-differences": "N/A — engine capability table and runtime version are discovery inputs",
    "timelock-capping": "GET /api/sessions/{session}/timelock; GET /api/sessions/{session}/capping",
    "deployment": "N/A — Docker image, internal network, and reverse-proxy configuration",
}
REQUIRED_BOUNDARY_IDS = (
    "scheduling",
    "retries",
    "idempotency",
    "retention",
    "analytics",
    "application-authorization",
)
ALLOWED_IMPLEMENTATION = {"mvp", "deferred", "application-owned", "operational", "not-applicable"}
ALLOWED_TEST = {"pinned-contract", "adapter-contract", "deferred", "manual", "operational"}
METHOD_PATH = re.compile(r"\b(?:GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD|WS)\s+/(?:[^\s,;<]+)")
SHA256 = re.compile(r"^[0-9a-f]{64}$")


def fail(errors: list[str], message: str) -> None:
    errors.append(message)


def metadata_value(text: str, label: str) -> str | None:
    match = re.search(rf"^- {re.escape(label)}:\s*(.+)$", text, re.MULTILINE)
    return match.group(1).strip() if match else None


def parse_table(text: str, errors: list[str]) -> dict[str, dict[str, str]]:
    marker = "## Capability matrix"
    if marker not in text:
        fail(errors, "missing '## Capability matrix' section")
        return {}
    section = text.split(marker, 1)[1]
    section = section.split("\n### ", 1)[0]
    lines = [line.strip() for line in section.splitlines() if line.strip().startswith("|")]
    if len(lines) < 3:
        fail(errors, "capability matrix must contain a header, separator, and at least one row")
        return {}
    header = [cell.strip().lower() for cell in lines[0].strip("|").split("|")]
    expected = [
        "id",
        "capability",
        "method/path",
        "auth scope",
        "engine caveat",
        "evidence url",
        "implementation status",
        "test status",
    ]
    if header != expected:
        fail(errors, f"matrix header must be exactly: {' | '.join(expected)}")
        return {}
    rows: dict[str, dict[str, str]] = {}
    for line_number, line in enumerate(lines[2:], start=1):
        cells = [cell.strip() for cell in line.strip("|").split("|")]
        if len(cells) != len(expected):
            fail(errors, f"matrix row {line_number} has {len(cells)} cells; expected {len(expected)}")
            continue
        row = dict(zip(expected, cells))
        row_id = row["id"].strip("`")
        if not row_id:
            fail(errors, f"matrix row {line_number} has an empty id")
            continue
        if row_id in rows:
            fail(errors, f"duplicate capability id: {row_id}")
        rows[row_id] = row
        for field in expected[1:]:
            if not row[field] or row[field] in {"-", "TBD", "unknown"}:
                fail(errors, f"{row_id}: missing mandatory field '{field}'")
        endpoint = row["method/path"]
        expected_endpoint = REQUIRED_METHOD_PATHS.get(row_id)
        if expected_endpoint is not None and endpoint != expected_endpoint:
            fail(
                errors,
                f"{row_id}: method/path must be exactly '{expected_endpoint}'",
            )
        if not METHOD_PATH.search(endpoint) and not endpoint.startswith("N/A —"):
            fail(errors, f"{row_id}: method/path must contain an exact method/path or 'N/A —' rationale")
        if not row["evidence url"].startswith("https://"):
            fail(errors, f"{row_id}: evidence URL must be HTTPS")
        if row["implementation status"] not in ALLOWED_IMPLEMENTATION:
            fail(errors, f"{row_id}: unsupported implementation status '{row['implementation status']}'")
        if row["test status"] not in ALLOWED_TEST:
            fail(errors, f"{row_id}: unsupported test status '{row['test status']}'")
    return rows


def validate(path: Path, expected_version: str, expected_date: str) -> list[str]:
    errors: list[str] = []
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as exc:
        return [f"cannot read {path}: {exc}"]
    version = metadata_value(text, "OpenAPI version")
    retrieval_date = metadata_value(text, "OpenAPI retrieval date (UTC)")
    source = metadata_value(text, "OpenAPI source")
    digest = metadata_value(text, "OpenAPI SHA-256")
    if version != expected_version:
        fail(errors, f"OpenAPI version drift: expected {expected_version}, found {version or '<missing>'}")
    if retrieval_date != expected_date:
        fail(errors, f"OpenAPI retrieval date drift: expected {expected_date}, found {retrieval_date or '<missing>'}")
    if source != EXPECTED_OPENAPI_URL:
        fail(errors, f"OpenAPI source must be {EXPECTED_OPENAPI_URL}")
    if not digest or not SHA256.fullmatch(digest):
        fail(errors, "OpenAPI SHA-256 must be a 64-character lowercase hexadecimal digest")
    elif digest != EXPECTED_OPENAPI_SHA256:
        fail(errors, f"OpenAPI SHA-256 drift: expected {EXPECTED_OPENAPI_SHA256}, found {digest}")
    if "## Stale documentation discrepancies" not in text:
        fail(errors, "missing '## Stale documentation discrepancies' section")
    if "no known discrepancies" in text.lower():
        fail(errors, "stale documentation discrepancies must be recorded explicitly")
    if "## Pinned WAHA contract" not in text:
        fail(errors, "missing '## Pinned WAHA contract' section")
    exact_pin = f"OpenAPI `3.1.0`; `info.version` `{expected_version}`; SHA-256 `{EXPECTED_OPENAPI_SHA256}`"
    if exact_pin not in text:
        fail(errors, f"missing exact OpenAPI contract pin: {exact_pin}")
    if "## Command Center-owned boundaries" not in text:
        fail(errors, "missing '## Command Center-owned boundaries' section")
    for boundary_id in REQUIRED_BOUNDARY_IDS:
        if f"| `{boundary_id}` |" not in text:
            fail(errors, f"missing Command Center-owned boundary row: {boundary_id}")
    rows = parse_table(text, errors)
    for required_id in REQUIRED_IDS:
        if required_id not in rows:
            fail(errors, f"missing mandatory capability row: {required_id}")
    for required_id in REQUIRED_IDS:
        if required_id not in REQUIRED_METHOD_PATHS:
            fail(errors, f"missing required method/path contract: {required_id}")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("matrix", type=Path)
    parser.add_argument("--expected-version", default=EXPECTED_OPENAPI_VERSION)
    parser.add_argument("--expected-date", default=EXPECTED_RETRIEVAL_DATE)
    args = parser.parse_args()
    errors = validate(args.matrix, args.expected_version, args.expected_date)
    if errors:
        print(f"WAHA capability matrix FAILED: {args.matrix}", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1
    print(f"WAHA capability matrix OK: {args.matrix} ({len(REQUIRED_IDS)} mandatory capabilities)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
