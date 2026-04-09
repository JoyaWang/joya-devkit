#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path

from _common import append_event, resolve_repo_root


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Append an evolution event to the project inbox.")
    parser.add_argument("--repo-root", default=None)
    parser.add_argument("--trigger", required=True)
    parser.add_argument("--summary", required=True)
    parser.add_argument("--scope", default="project")
    parser.add_argument("--area", default="docs")
    parser.add_argument("--candidate", default="lessons_learned")
    parser.add_argument("--status", default="new")
    parser.add_argument("--file", action="append", dest="files", default=[])
    parser.add_argument("--tag", action="append", dest="tags", default=[])
    parser.add_argument("--tool", default="")
    parser.add_argument("--error-text", dest="error_text", default="")
    parser.add_argument("--notes", default="")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    repo_root = resolve_repo_root(Path(__file__), args.repo_root)

    event = append_event(
        repo_root,
        {
            "trigger": args.trigger,
            "scope": args.scope,
            "area": args.area,
            "summary": args.summary,
            "candidate": args.candidate,
            "status": args.status,
            "files": args.files,
            "tags": args.tags,
            "tool": args.tool,
            "error": args.error_text,
            "notes": args.notes,
        },
    )
    print(json.dumps(event, ensure_ascii=False, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
