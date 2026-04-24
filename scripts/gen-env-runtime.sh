#!/bin/bash
set -euo pipefail

# gen-env-runtime.sh — 从 Vault 拉取 runtime secrets 并写入 srs/infra/env.runtime
# Object storage 正式合同为 SHARED_COS_*；dev/prd 差异由 Infisical environment 区分。
# 继续从 Vault / 与 /BE/runtime 拉取并合并输出 env.runtime。
# 用法: bash scripts/gen-env-runtime.sh [dev|prd]
# 默认: dev

ENV="${1:-dev}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
OUTPUT="$PROJECT_DIR/srs/infra/env.runtime"

# 从 ~/.joya/vault/.env 读取 token
VAULT_ENV="$HOME/.joya/vault/.env"
if [ ! -f "$VAULT_ENV" ]; then
  echo "❌ Missing $VAULT_ENV" >&2
  exit 1
fi

PID=$(grep '^INFISICAL_PROJECT_ID_JOYA_DEVKIT=' "$VAULT_ENV" | cut -d'=' -f2-)
case "$ENV" in
  dev)
    TOKEN=$(grep '^INFISICAL_SERVICE_TOKEN_JOYA_DEVKIT_DEV=' "$VAULT_ENV" | cut -d'=' -f2-)
    ;;
  prod|prd)
    TOKEN=$(grep '^INFISICAL_SERVICE_TOKEN_JOYA_DEVKIT_PROD=' "$VAULT_ENV" | cut -d'=' -f2-)
    ENV="prod"
    ;;
  *) echo "❌ Unsupported env: $ENV (use dev or prd)" >&2; exit 1 ;;
esac

if [ -z "$PID" ] || [ -z "$TOKEN" ]; then
  echo "❌ Missing PID or TOKEN in $VAULT_ENV for env=$ENV" >&2
  exit 1
fi

echo "Pulling secrets from Vault (env=$ENV, pid=$PID)..."

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
        print(f"Warning: failed to fetch {secret_path}: {exc}", file=sys.stderr)

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
