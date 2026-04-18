#!/usr/bin/env python3
from __future__ import annotations

import argparse
from datetime import datetime
from pathlib import Path

from _common import PENDING_STATUSES, ensure_runtime, load_events, load_state, resolve_repo_root, write_json


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Review the local evolution inbox summary.")
    parser.add_argument("--repo-root", default=None)
    parser.add_argument("--limit", type=int, default=10)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    repo_root = resolve_repo_root(Path(__file__), args.repo_root)
    _, inbox_path, state_path = ensure_runtime(repo_root)

    events = load_events(inbox_path)
    if not events:
        print("Evolution inbox is empty.")
    else:
        pending = [event for event in events if str(event.get("status", "")) in PENDING_STATUSES]
        recent = sorted(pending, key=lambda item: str(item.get("ts", "")), reverse=True)[: args.limit]

        print(f"Total events: {len(events)}")
        print(f"Pending events: {len(pending)}")
        print("")

        print("Pending by trigger:")
        trigger_counts: dict[str, int] = {}
        for event in pending:
            trigger = str(event.get("trigger", "unknown"))
            trigger_counts[trigger] = trigger_counts.get(trigger, 0) + 1
        if trigger_counts:
            for trigger, count in sorted(trigger_counts.items(), key=lambda item: (-item[1], item[0])):
                print(f"- {trigger}: {count}")
        else:
            print("- none")

        print("")
        print("Pending by candidate:")
        candidate_counts: dict[str, int] = {}
        for event in pending:
            candidate = str(event.get("candidate", "unknown"))
            candidate_counts[candidate] = candidate_counts.get(candidate, 0) + 1
        if candidate_counts:
            for candidate, count in sorted(candidate_counts.items(), key=lambda item: (-item[1], item[0])):
                print(f"- {candidate}: {count}")
        else:
            print("- none")

        print("")
        print(f"Recent pending events (max {args.limit}):")
        if recent:
            for event in recent:
                print(
                    f"- [{event.get('id', 'unknown')}] "
                    f"{event.get('trigger', 'unknown')}/{event.get('candidate', 'unknown')} "
                    f"-> {event.get('summary', '')}"
                )
        else:
            print("- none")

    state = load_state(state_path)
    state["last_reviewed_at"] = datetime.now().astimezone().isoformat()
    write_json(state_path, state)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
