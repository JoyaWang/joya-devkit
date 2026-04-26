#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export DEPLOY_ENV=dev
"$SCRIPT_DIR/build-push-srs.sh"
"$SCRIPT_DIR/deploy-srs.sh"
