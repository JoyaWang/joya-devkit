#!/bin/bash
set -euo pipefail

# check-runtime-env.sh — deploy gate: 校验 runtime env 必需变量
# 用法: bash scripts/check-runtime-env.sh [env-file]
# 默认: srs/infra/.env.runtime

ENV_FILE="${1:-srs/infra/env.runtime}"

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ Missing runtime env: $ENV_FILE"
  exit 1
fi

REQUIRED_VARS=(
  "DATABASE_URL"
  "REDIS_URL"
  "SERVICE_TOKENS"
  "COS_SECRET_ID"
  "COS_SECRET_KEY"
)

MISSING=()
for var in "${REQUIRED_VARS[@]}"; do
  value=$(grep "^${var}=" "$ENV_FILE" | cut -d'=' -f2- || true)
  if [ -z "$value" ] || [[ "$value" == CHANGE_ME_* ]]; then
    MISSING+=("$var")
  fi
done

if [ ${#MISSING[@]} -gt 0 ]; then
  echo "❌ Missing/placeholder env vars: ${MISSING[*]}"
  echo "   File: $ENV_FILE"
  exit 1
fi

echo "✅ Runtime env check passed (${#REQUIRED_VARS[@]} vars OK)"
echo "   File: $ENV_FILE"
