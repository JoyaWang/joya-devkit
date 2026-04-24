#!/usr/bin/env bash
set -euo pipefail

# SRS prod 链路 E2E 测试
# 直接测试 SRS API（不走 Laicai backend）
# 用 prd token 验证 env 从 token 解析

BASE_URL="https://srs.infinex.cn"
TOKEN="prd-token-laicai"

echo "=== SRS prod E2E Test ==="
echo "BASE_URL=$BASE_URL"
echo ""

echo "=== 1. Health check ==="
curl -sS "${BASE_URL}/health" | jq .
echo ""

echo "=== 2. Upload request (no env field — SRS should use token's runtimeEnv) ==="
UPLOAD_RES=$(curl -sS -X POST "${BASE_URL}/v1/objects/upload-requests" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d '{
    "project": "laicai",
    "domain": "android",
    "scope": "release",
    "entityId": "e2e-prod-test",
    "fileKind": "test",
    "fileName": "e2e-prod-test.txt",
    "contentType": "text/plain",
    "size": 15
  }')
echo "$UPLOAD_RES" | jq .

OBJECT_KEY=$(echo "$UPLOAD_RES" | jq -r '.objectKey')
UPLOAD_URL=$(echo "$UPLOAD_RES" | jq -r '.uploadUrl')

if [ "$OBJECT_KEY" = "null" ] || [ -z "$OBJECT_KEY" ]; then
  echo "❌ Upload request failed — objectKey is null"
  exit 1
fi

echo ""
echo "=== 3. Verify objectKey contains 'prod' env ==="
if echo "$OBJECT_KEY" | grep -q "/prod/"; then
  echo "✅ objectKey env is 'prod': $OBJECT_KEY"
else
  echo "❌ objectKey env is NOT 'prod': $OBJECT_KEY"
  exit 1
fi

echo ""
echo "=== 4. Upload to presigned URL ==="
curl -sS -X PUT "$UPLOAD_URL" \
  -H "Content-Type: text/plain" \
  --data-binary "prod e2e test ok"
echo "✅ Upload done"

echo ""
echo "=== 5. Complete upload ==="
COMPLETE_RES=$(curl -sS -X POST "${BASE_URL}/v1/objects/complete" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d "{\"objectKey\": \"$OBJECT_KEY\", \"size\": 15}")
echo "$COMPLETE_RES" | jq .

echo ""
echo "=== 6. Download request ==="
DOWNLOAD_RES=$(curl -sS -X POST "${BASE_URL}/v1/objects/download-requests" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d "{\"objectKey\": \"$OBJECT_KEY\"}")
echo "$DOWNLOAD_RES" | jq .

DOWNLOAD_URL=$(echo "$DOWNLOAD_RES" | jq -r '.downloadUrl')
if [ "$DOWNLOAD_URL" = "null" ] || [ -z "$DOWNLOAD_URL" ]; then
  echo "❌ Download URL is null"
  exit 1
fi

echo ""
echo "=== 7. Verify download content ==="
CONTENT=$(curl -sS "$DOWNLOAD_URL")
if [ "$CONTENT" = "prod e2e test ok" ]; then
  echo "✅ Content matches: $CONTENT"
else
  echo "❌ Content mismatch: got '$CONTENT'"
  exit 1
fi

echo ""
echo "=== 8. Cleanup — delete object ==="
curl -sS -X DELETE "${BASE_URL}/v1/objects" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d "{\"objectKey\": \"$OBJECT_KEY\"}" | jq .

echo ""
echo "========================================="
echo "✅ SRS prod E2E 全链路通过！"
echo "========================================="
