#!/usr/bin/env bash
# e2e-verify.sh — End-to-end verification for all shared-runtime-services APIs.
#
# Prerequisites:
#   - API server running on BASE_URL (default http://localhost:3000)
#   - Database accessible and synced
#   - Seed data loaded (scripts/seed-projects.ts)
#
# Usage:
#   ./scripts/e2e-verify.sh
#
# Exit code 0 = all passed, 1 = at least one failure.

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
TOKEN="${TOKEN:-dev-token-infov}"
PROJECT="infov"

# Expected bucket names — read from env to support real COS credentials;
# fallback to placeholder bucket names for local dev without real COS.
EXPECTED_INFOV_DEV_BUCKET="${EXPECTED_INFOV_DEV_BUCKET:-${EXPECTED_INFOV_BUCKET:-infov-dev-bucket}}"
EXPECTED_INFOV_PROD_BUCKET="${EXPECTED_INFOV_PROD_BUCKET:-infov-prod-bucket}"
EXPECTED_LAICAI_DEV_BUCKET="${EXPECTED_LAICAI_DEV_BUCKET:-${EXPECTED_LAICAI_BUCKET:-laicai-dev-bucket}}"
EXPECTED_LAICAI_PROD_BUCKET="${EXPECTED_LAICAI_PROD_BUCKET:-laicai-prod-bucket}"

PASS=0
FAIL=0

assert_status() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" -eq "$expected" ]; then
    echo "  PASS: $name (status=$actual)"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $name (expected=$expected, got=$actual)"
    FAIL=$((FAIL + 1))
  fi
}

assert_has_field() {
  local name="$1" body="$2" field="$3"
  if echo "$body" | python3 -c "import sys,json; d=json.load(sys.stdin); assert '$field' in d, 'missing $field'" 2>/dev/null; then
    echo "  PASS: $name (has $field)"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $name (missing $field)"
    FAIL=$((FAIL + 1))
  fi
}

assert_field_eq() {
  local name="$1" body="$2" field="$3" expected="$4"
  actual=$(echo "$body" | python3 -c "import sys,json; print(json.load(sys.stdin).get('$field',''))" 2>/dev/null)
  if [ "$actual" = "$expected" ]; then
    echo "  PASS: $name ($field=$actual)"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $name ($field expected=$expected, got=$actual)"
    FAIL=$((FAIL + 1))
  fi
}

assert_field_contains() {
  local name="$1" body="$2" field="$3" substring="$4"
  actual=$(echo "$body" | python3 -c "import sys,json; print(json.load(sys.stdin).get('$field',''))" 2>/dev/null)
  if echo "$actual" | grep -q "$substring"; then
    echo "  PASS: $name ($field contains $substring)"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $name ($field does not contain '$substring', got '$actual')"
    FAIL=$((FAIL + 1))
  fi
}

echo "============================================"
echo "E2E Verification — $BASE_URL"
echo "============================================"

# --- I-01: Health check ---
echo ""
echo "[I-01] GET /health"
STATUS=$(curl -s -o /tmp/e2e-health.json -w "%{http_code}" "$BASE_URL/health")
BODY=$(cat /tmp/e2e-health.json)
assert_status "health returns 200" 200 "$STATUS"
assert_field_eq "health status=ok" "$BODY" "status" "ok"

# --- A-01: Auth checks ---
echo ""
echo "[A-01] Auth: missing token"
STATUS=$(curl -s -o /tmp/e2e-auth1.json -w "%{http_code}" -X POST "$BASE_URL/v1/objects/upload-requests" \
  -H "Content-Type: application/json" -d '{"project":"x"}')
assert_status "missing token returns 401" 401 "$STATUS"

echo ""
echo "[A-01] Auth: invalid token"
STATUS=$(curl -s -o /tmp/e2e-auth2.json -w "%{http_code}" -X POST "$BASE_URL/v1/objects/upload-requests" \
  -H "Authorization: Bearer bad-token" -H "Content-Type: application/json" -d '{"project":"x"}')
assert_status "invalid token returns 401" 401 "$STATUS"

# --- O-01: Upload request (infov/dev) ---
echo ""
echo "[O-01] POST /v1/objects/upload-requests (infov/dev)"
STATUS=$(curl -s -o /tmp/e2e-upload-infov-dev.json -w "%{http_code}" -X POST "$BASE_URL/v1/objects/upload-requests" \
  -H "Authorization: Bearer dev-token-infov" -H "Content-Type: application/json" \
  -d '{
    "project": "infov", "env": "dev", "domain": "member",
    "scope": "avatar", "entityId": "user_infov_dev",
    "fileKind": "profile", "fileName": "infov-dev.png",
    "contentType": "image/png", "size": 5120
  }')
BODY=$(cat /tmp/e2e-upload-infov-dev.json)
assert_status "infov dev upload returns 201" 201 "$STATUS"
assert_has_field "infov dev upload has objectKey" "$BODY" "objectKey"
assert_has_field "infov dev upload has uploadUrl" "$BODY" "uploadUrl"
assert_field_contains "infov dev objectKey format correct" "$BODY" "objectKey" "infov/dev/member/avatar/user_infov_dev"
assert_field_contains "infov dev upload URL hits dev bucket" "$BODY" "uploadUrl" "$EXPECTED_INFOV_DEV_BUCKET"
INFOV_DEV_OBJECT_KEY=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['objectKey'])" 2>/dev/null)

# --- O-01a: Upload request (infov/prod) ---
echo ""
echo "[O-01a] POST /v1/objects/upload-requests (infov/prod)"
STATUS=$(curl -s -o /tmp/e2e-upload-infov-prod.json -w "%{http_code}" -X POST "$BASE_URL/v1/objects/upload-requests" \
  -H "Authorization: Bearer prd-token-infov" -H "Content-Type: application/json" \
  -d '{
    "project": "infov", "env": "prod", "domain": "member",
    "scope": "avatar", "entityId": "user_infov_prod",
    "fileKind": "profile", "fileName": "infov-prod.png",
    "contentType": "image/png", "size": 4096
  }')
BODY=$(cat /tmp/e2e-upload-infov-prod.json)
assert_status "infov prod upload returns 201" 201 "$STATUS"
assert_field_contains "infov prod objectKey format correct" "$BODY" "objectKey" "infov/prod/member/avatar/user_infov_prod"
assert_field_contains "infov prod upload URL hits prod bucket" "$BODY" "uploadUrl" "$EXPECTED_INFOV_PROD_BUCKET"
INFOV_PROD_OBJECT_KEY=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['objectKey'])" 2>/dev/null)

# --- O-01b: Project mismatch ---
echo ""
echo "[O-01b] POST /v1/objects/upload-requests (project mismatch)"
STATUS=$(curl -s -o /tmp/e2e-mismatch-project.json -w "%{http_code}" -X POST "$BASE_URL/v1/objects/upload-requests" \
  -H "Authorization: Bearer dev-token-laicai" -H "Content-Type: application/json" \
  -d '{
    "project": "infov", "env": "dev", "domain": "member",
    "scope": "avatar", "entityId": "user_mismatch",
    "fileKind": "profile", "fileName": "mismatch.png",
    "contentType": "image/png", "size": 1024
  }')
BODY=$(cat /tmp/e2e-mismatch-project.json)
assert_status "project mismatch returns 403" 403 "$STATUS"
assert_field_contains "error is project_mismatch" "$BODY" "error" "project_mismatch"

# --- O-01c: Environment mismatch ---
echo ""
echo "[O-01c] POST /v1/objects/upload-requests (env mismatch)"
STATUS=$(curl -s -o /tmp/e2e-mismatch-env.json -w "%{http_code}" -X POST "$BASE_URL/v1/objects/upload-requests" \
  -H "Authorization: Bearer dev-token-infov" -H "Content-Type: application/json" \
  -d '{
    "project": "infov", "env": "prod", "domain": "member",
    "scope": "avatar", "entityId": "user_env_mismatch",
    "fileKind": "profile", "fileName": "env-mismatch.png",
    "contentType": "image/png", "size": 1024
  }')
BODY=$(cat /tmp/e2e-mismatch-env.json)
assert_status "env mismatch returns 403" 403 "$STATUS"
assert_field_contains "error is env_mismatch" "$BODY" "error" "env_mismatch"

# --- O-01d: laicai upload (dev) ---
echo ""
echo "[O-01d] POST /v1/objects/upload-requests (laicai/dev)"
STATUS=$(curl -s -o /tmp/e2e-upload-laicai-dev.json -w "%{http_code}" -X POST "$BASE_URL/v1/objects/upload-requests" \
  -H "Authorization: Bearer dev-token-laicai" -H "Content-Type: application/json" \
  -d '{
    "project": "laicai", "env": "dev", "domain": "member",
    "scope": "avatar", "entityId": "user_laicai_dev",
    "fileKind": "profile", "fileName": "laicai-dev.png",
    "contentType": "image/png", "size": 2048
  }')
BODY=$(cat /tmp/e2e-upload-laicai-dev.json)
assert_status "laicai dev upload returns 201" 201 "$STATUS"
assert_field_contains "laicai dev objectKey correct" "$BODY" "objectKey" "laicai/dev/member/avatar/user_laicai_dev"
assert_field_contains "laicai dev upload URL hits dev bucket" "$BODY" "uploadUrl" "$EXPECTED_LAICAI_DEV_BUCKET"
LAICAI_DEV_OBJECT_KEY=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['objectKey'])" 2>/dev/null)

# --- O-01e: laicai upload (prod) ---
echo ""
echo "[O-01e] POST /v1/objects/upload-requests (laicai/prod)"
STATUS=$(curl -s -o /tmp/e2e-upload-laicai-prod.json -w "%{http_code}" -X POST "$BASE_URL/v1/objects/upload-requests" \
  -H "Authorization: Bearer prd-token-laicai" -H "Content-Type: application/json" \
  -d '{
    "project": "laicai", "env": "prod", "domain": "member",
    "scope": "avatar", "entityId": "user_laicai_prod",
    "fileKind": "profile", "fileName": "laicai-prod.png",
    "contentType": "image/png", "size": 2048
  }')
BODY=$(cat /tmp/e2e-upload-laicai-prod.json)
assert_status "laicai prod upload returns 201" 201 "$STATUS"
assert_field_contains "laicai prod objectKey correct" "$BODY" "objectKey" "laicai/prod/member/avatar/user_laicai_prod"
assert_field_contains "laicai prod upload URL hits prod bucket" "$BODY" "uploadUrl" "$EXPECTED_LAICAI_PROD_BUCKET"
LAICAI_PROD_OBJECT_KEY=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['objectKey'])" 2>/dev/null)

# --- O-01f: Unbound project returns service_binding_missing ---
echo ""
echo "[O-01f] POST /v1/objects/upload-requests (unbound project)"
STATUS=$(curl -s -o /tmp/e2e-unbound.json -w "%{http_code}" -X POST "$BASE_URL/v1/objects/upload-requests" \
  -H "Authorization: Bearer dev-token-unbound" -H "Content-Type: application/json" \
  -d '{
    "project": "unbound", "env": "dev", "domain": "member",
    "scope": "avatar", "entityId": "user_unbound",
    "fileKind": "profile", "fileName": "unbound.png",
    "contentType": "image/png", "size": 1024
  }')
BODY=$(cat /tmp/e2e-unbound.json)
if [ "$STATUS" -eq 422 ]; then
  echo "  PASS: unbound project returns 422 (status=$STATUS)"
  PASS=$((PASS + 1))
else
  echo "  FAIL: unbound project expected 422, got $STATUS"
  FAIL=$((FAIL + 1))
fi
assert_field_contains "error mentions service_binding_missing" "$BODY" "error" "service_binding_missing"

# --- O-01g: Unregistered project returns project_not_registered ---
echo ""
echo "[O-01g] POST /v1/objects/upload-requests (ghost — not registered)"
STATUS=$(curl -s -o /tmp/e2e-ghost.json -w "%{http_code}" -X POST "$BASE_URL/v1/objects/upload-requests" \
  -H "Authorization: Bearer dev-token-ghost" -H "Content-Type: application/json" \
  -d '{
    "project": "ghost", "env": "dev", "domain": "member",
    "scope": "avatar", "entityId": "user_ghost",
    "fileKind": "profile", "fileName": "ghost.png",
    "contentType": "image/png", "size": 1024
  }')
BODY=$(cat /tmp/e2e-ghost.json)
assert_status "ghost project returns 422" 422 "$STATUS"
assert_field_contains "error is project_not_registered" "$BODY" "error" "project_not_registered"

# --- O-02: Invalid scope ---
echo ""
echo "[O-02] POST /v1/objects/upload-requests (invalid scope)"
STATUS=$(curl -s -o /tmp/e2e-scope.json -w "%{http_code}" -X POST "$BASE_URL/v1/objects/upload-requests" \
  -H "Authorization: Bearer dev-token-infov" -H "Content-Type: application/json" \
  -d '{
    "project": "infov", "env": "dev", "domain": "member",
    "scope": "evil_scope", "entityId": "user_infov_dev",
    "fileKind": "profile", "fileName": "bad.png",
    "contentType": "image/png", "size": 100
  }')
BODY=$(cat /tmp/e2e-scope.json)
assert_status "invalid scope returns 400" 400 "$STATUS"
assert_field_contains "error mentions invalid scope" "$BODY" "error" "invalid scope"

# --- O-03: Complete upload (infov/dev) ---
echo ""
echo "[O-03] POST /v1/objects/complete (infov/dev)"
STATUS=$(curl -s -o /tmp/e2e-complete-dev.json -w "%{http_code}" -X POST "$BASE_URL/v1/objects/complete" \
  -H "Authorization: Bearer dev-token-infov" -H "Content-Type: application/json" \
  -d "{\"objectKey\": \"$INFOV_DEV_OBJECT_KEY\", \"size\": 5120, \"checksum\": \"e2e-sha256\"}")
BODY=$(cat /tmp/e2e-complete-dev.json)
assert_status "complete dev returns 200" 200 "$STATUS"
assert_field_eq "complete dev status=active" "$BODY" "status" "active"

# --- O-03a: Download request (infov/dev) ---
echo ""
echo "[O-03a] POST /v1/objects/download-requests (infov/dev)"
STATUS=$(curl -s -o /tmp/e2e-download-dev.json -w "%{http_code}" -X POST "$BASE_URL/v1/objects/download-requests" \
  -H "Authorization: Bearer dev-token-infov" -H "Content-Type: application/json" \
  -d "{\"objectKey\": \"$INFOV_DEV_OBJECT_KEY\"}")
BODY=$(cat /tmp/e2e-download-dev.json)
assert_status "download dev returns 200" 200 "$STATUS"
assert_has_field "download dev has downloadUrl" "$BODY" "downloadUrl"
assert_field_contains "download dev URL hits infov dev bucket" "$BODY" "downloadUrl" "$EXPECTED_INFOV_DEV_BUCKET"

# --- O-03b: Delete object (infov/dev) ---
echo ""
echo "[O-03b] DELETE /v1/objects (infov/dev)"
STATUS=$(curl -s -o /tmp/e2e-delete-dev.json -w "%{http_code}" -X DELETE "$BASE_URL/v1/objects" \
  -H "Authorization: Bearer dev-token-infov" -H "Content-Type: application/json" \
  -d "{\"objectKey\": \"$INFOV_DEV_OBJECT_KEY\"}")
BODY=$(cat /tmp/e2e-delete-dev.json)
assert_status "delete dev returns 200" 200 "$STATUS"
assert_field_eq "delete dev status=deleted" "$BODY" "status" "deleted"

# --- O-03c: Download env mismatch should be rejected ---
echo ""
echo "[O-03c] POST /v1/objects/download-requests (env mismatch)"
STATUS=$(curl -s -o /tmp/e2e-download-env-mismatch.json -w "%{http_code}" -X POST "$BASE_URL/v1/objects/download-requests" \
  -H "Authorization: Bearer dev-token-infov" -H "Content-Type: application/json" \
  -d "{\"objectKey\": \"$INFOV_PROD_OBJECT_KEY\"}")
BODY=$(cat /tmp/e2e-download-env-mismatch.json)
assert_status "download env mismatch returns 403" 403 "$STATUS"
assert_field_contains "download env mismatch error" "$BODY" "error" "env_mismatch"

# --- R-01: Create release (Android) ---
echo ""
echo "[R-01] POST /v1/releases (Android)"
STATUS=$(curl -s -o /tmp/e2e-rel-android.json -w "%{http_code}" -X POST "$BASE_URL/v1/releases" \
  -H "Authorization: Bearer dev-token-infov" -H "Content-Type: application/json" \
  -d "{
    \"platform\": \"android\", \"env\": \"prod\",
    \"appVersion\": \"2.0.0\", \"buildNumber\": 99,
    \"semanticVersion\": \"2.0.0\",
    \"distributionTarget\": \"cos\",
    \"distributionUrl\": \"https://example.com/v2.apk\",
    \"releaseNotes\": \"E2E test release\"
  }")
BODY=$(cat /tmp/e2e-rel-android.json)
assert_status "create android release returns 201" 201 "$STATUS"
assert_has_field "release has id" "$BODY" "id"
assert_field_eq "release semanticVersion=2.0.0" "$BODY" "semanticVersion" "2.0.0"
assert_field_eq "release distributionTarget=cos" "$BODY" "distributionTarget" "cos"
assert_field_eq "release rolloutStatus=draft" "$BODY" "rolloutStatus" "draft"

RELEASE_ID=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null)

# --- R-01b: Create release (iOS) ---
echo ""
echo "[R-01b] POST /v1/releases (iOS)"
STATUS=$(curl -s -o /tmp/e2e-rel-ios.json -w "%{http_code}" -X POST "$BASE_URL/v1/releases" \
  -H "Authorization: Bearer dev-token-infov" -H "Content-Type: application/json" \
  -d "{
    \"platform\": \"ios\", \"env\": \"prod\",
    \"appVersion\": \"2.0.0\", \"buildNumber\": 99,
    \"semanticVersion\": \"2.0.0\",
    \"distributionTarget\": \"testflight\",
    \"distributionUrl\": \"https://testflight.apple.com/join/e2e\",
    \"releaseNotes\": \"E2E iOS release\"
  }")
BODY=$(cat /tmp/e2e-rel-ios.json)
assert_status "create ios release returns 201" 201 "$STATUS"
assert_field_eq "ios distributionTarget=testflight" "$BODY" "distributionTarget" "testflight"

# --- R-02: Get latest release ---
echo ""
echo "[R-02] GET /v1/releases/latest (android/prod)"
STATUS=$(curl -s -o /tmp/e2e-latest.json -w "%{http_code}" \
  "$BASE_URL/v1/releases/latest?platform=android&env=prod" \
  -H "Authorization: Bearer dev-token-infov")
BODY=$(cat /tmp/e2e-latest.json)
assert_status "latest release returns 200" 200 "$STATUS"
assert_field_eq "latest semanticVersion=2.0.0" "$BODY" "semanticVersion" "2.0.0"
assert_has_field "latest has distributionUrl" "$BODY" "distributionUrl"
assert_has_field "latest has forceUpdate" "$BODY" "forceUpdate"
assert_has_field "latest has minSupportedVersion" "$BODY" "minSupportedVersion"

# --- R-03: Patch release ---
echo ""
echo "[R-03] PATCH /v1/releases/:id"
STATUS=$(curl -s -o /tmp/e2e-patch.json -w "%{http_code}" \
  -X PATCH "$BASE_URL/v1/releases/$RELEASE_ID" \
  -H "Authorization: Bearer dev-token-infov" -H "Content-Type: application/json" \
  -d "{\"rolloutStatus\": \"active\", \"forceUpdate\": true, \"minSupportedVersion\": \"1.5.0\"}")
BODY=$(cat /tmp/e2e-patch.json)
assert_status "patch release returns 200" 200 "$STATUS"
assert_field_eq "patched rolloutStatus=active" "$BODY" "rolloutStatus" "active"
assert_field_eq "patched forceUpdate=true" "$BODY" "forceUpdate" "True"
assert_field_eq "patched minSupportedVersion=1.5.0" "$BODY" "minSupportedVersion" "1.5.0"

# --- R-04: List releases ---
echo ""
echo "[R-04] GET /v1/releases"
STATUS=$(curl -s -o /tmp/e2e-list.json -w "%{http_code}" \
  "$BASE_URL/v1/releases?platform=android&env=prod" \
  -H "Authorization: Bearer dev-token-infov")
BODY=$(cat /tmp/e2e-list.json)
assert_status "list releases returns 200" 200 "$STATUS"
assert_has_field "list has data array" "$BODY" "data"
assert_has_field "list has total" "$BODY" "total"

# --- L-01: Audit logs ---
echo ""
echo "[L-01] GET /v1/audit-logs"
STATUS=$(curl -s -o /tmp/e2e-audit.json -w "%{http_code}" \
  "$BASE_URL/v1/audit-logs?limit=5" \
  -H "Authorization: Bearer dev-token-infov")
BODY=$(cat /tmp/e2e-audit.json)
assert_status "audit logs returns 200" 200 "$STATUS"
assert_has_field "audit has data array" "$BODY" "data"
assert_has_field "audit has total" "$BODY" "total"

# --- Summary ---
echo ""
echo "============================================"
echo "Results: $PASS passed, $FAIL failed"
echo "============================================"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
