"""Database URL handling for migrations; never include credentials in errors."""
from sqlalchemy.engine import make_url


def migration_database_url(environment_url: str | None, configured_url: str | None) -> str:
    raw = (environment_url or configured_url or "").strip()
    if not raw or raw in {'""', "''"}:
        raise RuntimeError("DATABASE_URL is required for migrations")
    try:
        url = make_url(raw)
    except Exception:
        raise RuntimeError("Invalid migration database URL") from None
    if url.drivername in {"postgres", "postgresql", "postgresql+psycopg2"}:
        url = url.set(drivername="postgresql+asyncpg")
    elif url.drivername == "sqlite":
        url = url.set(drivername="sqlite+aiosqlite")
    if url.drivername == "postgresql+asyncpg":
        query = dict(url.query)
        if "sslmode" in query:
            query.setdefault("ssl", query.pop("sslmode"))
        query.pop("channel_binding", None)
        url = url.set(query=query)
    return url.render_as_string(hide_password=False)
