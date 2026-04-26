#!/usr/bin/env bash
set -euo pipefail

TCR_REGISTRY="${TCR_REGISTRY:-ccr.ccs.tencentyun.com}"
TCR_NAMESPACE="${TCR_NAMESPACE:-joyawang}"
INFISICAL_API_BASE="${INFISICAL_API_BASE:-https://vault.infinex.cn/api}"
INFRA_PROJECT_ID="${INFISICAL_PROJECT_ID_INFRA:-57fa9556-edcd-4254-8065-2fd0e18bd816}"
PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"

log() {
  printf '=== %s ===\n' "$*"
}

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

require_env() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    fail "Missing required env: $name"
  fi
}

mask_secret() {
  # CNB does not support GitHub Actions ::add-mask:: semantics.
  # Never print secret values; keep this helper as a no-op for shared call sites.
  :
}

resolve_commit() {
  CNB_COMMIT="${CNB_COMMIT:-$(git -C "$PROJECT_ROOT" rev-parse HEAD)}"
  CNB_COMMIT_SHORT="${CNB_COMMIT_SHORT:-${CNB_COMMIT:0:8}}"
  CNB_BRANCH="${CNB_BRANCH:-$(git -C "$PROJECT_ROOT" branch --show-current 2>/dev/null || true)}"
  export CNB_COMMIT CNB_COMMIT_SHORT CNB_BRANCH
}

fetch_infisical_path() {
  local project_id="$1"
  local environment="$2"
  local secret_path="$3"
  local token="$4"
  python3 - "$project_id" "$environment" "$secret_path" "$token" <<'PYEOF'
import json, sys, urllib.request
pid, env, secret_path, token = sys.argv[1:5]
url = f"https://vault.infinex.cn/api/v3/secrets/raw?workspaceId={pid}&environment={env}&secretPath={secret_path}"
req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
with urllib.request.urlopen(req) as resp:
    data = json.loads(resp.read().decode())
for item in data.get("secrets", []):
    key = item.get("secretKey") or item.get("key")
    value = item.get("secretValue") or item.get("value")
    if key is None or value is None:
        continue
    print(f"{key}={value}")
PYEOF
}

write_exports_from_kv() {
  local env_file="$1"
  python3 - "$env_file" <<'PYEOF'
import os, shlex, sys
path = sys.argv[1]
with open(path, "w") as out:
    for line in sys.stdin:
        line = line.rstrip("\n")
        if not line or "=" not in line:
            continue
        key, value = line.split("=", 1)
        out.write(f"export {key}={shlex.quote(value)}\n")
PYEOF
}

fetch_tcr_credentials() {
  require_env INFISICAL_SERVICE_TOKEN_INFRA_PROD
  local tmp
  tmp="$(mktemp)"
  fetch_infisical_path "$INFRA_PROJECT_ID" prod /providers "$INFISICAL_SERVICE_TOKEN_INFRA_PROD" > "$tmp"
  TENCENT_TCR_USER="$(awk -F= '$1=="TENCENT_TCR_USER" {print substr($0, index($0,"=")+1)}' "$tmp")"
  TENCENT_TCR_PASS="$(awk -F= '$1=="TENCENT_TCR_PASS" {print substr($0, index($0,"=")+1)}' "$tmp")"
  rm -f "$tmp"
  [ -n "$TENCENT_TCR_USER" ] || fail "TENCENT_TCR_USER missing from infra /providers"
  [ -n "$TENCENT_TCR_PASS" ] || fail "TENCENT_TCR_PASS missing from infra /providers"
  mask_secret "$TENCENT_TCR_PASS"
  export TENCENT_TCR_USER TENCENT_TCR_PASS
  log "TCR credentials loaded from Vault"
}

fetch_server_credentials() {
  require_env INFISICAL_SERVICE_TOKEN_INFRA_PROD
  local env_file="$1"
  local tmp
  tmp="$(mktemp)"
  fetch_infisical_path "$INFRA_PROJECT_ID" prod /servers "$INFISICAL_SERVICE_TOKEN_INFRA_PROD" > "$tmp"
  write_exports_from_kv "$env_file" < "$tmp"
  rm -f "$tmp"
  log "Server credentials export file generated"
}

docker_login_tcr() {
  require_env TENCENT_TCR_USER
  require_env TENCENT_TCR_PASS
  echo "$TENCENT_TCR_PASS" | docker login "$TCR_REGISTRY" -u "$TENCENT_TCR_USER" --password-stdin
}

setup_ssh_key() {
  local key_value="$1"
  local key_file="$2"
  [ -n "$key_value" ] || fail "SSH key value is empty"
  umask 077
  if printf '%s' "$key_value" | grep -q -- '-----BEGIN '; then
    printf '%s\n' "$key_value" > "$key_file"
  else
    printf '%s' "$key_value" | base64 -d > "$key_file"
  fi
  chmod 600 "$key_file"
}

run_remote() {
  local port="$1"
  local target="$2"
  shift 2
  if [ -n "${SERVER_PASS_VALUE:-}" ]; then
    sshpass -p "$SERVER_PASS_VALUE" ssh -o StrictHostKeyChecking=no -p "$port" "$target" "$@"
  else
    ssh -i "$SSH_KEY_FILE" -o StrictHostKeyChecking=no -p "$port" "$target" "$@"
  fi
}

copy_to_remote() {
  local port="$1"
  local target="$2"
  shift 2
  if [ -n "${SERVER_PASS_VALUE:-}" ]; then
    sshpass -p "$SERVER_PASS_VALUE" scp -o StrictHostKeyChecking=no -P "$port" "$@" "$target"
  else
    scp -i "$SSH_KEY_FILE" -o StrictHostKeyChecking=no -P "$port" "$@" "$target"
  fi
}
