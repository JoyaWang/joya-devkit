#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

from _common import append_event, compact_text, resolve_repo_root

ERROR_PATTERNS = (
    "error:",
    "failed",
    "fatal:",
    "exception",
    "traceback",
    "command not found",
    "permission denied",
    "no such file",
    "exit code",
    "non-zero",
    "timeout",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Log tool failures into the evolution inbox.")
    parser.add_argument("--repo-root", default=None)
    parser.add_argument("--tool-name", default="")
    parser.add_argument("--error-text", default="")
    parser.add_argument("--summary", default="")
    return parser.parse_args()


def read_stdin_payload() -> dict[str, Any] | None:
    if sys.stdin.isatty():
        return None

    raw = sys.stdin.read()
    if not raw.strip():
        return None

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return None

    return payload if isinstance(payload, dict) else None


def collect_files(tool_input: Any) -> list[str]:
    if not isinstance(tool_input, dict):
        return []

    candidates: list[str] = []
    for key in ("file_path", "path", "target_file"):
        value = tool_input.get(key)
        if isinstance(value, str) and value.strip():
            candidates.append(value.strip())

    paths = tool_input.get("paths")
    if isinstance(paths, list):
        for item in paths:
            if isinstance(item, str) and item.strip():
                candidates.append(item.strip())

    unique: list[str] = []
    seen: set[str] = set()
    for candidate in candidates:
        if candidate in seen:
            continue
        seen.add(candidate)
        unique.append(candidate)
    return unique


def infer_area(tool_name: str) -> str:
    lowered = tool_name.lower()
    if lowered in {"bash", "shell", "terminal", "powershell"}:
        return "cli"
    if lowered in {"edit", "write", "multiedit"}:
        return "repo"
    return "tools"


def build_from_hook(payload: dict[str, Any]) -> dict[str, Any] | None:
    tool_name = str(payload.get("tool_name") or payload.get("tool") or "tool")
    tool_input = payload.get("tool_input") or {}

    error_text = payload.get("error")
    if not isinstance(error_text, str) or not error_text.strip():
        response = payload.get("tool_response")
        if isinstance(response, dict):
            error_text = str(response.get("error") or response.get("stderr") or "").strip()
        elif isinstance(response, str):
            error_text = response.strip()

    if not isinstance(error_text, str) or not error_text.strip():
        return None

    collapsed = compact_text(error_text)
    input_excerpt = ""
    if isinstance(tool_input, dict) and tool_input:
        input_excerpt = compact_text(json.dumps(tool_input, ensure_ascii=False), limit=260)

    notes = f"Hook event: PostToolUseFailure"
    if input_excerpt:
        notes += f"; tool_input={input_excerpt}"

    return {
        "trigger": "tool_error",
        "scope": "project",
        "area": infer_area(tool_name),
        "summary": f"{tool_name} failed: {collapsed}",
        "candidate": "lessons_learned",
        "status": "new",
        "files": collect_files(tool_input),
        "tool": tool_name,
        "error": collapsed,
        "notes": notes,
    }


def build_from_env(tool_name_arg: str, error_text_arg: str, summary_arg: str) -> dict[str, Any] | None:
    tool_output = error_text_arg.strip()
    if not tool_output:
        for key in ("CODEX_TOOL_OUTPUT", "CLAUDE_TOOL_OUTPUT", "TOOL_OUTPUT", "LAST_COMMAND_OUTPUT"):
            value = os.environ.get(key, "").strip()
            if value:
                tool_output = value
                break

    if not tool_output:
        return None

    lowered = tool_output.lower()
    if not any(pattern in lowered for pattern in ERROR_PATTERNS):
        return None

    tool_name = tool_name_arg.strip()
    if not tool_name:
        for key in ("CODEX_TOOL_NAME", "CLAUDE_TOOL_NAME", "TOOL_NAME"):
            value = os.environ.get(key, "").strip()
            if value:
                tool_name = value
                break
    if not tool_name:
        tool_name = "tool"

    collapsed = compact_text(tool_output)
    summary = summary_arg.strip() or f"{tool_name} returned an error: {collapsed}"

    return {
        "trigger": "tool_error",
        "scope": "project",
        "area": infer_area(tool_name),
        "summary": summary,
        "candidate": "lessons_learned",
        "status": "new",
        "tool": tool_name,
        "error": collapsed,
    }


def main() -> int:
    args = parse_args()
    repo_root = resolve_repo_root(Path(__file__), args.repo_root)

    fields = build_from_hook(read_stdin_payload() or {})
    if fields is None:
        fields = build_from_env(args.tool_name, args.error_text, args.summary)

    if fields is None:
        return 0

    append_event(repo_root, fields)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
