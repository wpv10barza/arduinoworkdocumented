#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT="$ROOT/scripts/consolidate_V15_FINAL.sh"

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }

bash -n "$SCRIPT" || fail "bash syntax"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP" /tmp/v15-missing.log /tmp/v15-valid.log' EXIT

git -C "$TMP" init -q
git -C "$TMP" config user.email "v15-test@example.com"
git -C "$TMP" config user.name "V15 Test"
printf '# V6 Benchmark fixture\n' > "$TMP/README.md"
git -C "$TMP" add README.md
git -C "$TMP" commit -qm "fixture"

set +e
(
  cd "$TMP"
  V15_DRY_RUN=1 bash "$SCRIPT" > /tmp/v15-missing.log 2>&1
)
RC=$?
set -e

[[ "$RC" -eq 22 ]] || fail "missing V14.1 exit=$RC expected=22"
grep -Fq "V15 BLOCKED: authoritative local V14.1 README not found." /tmp/v15-missing.log ||
  fail "missing V14.1 diagnostic absent"
pass "missing V14.1 blocks safely"

cat > "$TMP/README_V14.1.md" <<'EOF'
# T-030 System ESP32-S3-4848S040
# Backend Asistente 3C
V14.1
## 3.2 Design of the system
### 3.2.1 Electronic design
### 3.2.2 Software design
st7701_type8_init_operations
server/deviceApi.ts
server/deviceCommands.ts
server/reviewControl.ts
WEB FIRST then REPOSITORY AFTER
No modification or reflashing of firmware
EOF

(
  cd "$TMP"
  V141_README="$TMP/README_V14.1.md" V15_DRY_RUN=1 bash "$SCRIPT" > /tmp/v15-valid.log 2>&1
) || {
  cat /tmp/v15-valid.log >&2
  fail "valid V14.1 dry-run failed"
}

grep -Fq "V14.1 validation: PASS" /tmp/v15-valid.log ||
  fail "V14.1 PASS diagnostic absent"
pass "valid V14.1 passes all controls"

echo "ALL V15 CONSOLIDATION TESTS PASSED"
