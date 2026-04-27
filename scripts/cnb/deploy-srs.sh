#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

[ -n "${DEPLOY_ENV:-}" ] || fail "DEPLOY_ENV required (dev|prod)"
resolve_commit
IMAGE_TAG="${IMAGE_TAG:-${DEPLOY_ENV}-${CNB_COMMIT}}"
SERVER_EXPORTS="$(mktemp)"
SSH_KEY_FILE="$(mktemp)"
cleanup() {
  rm -f "$SERVER_EXPORTS" "$SSH_KEY_FILE"
}
trap cleanup EXIT

fetch_tcr_credentials
fetch_server_credentials "$SERVER_EXPORTS" "$DEPLOY_ENV"
# shellcheck disable=SC1090
source "$SERVER_EXPORTS"

SERVER_HOST="${SHARED_SERVER_IP:-}"
SERVER_USER_VALUE="${SHARED_SERVER_USER:-}"
SERVER_PORT_VALUE="${SHARED_SERVER_PORT:-22}"
SERVER_KEY_VALUE="${SHARED_SERVER_SSH_KEY:-}"
SERVER_PASS_VALUE="${SHARED_SERVER_PASS:-}"

mask_secret "${SERVER_PASS_VALUE:-}"

[ -n "$SERVER_HOST" ] || fail "Missing server host for ${DEPLOY_ENV}"
[ -n "$SERVER_USER_VALUE" ] || fail "Missing server user for ${DEPLOY_ENV}"
if [ -n "$SERVER_KEY_VALUE" ]; then
  setup_ssh_key "$SERVER_KEY_VALUE" "$SSH_KEY_FILE"
elif [ -z "${SERVER_PASS_VALUE:-}" ]; then
  fail "Missing server SSH key or password for ${DEPLOY_ENV}"
fi

case "$DEPLOY_ENV" in
  dev)
    JOYA_DEVKIT_VAULT_TOKEN="${INFISICAL_SERVICE_TOKEN_JOYA_DEVKIT_DEV:-}"
    ;;
  prod)
    JOYA_DEVKIT_VAULT_TOKEN="${INFISICAL_SERVICE_TOKEN_JOYA_DEVKIT_PROD:-}"
    ;;
esac
[ -n "${JOYA_DEVKIT_VAULT_TOKEN:-}" ] || fail "Missing Vault token for joya-devkit ${DEPLOY_ENV}"

log "Prepare remote directories"
run_remote "$SERVER_PORT_VALUE" "$SERVER_USER_VALUE@$SERVER_HOST" \
  "mkdir -p /home/ubuntu/apps/joya-devkit/srs/infra /home/ubuntu/apps/joya-devkit/srs/scripts /home/ubuntu/apps/joya-devkit/scripts"

log "Upload deploy support files to server"
copy_to_remote "$SERVER_PORT_VALUE" "$SERVER_USER_VALUE@$SERVER_HOST:/home/ubuntu/apps/joya-devkit/srs/infra/docker-compose.yml" \
  "$PROJECT_ROOT/srs/infra/docker-compose.yml"
copy_to_remote "$SERVER_PORT_VALUE" "$SERVER_USER_VALUE@$SERVER_HOST:/home/ubuntu/apps/joya-devkit/srs/scripts/deploy-remote-ssh.sh" \
  "$PROJECT_ROOT/srs/scripts/deploy-remote-ssh.sh"
copy_to_remote "$SERVER_PORT_VALUE" "$SERVER_USER_VALUE@$SERVER_HOST:/home/ubuntu/apps/joya-devkit/scripts/check-runtime-env.sh" \
  "$PROJECT_ROOT/scripts/check-runtime-env.sh"
copy_to_remote "$SERVER_PORT_VALUE" "$SERVER_USER_VALUE@$SERVER_HOST:/home/ubuntu/apps/joya-devkit/scripts/docker-cleanup.sh" \
  "$PROJECT_ROOT/scripts/docker-cleanup.sh"

log "Generate env.runtime from Vault"
(
  cd "$PROJECT_ROOT"
  VAULT_TOKEN="$JOYA_DEVKIT_VAULT_TOKEN" \
  INFISICAL_PROJECT_ID_JOYA_DEVKIT="${INFISICAL_PROJECT_ID_JOYA_DEVKIT}" \
  OUTPUT_PATH=env.runtime \
  bash scripts/gen-env-runtime.sh "$DEPLOY_ENV"
)

log "Upload env.runtime to server"
copy_to_remote "$SERVER_PORT_VALUE" "$SERVER_USER_VALUE@$SERVER_HOST:/home/ubuntu/apps/joya-devkit/srs/infra/env.runtime" \
  "$PROJECT_ROOT/env.runtime"

log "Deploy SRS on server"
REMOTE_SCRIPT=$(cat <<'EOS'
set -euo pipefail
cd /home/ubuntu/apps/joya-devkit
chmod +x srs/scripts/deploy-remote-ssh.sh scripts/check-runtime-env.sh scripts/docker-cleanup.sh
echo "$TENCENT_TCR_PASS" | docker login ccr.ccs.tencentyun.com -u "$TENCENT_TCR_USER" --password-stdin
SRS_IMAGE_TAG="$IMAGE_TAG" docker compose -f srs/infra/docker-compose.yml pull api worker
bash srs/scripts/deploy-remote-ssh.sh "$DEPLOY_ENV" --skip-code-pull --skip-build --image-tag "$IMAGE_TAG"
EOS
)
run_remote "$SERVER_PORT_VALUE" "$SERVER_USER_VALUE@$SERVER_HOST" \
  "TENCENT_TCR_USER=$(printf '%q' "$TENCENT_TCR_USER") TENCENT_TCR_PASS=$(printf '%q' "$TENCENT_TCR_PASS") DEPLOY_ENV=$(printf '%q' "$DEPLOY_ENV") IMAGE_TAG=$(printf '%q' "$IMAGE_TAG") bash -lc $(printf '%q' "$REMOTE_SCRIPT")"

log "SRS deploy finished"
