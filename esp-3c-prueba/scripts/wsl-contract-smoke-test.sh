#!/usr/bin/env bash
set -euo pipefail

api_base_url="${API_BASE_URL:-http://127.0.0.1:3000}"
device_token="${ESP32_API_TOKEN:-}"

if [[ -z "${device_token}" ]]; then
  echo "ERROR: defina ESP32_API_TOKEN con el mismo valor usado por asistente-3c." >&2
  exit 2
fi

echo "[1/2] Verificando health en ${api_base_url}"
curl --fail --silent --show-error "${api_base_url}/api/device/v1/health"
echo

request_id="wsl-smoke-$(date +%s)"
echo "[2/2] Enviando comando idempotente ${request_id}"
curl --fail --silent --show-error \
  --request POST \
  --header "Content-Type: application/json" \
  --header "X-3C-Device-Token: ${device_token}" \
  --data "{\"device_id\":\"wsl-contract-test\",\"request_id\":\"${request_id}\",\"text\":\"Cambiar la tarea T-030 a cada 30 días\"}" \
  "${api_base_url}/api/device/v1/commands"
echo

