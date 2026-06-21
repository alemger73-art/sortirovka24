"""Environment helpers shared across the backend."""

import os


def is_production() -> bool:
    """Return True when running in a production-like environment."""
    env = os.getenv("ENVIRONMENT", "").strip().lower()
    if env in ("production", "prod"):
        return True
    if env in ("development", "dev", "local", "test"):
        return False
    # Managed hosts (Railway, etc.) default to production unless explicitly dev.
    if os.getenv("PORT") or os.getenv("RAILWAY_ENVIRONMENT"):
        return True
    return False
