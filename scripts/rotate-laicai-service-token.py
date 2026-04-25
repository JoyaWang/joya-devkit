#!/usr/bin/env python3
"""Rotate Laicai prod SRS service token in env.runtime and Infisical Vault.

Usage:
  python3 scripts/rotate-laicai-service-token.py --env prod --env-file env.runtime

Inputs:
  LAICAI_SRS_SERVICE_TOKEN_ROTATION  New token value. Never printed.
  INFISICAL_PROJECT_ID_JOYA_DEVKIT   Infisical project id.
  VAULT_TOKEN                        Infisical service token.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Iterable
from urllib import error, request

INFISICAL_API_BASE = "https://vault.infinex.cn/api"
TARGET_MAPPING = "laicai:prod"
SERVICE_TOKENS_KEY = "SERVICE_TOKENS"
ROTATION_ENV_KEY = "LAICAI_SRS_SERVICE_TOKEN_ROTATION"
PROJECT_ID_ENV_KEY = "INFISICAL_PROJECT_ID_JOYA_DEVKIT"
VAULT_TOKEN_ENV_KEY = "VAULT_TOKEN"


class RotationError(RuntimeError):
    pass


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Rotate Laicai prod SRS service token without logging token values."
    )
    parser.add_argument("--env", default="prod", choices=["prod"], help="Infisical environment slug")
    parser.add_argument("--env-file", default="env.runtime", help="Generated runtime env file path")
    parser.add_argument("--secret-path", default="/BE/runtime", help="Infisical secret path")
    return parser.parse_args()


def require_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RotationError(f"Missing {name}")
    return value


def validate_token(token: str) -> None:
    if len(token) < 32:
        raise RotationError("Rotation token is too short")
    forbidden = ["\n", "\r", ",", "="]
    if any(char in token for char in forbidden):
        raise RotationError("Rotation token contains unsupported SERVICE_TOKENS delimiter characters")


def split_env_line(line: str) -> tuple[str, str] | None:
    if "=" not in line:
        return None
    key, value = line.split("=", 1)
    return key, value


def read_env_lines(env_file: Path) -> list[str]:
    if not env_file.exists():
        raise RotationError(f"Missing env file: {env_file}")
    return env_file.read_text(encoding="utf-8").splitlines()


def extract_service_tokens(lines: Iterable[str]) -> str:
    for line in lines:
        parsed = split_env_line(line)
        if parsed and parsed[0] == SERVICE_TOKENS_KEY:
            return parsed[1]
    return ""


def is_laicai_prod_mapping(mapping: str) -> bool:
    normalized = mapping.strip()
    if normalized == "laicai":
        return True
    if ":" not in normalized:
        return False
    project_key, runtime_env = normalized.rsplit(":", 1)
    return project_key.strip() == "laicai" and runtime_env.strip() in {"prod", "prd"}


def rotate_service_tokens(raw: str, new_token: str) -> str:
    next_pairs: list[str] = []
    for pair in raw.split(","):
        stripped = pair.strip()
        if not stripped:
            continue
        if "=" not in stripped:
            next_pairs.append(stripped)
            continue
        token, mapping = stripped.split("=", 1)
        if is_laicai_prod_mapping(mapping):
            continue
        next_pairs.append(f"{token.strip()}={mapping.strip()}")

    next_pairs.append(f"{new_token}={TARGET_MAPPING}")
    return ",".join(next_pairs)


def write_env_file(env_file: Path, lines: list[str], rotated_service_tokens: str) -> None:
    next_lines: list[str] = []
    replaced = False
    for line in lines:
        parsed = split_env_line(line)
        if parsed and parsed[0] == SERVICE_TOKENS_KEY:
            next_lines.append(f"{SERVICE_TOKENS_KEY}={rotated_service_tokens}")
            replaced = True
        else:
            next_lines.append(line)

    if not replaced:
        next_lines.append(f"{SERVICE_TOKENS_KEY}={rotated_service_tokens}")

    env_file.write_text("\n".join(next_lines) + "\n", encoding="utf-8")


def infisical_request(method: str, path: str, vault_token: str, payload: dict[str, object]) -> tuple[int, bytes]:
    body = json.dumps(payload).encode("utf-8")
    req = request.Request(
        f"{INFISICAL_API_BASE}{path}",
        data=body,
        method=method,
        headers={
            "Authorization": f"Bearer {vault_token}",
            "Content-Type": "application/json",
        },
    )
    try:
        with request.urlopen(req, timeout=30) as resp:
            return resp.status, resp.read()
    except error.HTTPError as exc:
        response_body = exc.read()
        if exc.code == 404:
            return exc.code, response_body
        raise RotationError(f"Infisical {method} {path} failed with HTTP {exc.code}") from exc
    except Exception as exc:  # pragma: no cover - network/runtime guard
        raise RotationError(f"Infisical {method} {path} failed: {exc}") from exc


def persist_service_tokens_to_vault(
    *,
    project_id: str,
    env: str,
    secret_path: str,
    vault_token: str,
    rotated_service_tokens: str,
) -> None:
    payload = {
        "workspaceId": project_id,
        "environment": env,
        "secretPath": secret_path,
        "secretValue": rotated_service_tokens,
        "type": "shared",
        "skipMultilineEncoding": True,
        "secretComment": "Rotate laicai:prod SRS service token via GitHub Actions",
    }

    # Self-hosted Vault currently exposes the v3 raw secret API used by gen-env-runtime.sh.
    status, _ = infisical_request(
        "PATCH",
        f"/v3/secrets/raw/{SERVICE_TOKENS_KEY}",
        vault_token,
        payload,
    )
    if status == 404:
        status, _ = infisical_request(
            "POST",
            f"/v3/secrets/raw/{SERVICE_TOKENS_KEY}",
            vault_token,
            payload,
        )

    if status < 200 or status >= 300:
        raise RotationError(f"Infisical SERVICE_TOKENS persistence failed with HTTP {status}")


def main() -> int:
    args = parse_args()
    new_token = require_env(ROTATION_ENV_KEY)
    project_id = require_env(PROJECT_ID_ENV_KEY)
    vault_token = require_env(VAULT_TOKEN_ENV_KEY)
    validate_token(new_token)

    env_file = Path(args.env_file)
    lines = read_env_lines(env_file)
    current_service_tokens = extract_service_tokens(lines)
    rotated_service_tokens = rotate_service_tokens(current_service_tokens, new_token)

    write_env_file(env_file, lines, rotated_service_tokens)
    persist_service_tokens_to_vault(
        project_id=project_id,
        env=args.env,
        secret_path=args.secret_path,
        vault_token=vault_token,
        rotated_service_tokens=rotated_service_tokens,
    )

    print("Rotated Laicai SRS service token for laicai:prod and persisted SERVICE_TOKENS to Vault")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RotationError as exc:
        print(f"ERROR: {exc}", file=os.sys.stderr)
        raise SystemExit(1)
