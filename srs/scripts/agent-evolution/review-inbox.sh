#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
python_script="$script_dir/review-inbox.py"

if command -v python >/dev/null 2>&1; then
  exec python "$python_script" "$@"
fi

if command -v python3 >/dev/null 2>&1; then
  exec python3 "$python_script" "$@"
fi

echo "Python is required to run $python_script" >&2
exit 1
