#!/usr/bin/env bash
set -euo pipefail

FULL=false
LOG_FILE="${LOG_FILE:-}"

usage() {
  cat <<'USAGE'
Usage: bash scripts/docker-cleanup.sh [--full]

Clean Docker cache on a deployment host.

Options:
  --full   Also prune stopped containers and unused networks.
  --help   Show this help.
USAGE
}

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --full)
      FULL=true
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      fail "Unknown argument: $1"
      ;;
  esac
done

if [ -z "$LOG_FILE" ]; then
  PROJECT_DIR="${PROJECT_DIR:-$(pwd)}"
  LOG_FILE="$PROJECT_DIR/maintenance.log"
fi
mkdir -p /tmp >/dev/null 2>&1 || true
: >> "$LOG_FILE" 2>/dev/null || LOG_FILE="/tmp/joya-devkit-maintenance.log"

log() {
  echo "$*" | tee -a "$LOG_FILE"
}

log "[INFO] Disk usage before cleanup"
df -h / | tee -a "$LOG_FILE"
log "[INFO] Docker usage before cleanup"
docker system df 2>&1 | tee -a "$LOG_FILE" || true

log "[INFO] Running docker cleanup"
docker image prune -af 2>&1 | tee -a "$LOG_FILE" || true
docker builder prune -af 2>&1 | tee -a "$LOG_FILE" || true

if [ "$FULL" = true ]; then
  docker container prune -f 2>&1 | tee -a "$LOG_FILE" || true
  docker network prune -f 2>&1 | tee -a "$LOG_FILE" || true
fi

log "[INFO] Disk usage after cleanup"
df -h / | tee -a "$LOG_FILE"
log "[INFO] Docker usage after cleanup"
docker system df 2>&1 | tee -a "$LOG_FILE" || true
