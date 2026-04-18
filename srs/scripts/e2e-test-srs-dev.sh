#!/usr/bin/env bash
set -euo pipefail

BASE_URL="https://laicai-backend-1gg5v8qi80e5cef8-1321178972.ap-shanghai.app.tcloudbase.com"
TOKEN="test_token_dev_12345"

echo "=== 1. Health check ==="
curl -sS "${BASE_URL}/storage/health" | jq .

echo ""
echo "=== 2. Upload request ==="
UPLOAD_RES=$(curl -sS -X POST "${BASE_URL}/storage/upload-request" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d '{
    "domain": "laicai",
    "scope": "test",
    "fileName": "e2e-test.txt",
    "fileKind": "test",
    "contentType": "text/plain",
    "size": 13
  }')
echo "$UPLOAD_RES" | jq .

OBJECT_KEY=$(echo "$UPLOAD_RES" | jq -r '.data.objectKey')
UPLOAD_URL=$(echo "$UPLOAD_RES" | jq -r '.data.uploadUrl')
PUBLIC_URL=$(echo "$UPLOAD_RES" | jq -r '.data.publicUrl')

echo ""
echo "=== 3. Direct upload to presigned URL ==="
curl -sS -X PUT "$UPLOAD_URL" \
  -H "Content-Type: text/plain" \
  --data-binary "Hello SRS E2E!"

echo ""
echo "=== 4. Complete upload ==="
curl -sS -X POST "${BASE_URL}/storage/complete" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d "{\"objectKey\": \"$OBJECT_KEY\", \"size\": 13}" | jq .

echo ""
echo "=== 5. Download request (private signed URL) ==="
curl -sS -X POST "${BASE_URL}/storage/download-request" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d "{\"objectKey\": \"$OBJECT_KEY\"}" | jq .

echo ""
echo "=== 6. Public URL (after completion) ==="
echo "$PUBLIC_URL"
