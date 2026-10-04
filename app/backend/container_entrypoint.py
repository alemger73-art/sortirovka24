"""Fail-closed container entrypoint for Railway deployments.

Production keeps using Alembic and refuses to start when migrations fail.
Staging currently has a deliberately isolated, empty database. Until the
historical Alembic graph is repaired, its schema is created from the current
SQLAlchemy models by the normal application initializer.
"""

from __future__ import annotations

import os
import subprocess
import asyncio


async def verify_schema_revision(expected: str) -> None:
    """Read-only schema check for a release that must not apply migrations."""
    import asyncpg
    url = os.environ['DATABASE_URL'].replace('postgresql+asyncpg://', 'postgresql://', 1)
    connection = await asyncpg.connect(url, timeout=25)
    try:
        async with connection.transaction(readonly=True):
            revisions = await connection.fetch('SELECT version_num FROM alembic_version')
            if [row['version_num'] for row in revisions] != [expected]:
                raise RuntimeError('Database revision differs from the code-only release; no migrations executed')
    finally:
        await connection.close()

from core.deploy_safety import environment_name, validate_runtime_safety


def migration_strategy() -> str:
    return "orm-bootstrap" if environment_name() in {"stage", "staging"} else "alembic"


def main() -> None:
    validate_runtime_safety()

    strategy = migration_strategy()
    if strategy == "alembic":
        if environment_name() in {'production','prod'}:
            if not os.getenv('DATABASE_URL','').startswith(('postgres://','postgresql://','postgresql+asyncpg://')):
                raise RuntimeError('Production migration requires PostgreSQL')
            expected = os.getenv('S24_SCHEMA_VERIFY_ONLY', '').strip()
            if expected:
                asyncio.run(verify_schema_revision(expected))
                print(f'Code-only release: schema {expected} verified; migrations disabled', flush=True)
            else:
                subprocess.run(['alembic','upgrade','head'],check=True)
        else:
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
