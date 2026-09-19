#!/usr/bin/env python3
"""Non-destructive public smoke test for a deployed staging service."""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request


def get_json(url: str) -> tuple[int, dict]:
    request = urllib.request.Request(url, headers={"User-Agent": "sortirovka24-staging-smoke/1"})
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            payload = {"body": body[:200]}
        return exc.code, payload


def get_text(url: str) -> tuple[int, str]:
    request = urllib.request.Request(url, headers={"User-Agent": "sortirovka24-staging-smoke/1"})
    with urllib.request.urlopen(request, timeout=20) as response:
        return response.status, response.read().decode("utf-8", errors="replace")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--production-url", default="https://sortirovka24-production-8788.up.railway.app")
    args = parser.parse_args()
    stage = args.base_url.rstrip("/")
    production = args.production_url.rstrip("/")
    failures: list[str] = []

    if stage == production:
        failures.append("staging URL equals production URL")

    ready_status, ready = get_json(stage + "/health/ready")
    if ready_status != 200 or ready.get("status") != "ready" or ready.get("database") != "ok":
        failures.append(f"staging readiness failed: HTTP {ready_status} {ready}")
    if ready.get("environment") not in {"stage", "staging"}:
        failures.append(f"unexpected staging environment marker: {ready.get('environment')!r}")
    if not ready.get("database_target") or ready.get("database_target") == "unset":
        failures.append("staging database target marker is missing")

    prod_status, prod = get_json(production + "/health")
    if prod_status != 200 or prod.get("database") != "ok":
        failures.append("production health is not healthy")
    if prod.get("database_target") and prod.get("database_target") == ready.get("database_target"):
        failures.append("staging and production resolve to the same database target")

    home_status, home = get_text(stage + "/")
    if home_status != 200 or 'id="root"' not in home:
        failures.append("staging frontend did not return the SPA shell")

    modules_status, modules = get_json(stage + "/api/v1/modules")
    if modules_status != 200 or not isinstance(modules, dict):
        failures.append("staging modules API failed")

    if failures:
        print("Staging smoke test FAILED:")
        for failure in failures:
            print(f"- {failure}")
        return 1

    print(
        "Staging smoke test OK: "
        f"build={ready.get('frontend_build')} db={ready.get('database_target')} modules={len(modules)}"
    )
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        print(f"Staging smoke test ERROR: {exc}")
        sys.exit(1)
