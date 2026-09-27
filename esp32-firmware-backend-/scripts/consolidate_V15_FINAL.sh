#!/usr/bin/env bash
set -Eeuo pipefail

REPO="$(printenv V15_REPO || true)"
BRANCH="$(printenv V15_BRANCH || true)"
[[ -n "$REPO" ]] || REPO="wpv10barza/esp32-firmware-backend-"
[[ -n "$BRANCH" ]] || BRANCH="main"

BACKUP_DIR="docs/archive"

log() { printf '%s\n' "$*"; }
die() { log "ERROR: $*"; exit 1; }

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$ROOT" ]]; then
  die "not inside a Git repository"
fi
cd "$ROOT"

find_v141() {
  local configured
  configured="$(printenv V141_README || true)"

  if [[ -n "$configured" ]]; then
    [[ -f "$configured" ]] || return 2
    realpath "$configured"
    return 0
  fi

  if [[ -f "$ROOT/README.md" ]] && grep -Fq "V14.1" "$ROOT/README.md"; then
    realpath "$ROOT/README.md"
    return 0
  fi

  local candidate
  for candidate in     "$ROOT/README_V14.1.md"     "$ROOT/docs/README_V14.1.md"     "$ROOT/docs/README_V14.1/README.md"
  do
    if [[ -f "$candidate" ]] && grep -Fq "V14.1" "$candidate"; then
      realpath "$candidate"
      return 0
    fi
  done

  return 1
}

validate_v141() {
  local file="$1"
  local marker

  local required
  required=(
    "T-030 System ESP32-S3-4848S040"
    "Backend Asistente 3C"
    "V14.1"
    "3.2 Design of the system"
    "3.2.1 Electronic design"
    "3.2.2 Software design"
    "st7701_type8_init_operations"
    "server/deviceApi.ts"
    "server/deviceCommands.ts"
    "server/reviewControl.ts"
    "WEB FIRST then REPOSITORY AFTER"
  )

  for marker in "${required[@]}"; do
    grep -Fq "$marker" "$file" || {
      log "MISSING: $marker"
      return 1
    }
  done

  if grep -Fq "T-030 Sistema de Desarrollo Completo - Condiciones Iniciales V6 Benchmark" "$file"; then
    log "INVALID: candidate is the V6 Benchmark README"
    return 1
  fi

  return 0
}

if ! V141="$(find_v141)"; then
  log "V15 BLOCKED: authoritative local V14.1 README not found."
  log "Use README_V14.1.md or V141_README=/absolute/path/README.md."
  log "No remote GitHub write was attempted."
  exit 22
fi

log "V14.1 candidate: $V141"

if ! validate_v141 "$V141"; then
  log "V15 BLOCKED: V14.1 validation failed."
  exit 23
fi

log "V14.1 validation: PASS"

DRY_RUN="$(printenv V15_DRY_RUN || true)"
if [[ "$DRY_RUN" == "1" ]]; then
  log "DRY RUN: no remote access or write."
  exit 0
fi

command -v gh >/dev/null 2>&1 || die "GitHub CLI (gh) is required"
gh auth status >/dev/null 2>&1 || die "gh authentication required"

REMOTE_HEAD="$(gh api "repos/$REPO/git/ref/heads/$BRANCH" --jq '.object.sha')"
REMOTE_README_SHA="$(gh api "repos/$REPO/contents/README.md?ref=$REMOTE_HEAD" --jq '.sha')"

log "Remote HEAD frozen: $REMOTE_HEAD"
log "Remote README blob: $REMOTE_README_SHA"

mkdir -p "$BACKUP_DIR"
BACKUP="$BACKUP_DIR/README_PRE_V15_V6_$REMOTE_README_SHA.md"

gh api "repos/$REPO/contents/README.md?ref=$REMOTE_HEAD" --jq '.content' |
  tr -d '\n' |
  base64 --decode > "$BACKUP"

[[ "$(git hash-object "$BACKUP")" == "$REMOTE_README_SHA" ]] ||
  die "V6 backup hash mismatch"

TMP_V141="$(mktemp)"
TMP_REMOTE="$(mktemp)"
trap 'rm -f "$TMP_V141" "$TMP_REMOTE"' EXIT

cp "$V141" "$TMP_V141"
cp "$TMP_V141" "$ROOT/README.md"
cmp -s "$TMP_V141" "$ROOT/README.md" ||
  die "local README does not match V14.1"

REMOTE_CHECK="$(gh api "repos/$REPO/git/ref/heads/$BRANCH" --jq '.object.sha')"
[[ "$REMOTE_CHECK" == "$REMOTE_HEAD" ]] ||
  die "remote HEAD changed during preparation"

git add README.md "$BACKUP"

STAGED="$(git diff --cached --name-only)"
echo "$STAGED"

grep -Fxq "README.md" <<< "$STAGED" ||
  die "README.md is not staged"

grep -Fxq "$BACKUP" <<< "$STAGED" ||
  die "V6 backup is not staged"

COUNT="$(printf '%s\n' "$STAGED" | sed '/^$/d' | wc -l)"
[[ "$COUNT" -eq 2 ]] ||
  die "unexpected staged file count: $COUNT"

git commit -m "docs: controlled V15 consolidation from V14.1"

NEW_COMMIT="$(git rev-parse HEAD)"

CHANGED="$(git diff --name-only "$REMOTE_HEAD" "$NEW_COMMIT")"
while IFS= read -r path; do
  [[ -z "$path" ]] && continue
  case "$path" in
    README.md|docs/archive/README_PRE_V15_V6_*.md) ;;
    *) die "unexpected changed file: $path" ;;
  esac
done <<< "$CHANGED"

NO_PUSH="$(printenv V15_NO_PUSH || true)"
if [[ "$NO_PUSH" == "1" ]]; then
  log "NO PUSH: commit and scope verification complete."
  exit 0
fi

REMOTE_CHECK="$(gh api "repos/$REPO/git/ref/heads/$BRANCH" --jq '.object.sha')"
[[ "$REMOTE_CHECK" == "$REMOTE_HEAD" ]] ||
  die "remote HEAD changed before push"

git push origin "$NEW_COMMIT:refs/heads/$BRANCH"

FINAL_HEAD="$(gh api "repos/$REPO/git/ref/heads/$BRANCH" --jq '.object.sha')"
[[ "$FINAL_HEAD" == "$NEW_COMMIT" ]] ||
  die "remote branch does not point to V15 commit"

gh api "repos/$REPO/contents/README.md?ref=$NEW_COMMIT" --jq '.content' |
  tr -d '\n' |
  base64 --decode > "$TMP_REMOTE"

cmp -s "$TMP_V141" "$TMP_REMOTE" ||
  die "remote README is not byte-for-byte identical to V14.1"

log "V15 COMPLETE"
log "V6 backup: $BACKUP"
log "V15 commit: $NEW_COMMIT"
