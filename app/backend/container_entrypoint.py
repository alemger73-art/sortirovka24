"""Fail-closed container entrypoint for Railway deployments.

Production keeps using Alembic and refuses to start when migrations fail.
Staging currently has a deliberately isolated, empty database. Until the
historical Alembic graph is repaired, its schema is created from the current
SQLAlchemy models by the normal application initializer.
"""

from __future__ import annotations

import os
import subprocess

from core.deploy_safety import environment_name, validate_runtime_safety


def migration_strategy() -> str:
    return "orm-bootstrap" if environment_name() in {"stage", "staging"} else "alembic"


def main() -> None:
    validate_runtime_safety()

    strategy = migration_strategy()
    if strategy == "alembic":
        subprocess.run(["alembic", "upgrade", "head"], check=True)
    else:
        print("Staging schema strategy: isolated ORM bootstrap", flush=True)

    port = os.getenv("PORT", "8000")
    os.execvp(
        "uvicorn",
        [
            "uvicorn",
            "main:app",
            "--host",
            "0.0.0.0",
            "--port",
            port,
            "--proxy-headers",
            "--forwarded-allow-ips=*",
        ],
    )


if __name__ == "__main__":
    main()
