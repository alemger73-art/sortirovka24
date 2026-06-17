"""Timezone-safe datetime helpers.

PostgreSQL (asyncpg) returns timezone-aware datetimes for ``TIMESTAMPTZ``
columns, but SQLite (aiosqlite) returns naive datetimes. Comparing a naive
value with an aware ``datetime.now(timezone.utc)`` raises ``TypeError``. These
helpers normalize values so the same code works on both backends.
"""

from datetime import datetime, timezone


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def as_aware_utc(value: datetime | None) -> datetime | None:
    """Return *value* as a UTC-aware datetime (assume UTC when naive)."""
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value
