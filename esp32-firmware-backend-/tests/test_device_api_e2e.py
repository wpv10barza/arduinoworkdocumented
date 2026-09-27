#!/usr/bin/env python3
"""End-to-end device API test against the real Asistente 3C Monitor.

The workflow starts the real wpv10barza/asistente-3c server and points this
client at it. This exercises the same HTTP contract used by the ESP32:
health -> authenticated command -> idempotent retry -> pending polling ->
human-confirmation result -> terminal polling.
No Google credentials or physical hardware are required.
"""
import json
import os
import time
import urllib.error
import urllib.request

TOKEN = os.environ.get("ESP32_API_TOKEN", "ci-e2e-token")
BASE_URL = os.environ.get("DEVICE_API_BASE_URL", "http://127.0.0.1:3000").rstrip("/")


def request(method: str, path: str, payload=None, token: str | None = TOKEN):
    data = json.dumps(payload).encode() if payload is not None else None
    headers = {"Content-Type": "application/json"}
    if token is not None:
        headers["X-3C-Device-Token"] = token
    req = urllib.request.Request(
        BASE_URL + path,
        data=data,
        method=method,
        headers=headers,
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            raw = response.read()
            return response.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        return exc.code, json.loads(raw) if raw else {}


def wait_for_health():
    last_error = None
    for _ in range(30):
        try:
            code, body = request("GET", "/api/device/v1/health", token=None)
            if code == 200:
                return body
            last_error = f"HTTP {code}: {body}"
        except urllib.error.URLError as exc:
            last_error = str(exc)
        time.sleep(1)
    raise AssertionError(f"Monitor did not become healthy: {last_error}")


health = wait_for_health()
assert health["accepts_commands"] is True, health
assert health["requires_human_confirmation"] is True, health
assert health["protocol_version"] == "1.0", health
assert health["supports_status_polling"] is True, health

# Production discovery contract exposed by the real backend.
discovery = health["discovery"]
assert discovery["service"] == "_3c._tcp", discovery
assert discovery["logical_host"] == "3c-backend.local", discovery
assert int(discovery["port"]) == int(os.environ.get("DEVICE_API_PORT", "3000")), discovery

device_id = "panel-4848s040-3c-ci"
request_id = "panel-4848s040-3c-ci-001"
command = "Cambia la tarea J10 a mensual"

# The real Monitor must reject an unauthenticated ESP32 command.
code, unauthorized = request(
    "POST",
    "/api/device/v1/commands",
    {
        "device_id": device_id,
        "request_id": request_id,
        "text": command,
    },
    token="wrong-token",
)
assert code == 401, unauthorized

# This request matches the firmware JSON contract exactly.
code, queued = request(
    "POST",
    "/api/device/v1/commands",
    {
        "device_id": device_id,
        "request_id": request_id,
        "text": command,
    },
)
assert code == 202, queued
assert queued["status"] == "pending_confirmation", queued
assert queued["requires_human_confirmation"] is True, queued

command_id = queued["command_id"]
assert queued["status_path"] == f"/api/device/v1/commands/{command_id}", queued

# The ESP32 retries the same request safely through request_id idempotence.
code, duplicate = request(
    "POST",
    "/api/device/v1/commands",
    {
        "device_id": device_id,
        "request_id": request_id,
        "text": command,
    },
)
assert code == 200, duplicate
assert duplicate["duplicate"] is True, duplicate
assert duplicate["command_id"] == command_id, duplicate

# The Monitor exposes the pending command to its web UI.
code, pending_list = request(
    "GET",
    "/api/device/v1/commands/pending",
    token=None,
)
assert code == 200, pending_list
assert pending_list["command"]["id"] == command_id, pending_list
assert pending_list["command"]["status"] == "pending_confirmation", pending_list

# The ESP32 polls the authenticated status endpoint.
code, pending = request(
    "GET",
    f"/api/device/v1/commands/{command_id}",
)
assert code == 200, pending
assert pending["command"]["status"] == "pending_confirmation", pending
assert pending["command"]["request_id"] == request_id, pending

# This POST represents the Monitor/UI's human-confirmation result.
code, applied = request(
    "POST",
    f"/api/device/v1/commands/{command_id}/result",
    {"status": "applied", "result": "Fila J10 actualizada"},
    token=None,
)
assert code == 200, applied
assert applied["command"]["status"] == "applied", applied

# Final ESP32 polling must observe the terminal state.
code, terminal = request(
    "GET",
    f"/api/device/v1/commands/{command_id}",
)
assert code == 200, terminal
assert terminal["command"]["status"] == "applied", terminal
assert terminal["command"]["result"] == "Fila J10 actualizada", terminal

# No pending command should remain after confirmation.
code, after = request(
    "GET",
    f"/api/device/v1/commands/pending?after={command_id}",
    token=None,
)
assert code == 200, after
assert after["command"] is None, after

print("REAL MONITOR DEVICE API E2E: PASS")
print(f"- base: {BASE_URL}")
print(f"- discovery service: {discovery['service']}")
print(f"- discovery logical host: {discovery['logical_host']}")
print(f"- discovery port: {discovery['port']}")
print("- health contract")
print("- authentication")
print("- command enqueue")
print("- request_id idempotence")
print("- pending command visibility")
print("- authenticated status polling")
print("- human confirmation result")
print("- terminal applied polling")
print("- pending queue drained")
print()
print("=== PRODUCTION RESULT BLOCK ===")
print("DISCOVERY _3c._tcp       : PASS")
print("LOGICAL HOST 3c-backend  : PASS")
print("HEALTH / API              : PASS")
print("COMMAND + IDEMPOTENCE     : PASS")
print("HUMAN CONFIRMATION RESULT : PASS")
print("TERMINAL POLLING          : PASS")
print("SIMULATED ESP32 <-> 3C    : PASS")
print("=== END RESULT BLOCK ===")
