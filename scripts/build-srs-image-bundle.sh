#!/usr/bin/env bash
set -euo pipefail

IMAGE_TAG="${GITHUB_SHA:-}"
OUTPUT_DIR="incoming"
PLATFORM="linux/amd64"

usage() {
  cat <<'USAGE'
Usage: bash scripts/build-srs-image-bundle.sh --image-tag <sha> [--output-dir incoming] [--platform linux/amd64]

Build SRS api/worker Docker images in GitHub Actions and save them as a gzip tar bundle for SCP deployment.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --image-tag)
      IMAGE_TAG="${2:-}"
      shift 2
      ;;
    --output-dir)
      OUTPUT_DIR="${2:-incoming}"
      shift 2
      ;;
    --platform)
      PLATFORM="${2:-linux/amd64}"
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

if [ -z "$IMAGE_TAG" ]; then
  echo "ERROR: --image-tag is required" >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR"
BUNDLE_PATH="$OUTPUT_DIR/srs-images-${IMAGE_TAG}.tar.gz"

API_IMAGE="joya-devkit-srs-api:${IMAGE_TAG}"
API_LATEST="joya-devkit-srs-api:prod-latest"
WORKER_IMAGE="joya-devkit-srs-worker:${IMAGE_TAG}"
WORKER_LATEST="joya-devkit-srs-worker:prod-latest"

if docker buildx version >/dev/null 2>&1; then
  docker buildx create --use --name srs-builder >/dev/null 2>&1 || docker buildx use srs-builder >/dev/null 2>&1 || true
  docker buildx build --platform "$PLATFORM" --load -f srs/infra/Dockerfile.api -t "$API_IMAGE" -t "$API_LATEST" srs
  docker buildx build --platform "$PLATFORM" --load -f srs/infra/Dockerfile.worker -t "$WORKER_IMAGE" -t "$WORKER_LATEST" srs
else
  docker build -f srs/infra/Dockerfile.api -t "$API_IMAGE" -t "$API_LATEST" srs
  docker build -f srs/infra/Dockerfile.worker -t "$WORKER_IMAGE" -t "$WORKER_LATEST" srs
fi

docker save "$API_IMAGE" "$API_LATEST" "$WORKER_IMAGE" "$WORKER_LATEST" | gzip -9 > "$BUNDLE_PATH"

BUNDLE_SIZE_BYTES="$(wc -c < "$BUNDLE_PATH" | tr -d ' ')"
echo "Built SRS image bundle: $BUNDLE_PATH (${BUNDLE_SIZE_BYTES} bytes)"
