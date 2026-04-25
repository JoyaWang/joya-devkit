#!/usr/bin/env bash
set -euo pipefail

# gen-env-runtime.sh — 从 Vault 拉取 runtime secrets 并写入 srs/infra/env.runtime
# Object storage 正式合同为 SHARED_COS_*；dev/prod 差异由 Infisical environment 区分。
# 继续从 Vault / 与 /BE/runtime 拉取并合并输出 env.runtime。
# 用法: bash scripts/gen-env-runtime.sh [dev|prod]
# 默认: dev
# CI: 预置 VAULT_TOKEN，并可用 OUTPUT_PATH 覆盖输出位置。

ENV="${1:-dev}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
OUTPUT="${OUTPUT_PATH:-$PROJECT_DIR/srs/infra/env.runtime}"
VAULT_ENV="$HOME/.joya/vault/.env"
PID="${INFISICAL_PROJECT_ID_JOYA_DEVKIT:-}"
TOKEN="${VAULT_TOKEN:-}"

case "$ENV" in
  dev)
    TOKEN_KEY="INFISICAL_SERVICE_TOKEN_JOYA_DEVKIT_DEV"
    ;;
  prod|prd)
    ENV="prod"
    TOKEN_KEY="INFISICAL_SERVICE_TOKEN_JOYA_DEVKIT_PROD"
    ;;
  *) echo "❌ Unsupported env: $ENV (use dev or prod)" >&2; exit 1 ;;
esac

if [ -z "$PID" ] || [ -z "$TOKEN" ]; then
  if [ ! -f "$VAULT_ENV" ]; then
    echo "❌ Missing $VAULT_ENV and INFISICAL_PROJECT_ID_JOYA_DEVKIT / VAULT_TOKEN env vars" >&2
    exit 1
  fi

  PID="${PID:-$(grep '^INFISICAL_PROJECT_ID_JOYA_DEVKIT=' "$VAULT_ENV" | cut -d'=' -f2-)}"
  if [ -z "$TOKEN" ]; then
    TOKEN="$(grep "^${TOKEN_KEY}=" "$VAULT_ENV" | cut -d'=' -f2-)"
  fi
fi

if [ -z "$PID" ] || [ -z "$TOKEN" ]; then
  echo "❌ Missing PID or TOKEN for env=$ENV" >&2
  exit 1
fi

mkdir -p "$(dirname "$OUTPUT")"
echo "Pulling secrets from Vault (env=$ENV, output=$OUTPUT)..."

python3 - "$PID" "$ENV" "$TOKEN" "$OUTPUT" <<'PYEOF'
import json, sys, urllib.request

pid, env, token, output = sys.argv[1:5]
url = "https://vault.infinex.cn/api"
paths = ["/", "/BE/runtime"]

secrets_map = {}
for secret_path in paths:
    api = f"{url}/v3/secrets/raw?workspaceId={pid}&environment={env}&secretPath={secret_path}"
    req = urllib.request.Request(api, headers={"Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read())
            for item in data.get("secrets", []):
                key = item.get("secretKey") or item.get("key")
                value = item.get("secretValue") or item.get("value")
                if key is not None:
                    secrets_map[key] = str(value)
    except Exception as exc:
        print(f"Error: failed to fetch {secret_path}: {exc}", file=sys.stderr)
        sys.exit(1)

lines = []
for key, value in secrets_map.items():
    if "\n" in value:
        lines.append(f'{key}="{value}"')
    else:
        lines.append(f"{key}={value}")

with open(output, "w") as f:
    f.write("\n".join(lines) + "\n")

print(f"✅ Wrote {len(secrets_map)} secrets to {output} (env={env})")
PYEOF
