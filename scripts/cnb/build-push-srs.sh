#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

[ -n "${DEPLOY_ENV:-}" ] || fail "DEPLOY_ENV required (dev|prod)"
FORCE_NO_CACHE="${FORCE_NO_CACHE:-false}"

resolve_commit
IMAGE_TAG="${IMAGE_TAG:-${DEPLOY_ENV}-${CNB_COMMIT}}"
NO_CACHE_FLAG=""
if [ "$FORCE_NO_CACHE" = "true" ]; then
  NO_CACHE_FLAG="--no-cache"
elif [ "$FORCE_NO_CACHE" != "false" ]; then
  fail "FORCE_NO_CACHE must be true or false"
fi

fetch_tcr_credentials
docker_login_tcr

build_inspect_push() {
  local service="$1"
  local dockerfile="$2"
  local image="${TCR_REGISTRY}/${TCR_NAMESPACE}/${service}"

  log "Build ${service} image (${IMAGE_TAG})"
  docker build \
    $NO_CACHE_FLAG \
    --progress=plain \
    --cache-from "${image}:buildcache" \
    -f "$dockerfile" \
    -t "${image}:${IMAGE_TAG}" \
    -t "${image}:${DEPLOY_ENV}-latest" \
    "$PROJECT_ROOT/srs"

  log "Inspect ${service} image"
  docker image inspect "${image}:${IMAGE_TAG}" --format 'id={{.Id}} size={{.Size}} created={{.Created}}'
  docker images "$image" --format 'table {{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.Size}}'

  log "Push ${image}:${IMAGE_TAG}"
  date -u '+push-start=%Y-%m-%dT%H:%M:%SZ'
  docker push "${image}:${IMAGE_TAG}"
  date -u '+push-end=%Y-%m-%dT%H:%M:%SZ'

  log "Push ${image}:${DEPLOY_ENV}-latest"
  docker push "${image}:${DEPLOY_ENV}-latest"
}

build_inspect_push srs-api "$PROJECT_ROOT/srs/infra/Dockerfile.api"
build_inspect_push srs-worker "$PROJECT_ROOT/srs/infra/Dockerfile.worker"

log "SRS images pushed"
printf 'IMAGE_TAG=%s\n' "$IMAGE_TAG"
