#!/usr/bin/env bash
set -euo pipefail

TARGET_ENV="${1:-}"
shift || true
FORCE_NO_CACHE="false"
SKIP_CODE_PULL="false"
IMAGE_BUNDLE=""
SRS_IMAGE_TAG=""
PROJECT_DIR="${PROJECT_DIR:-/home/ubuntu/apps/joya-devkit}"

usage() {
  cat <<'USAGE'
Usage: bash srs/scripts/deploy-remote-ssh.sh dev|prod [--force-no-cache true|false] [--skip-code-pull] [--image-bundle <path>] [--image-tag <sha>]

Run joya-devkit SRS deploy on remote server.

Options:
  --force-no-cache true|false  Use --no-cache for Docker build. Defaults to false.
  --skip-code-pull             Do not run git fetch/reset inside this script; caller already updated code.
  --image-bundle <path>        Load prebuilt api/worker Docker images from a gzip docker save bundle.
  --image-tag <sha>            SRS api/worker Docker image tag to run.
  --help                       Show this help.
USAGE
}

fail() {
  echo "[FAIL] $*" | tee -a "$LOG_FILE" >&2
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --force-no-cache)
      FORCE_NO_CACHE="${2:-false}"
      shift 2
      ;;
    --skip-code-pull)
      SKIP_CODE_PULL="true"
      shift
      ;;
    --image-bundle)
      IMAGE_BUNDLE="${2:-}"
      shift 2
      ;;
    --image-tag)
      SRS_IMAGE_TAG="${2:-}"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "ERROR: Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

case "$TARGET_ENV" in
  dev)
    BRANCH="dev"
    MIN_FREE_KB=$((5 * 1024 * 1024))
    ;;
  prod)
    BRANCH="main"
    MIN_FREE_KB=""
    ;;
  *)
    echo "ERROR: env must be dev or prod" >&2
    usage >&2
    exit 1
    ;;
esac

LOG_FILE="${LOG_FILE:-$PROJECT_DIR/deploy.log}"
mkdir -p /tmp >/dev/null 2>&1 || true
: >> "$LOG_FILE" 2>/dev/null || LOG_FILE="/tmp/joya-devkit-deploy.log"

log() {
  echo "$*" | tee -a "$LOG_FILE"
}

BUILD_FLAGS=""
if [ "$FORCE_NO_CACHE" = "true" ]; then
  BUILD_FLAGS="--no-cache"
elif [ "$FORCE_NO_CACHE" != "false" ]; then
  fail "--force-no-cache must be true or false"
fi

if [ -n "$IMAGE_BUNDLE" ] && [ -z "$SRS_IMAGE_TAG" ]; then
  fail "--image-tag is required when --image-bundle is set"
fi

check_disk_after_cleanup() {
  [ "$TARGET_ENV" = "dev" ] || return 0
  local free_kb
  free_kb="$(df -Pk / | awk 'NR==2 {print $4}')"
  if [ -z "$free_kb" ] || [ "$free_kb" -lt "$MIN_FREE_KB" ]; then
    fail "Free disk below threshold after cleanup: ${free_kb:-unknown} KB (< $MIN_FREE_KB KB)"
  fi
  log "[OK] Free disk after cleanup: $free_kb KB"
}

retry_git_update() {
  cd "$PROJECT_DIR"
  for attempt in 1 2 3 4 5; do
    if git fetch origin "$BRANCH" && git reset --hard "origin/$BRANCH"; then
      log "[OK] Code pulled"
      return 0
    fi
    if [ "$attempt" = "5" ]; then
      fail "Code pull failed after ${attempt} attempts"
    fi
    log "[WARN] Code pull failed (attempt ${attempt}/5); retrying..."
    sleep $((attempt * 5))
  done
}

pull_latest_code() {
  if [ "$SKIP_CODE_PULL" = "true" ]; then
    log "[OK] Code pull skipped by caller"
    return 0
  fi
  retry_git_update
}

validate_runtime_env() {
  local runtime_env="$PROJECT_DIR/srs/infra/env.runtime"
  local incoming_runtime_env="$PROJECT_DIR/incoming/srs/infra/env.runtime"
  if [ -f "$incoming_runtime_env" ]; then
    mkdir -p "$(dirname "$runtime_env")"
    cp "$incoming_runtime_env" "$runtime_env"
    log "[OK] Runtime env refreshed from incoming artifact"
  fi
  if [ ! -f "$runtime_env" ]; then
    fail "Missing env.runtime — Vault secrets not deployed"
  fi
  bash scripts/check-runtime-env.sh "$runtime_env" 2>&1 | tee -a "$LOG_FILE"
}

load_image_bundle() {
  [ -n "$IMAGE_BUNDLE" ] || return 0
  local bundle_path="$PROJECT_DIR/$IMAGE_BUNDLE"
  if [ ! -f "$bundle_path" ]; then
    fail "Missing image bundle: $bundle_path"
  fi
  local image_tar
  image_tar="$(mktemp /tmp/srs-images.XXXXXX.tar)"
  gzip -dc "$bundle_path" > "$image_tar"
  docker load -i "$image_tar" 2>&1 | tee -a "$LOG_FILE"
  rm -f "$image_tar"
  log "[OK] Docker image bundle loaded: $IMAGE_BUNDLE"
}

build_images() {
  if [ -n "$IMAGE_BUNDLE" ]; then
    log "[OK] Docker build skipped; using prebuilt image bundle"
    return 0
  fi
  docker compose -f srs/infra/docker-compose.yml build $BUILD_FLAGS api worker 2>&1 | tee -a "$LOG_FILE"
  log "[OK] Build complete (flags: ${BUILD_FLAGS:-none})"
}

restart_services() {
  if [ -n "$SRS_IMAGE_TAG" ]; then
    SRS_IMAGE_TAG="$SRS_IMAGE_TAG" docker compose -f srs/infra/docker-compose.yml up -d --no-deps api worker 2>&1 | tee -a "$LOG_FILE"
  else
    docker compose -f srs/infra/docker-compose.yml up -d --no-deps --build api worker 2>&1 | tee -a "$LOG_FILE"
  fi
  log "[OK] Services restarted"
}

run_migrations_and_seed() {
  docker compose -f srs/infra/docker-compose.yml exec -T api sh -lc 'printenv DATABASE_URL >/dev/null && npx prisma migrate deploy --schema ./prisma/schema.prisma' 2>&1 | tee -a "$LOG_FILE"
  log "[OK] Migrations applied"

  docker compose -f srs/infra/docker-compose.yml exec -T api node dist-seed/scripts/seed-projects.js 2>&1 | tee -a "$LOG_FILE"
  log "[OK] Seed done"

  docker compose -f srs/infra/docker-compose.yml restart api 2>&1 | tee -a "$LOG_FILE"
  log "[OK] API restarted after seed"
}

health_check() {
  sleep 5
  local http_status
  http_status="$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3010/health || echo "000")"
  if [ "$http_status" -ge 200 ] && [ "$http_status" -lt 300 ]; then
    log "[OK] Health check passed (HTTP $http_status)"
  else
    log "[FAIL] Health check returned HTTP $http_status"
    docker compose -f srs/infra/docker-compose.yml logs api --tail 20 2>&1 | tee -a "$LOG_FILE"
    exit 1
  fi
}

verify_worker() {
  local worker_status
  worker_status="$(docker compose -f srs/infra/docker-compose.yml ps worker --format json 2>/dev/null | grep -o '"Health":"[^"]*"' | head -1 || echo "unknown")"
  log "[INFO] Worker status: $worker_status"
}

main() {
  log "=== ${TARGET_ENV} deploy started at $(date '+%Y-%m-%d %H:%M:%S') ==="
  PROJECT_DIR="$PROJECT_DIR" LOG_FILE="$LOG_FILE" bash "$PROJECT_DIR/scripts/docker-cleanup.sh"
  check_disk_after_cleanup
  pull_latest_code
  validate_runtime_env
  load_image_bundle
  build_images
  restart_services
  run_migrations_and_seed
  health_check
  verify_worker
  docker image prune -f 2>&1 | tee -a "$LOG_FILE"
  log "=== ${TARGET_ENV} deploy finished at $(date '+%Y-%m-%d %H:%M:%S') ==="
}

main "$@"
