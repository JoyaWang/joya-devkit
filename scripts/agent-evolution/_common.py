#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any

DEFAULT_STATE: dict[str, Any] = {
    "version": 1,
    "last_reviewed_at": None,
    "last_promoted_at": None,
}

PENDING_STATUSES = {"new", "triaged", "in_review"}


def resolve_repo_root(script_path: Path, repo_root: str | None = None) -> Path:
    if repo_root:
        return Path(repo_root).expanduser().resolve()
    return script_path.expanduser().absolute().parents[2]


def evolution_paths(repo_root: Path) -> tuple[Path, Path, Path]:
    evolution_dir = repo_root / ".agent" / "evolution"
    return evolution_dir, evolution_dir / "inbox.jsonl", evolution_dir / "state.json"


def write_json(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default

    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return default


def ensure_runtime(repo_root: Path) -> tuple[Path, Path, Path]:
    evolution_dir, inbox_path, state_path = evolution_paths(repo_root)
    evolution_dir.mkdir(parents=True, exist_ok=True)

    if not state_path.exists():
        write_json(state_path, DEFAULT_STATE)

    if not inbox_path.exists():
        inbox_path.write_text("", encoding="utf-8")

    return evolution_dir, inbox_path, state_path


def load_events(inbox_path: Path) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    if not inbox_path.exists():
        return events

    for line in inbox_path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            item = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(item, dict):
            events.append(item)
    return events


def next_event_id(events: list[dict[str, Any]]) -> str:
    today_stamp = datetime.now().strftime("%Y%m%d")
    prefix = f"EVO-{today_stamp}-"
    highest = 0

    for event in events:
        event_id = str(event.get("id", ""))
        if not event_id.startswith(prefix):
            continue
        try:
            highest = max(highest, int(event_id.rsplit("-", 1)[-1]))
        except ValueError:
            continue

    return f"{prefix}{highest + 1:03d}"


def append_event(repo_root: Path, fields: dict[str, Any]) -> dict[str, Any]:
    _, inbox_path, _ = ensure_runtime(repo_root)
    events = load_events(inbox_path)

    event: dict[str, Any] = {
        "id": next_event_id(events),
        "ts": datetime.now().astimezone().isoformat(),
    }

    for key, value in fields.items():
        if value in (None, "", [], {}):
            continue
        event[key] = value

    with inbox_path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(event, ensure_ascii=False, separators=(",", ":")) + "\n")

    return event


def load_state(state_path: Path) -> dict[str, Any]:
    state = load_json(state_path, DEFAULT_STATE.copy())
    if not isinstance(state, dict):
        return DEFAULT_STATE.copy()

    normalized = DEFAULT_STATE.copy()
    normalized.update(state)
    return normalized


def compact_text(text: str, limit: int = 180) -> str:
    collapsed = re.sub(r"\s+", " ", text).strip()
    if len(collapsed) <= limit:
        return collapsed
    return collapsed[:limit].rstrip()
