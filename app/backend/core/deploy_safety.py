"""Deployment safety checks shared by startup, health checks and CI.

The staging checks deliberately fail closed. A staging service must name its
own database host and explicitly disable external side effects before it can
start. Production and local development keep their existing behaviour.
"""

from __future__ import annotations

import hashlib
import os
from urllib.parse import urlparse


PRODUCTION_HOSTS = {
    "sortirovka24.kz",
    "www.sortirovka24.kz",
    "sortirovka24-production-8788.up.railway.app",
}


def environment_name() -> str:
    return (os.getenv("ENVIRONMENT") or "local").strip().lower()


def _enabled(name: str) -> bool:
    return (os.getenv(name) or "").strip().lower() in {"1", "true", "yes", "on", "enabled"}


def external_side_effects_allowed() -> bool:
    """Return False when this runtime must not contact customer-facing services."""
    return (os.getenv("EXTERNAL_SIDE_EFFECTS") or "").strip().lower() != "disabled"


def database_target_fingerprint(database_url: str | None = None) -> str:
    """Return a non-secret identifier for the database network target."""
    parsed = urlparse(database_url or os.getenv("DATABASE_URL", ""))
    target = f"{parsed.hostname or ''}:{parsed.port or ''}{parsed.path or ''}"
    return hashlib.sha256(target.encode("utf-8")).hexdigest()[:12] if target.strip(":/") else "unset"


def staging_safety_errors() -> list[str]:
    if environment_name() not in {"stage", "staging"}:
        return []

    errors: list[str] = []
    database_url = (os.getenv("DATABASE_URL") or "").strip()
    parsed_db = urlparse(database_url)
    expected_db_host = (os.getenv("STAGING_DATABASE_HOST") or "").strip().lower()
    if not database_url or parsed_db.scheme.startswith("sqlite"):
        errors.append("staging requires a dedicated PostgreSQL DATABASE_URL")
    if not expected_db_host:
        errors.append("STAGING_DATABASE_HOST is required")
    elif (parsed_db.hostname or "").lower() != expected_db_host:
        errors.append("DATABASE_URL host does not match STAGING_DATABASE_HOST")

    base_url = (os.getenv("STAGING_BASE_URL") or "").strip()
    public_url = (os.getenv("PUBLIC_FRONTEND_URL") or "").strip()
    parsed_base = urlparse(base_url)
    if parsed_base.scheme != "https" or not parsed_base.hostname:
        errors.append("STAGING_BASE_URL must be an https URL")
    elif parsed_base.hostname.lower() in PRODUCTION_HOSTS:
        errors.append("STAGING_BASE_URL points to production")
    if public_url.rstrip("/") != base_url.rstrip("/"):
        errors.append("PUBLIC_FRONTEND_URL must equal STAGING_BASE_URL")

    if (os.getenv("EXTERNAL_SIDE_EFFECTS") or "").strip().lower() != "disabled":
        errors.append("EXTERNAL_SIDE_EFFECTS=disabled is required in staging")

    unsafe_true = ("WHATSAPP_BOT_ENABLED",)
    for name in unsafe_true:
        if _enabled(name):
            errors.append(f"{name} must be disabled in staging")

    forbidden_credentials = (
        "WHATSAPP_ACCESS_TOKEN",
        "WHATSAPP_APP_SECRET",
        "WHATSAPP_VERIFY_TOKEN",
        "WHATSAPP_PHONE_NUMBER_ID",
        "WHATSAPP_BUSINESS_ACCOUNT_ID",
        "FCM_SERVER_KEY",
        "MOBIZON_API_KEY",
        "TELEGRAM_WEBHOOK_SECRET",
        "TELEGRAM_CALLBACK_CHAT_IDS",
        "TELEGRAM_CALLBACK_USER_IDS",
    )
    for name in forbidden_credentials:
        if (os.getenv(name) or "").strip():
            errors.append(f"{name} must not be present in staging")

    telegram_values = [
        value
        for key, value in os.environ.items()
        if key.startswith(("TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID")) and value.strip()
    ]
    if telegram_values and not _enabled("STAGING_ALLOW_TELEGRAM"):
        errors.append("Telegram credentials require STAGING_ALLOW_TELEGRAM=true and a test-only bot/chat")

    stripe_key = (os.getenv("STRIPE_SECRET_KEY") or "").strip()
    if stripe_key and not stripe_key.startswith("sk_test_"):
        errors.append("staging may only use a Stripe test key")

    cloudinary_url = (os.getenv("CLOUDINARY_URL") or "").strip()
    cloud_name = (os.getenv("CLOUDINARY_CLOUD_NAME") or "").strip()
    if cloudinary_url:
        cloud_name = urlparse(cloudinary_url).hostname or cloud_name
    storage_credentials = any(
        (os.getenv(name) or "").strip()
        for name in (
            "CLOUDINARY_URL",
            "CLOUDINARY_API_KEY",
            "CLOUDINARY_API_SECRET",
            "CLOUD_API_KEY",
            "CLOUD_API_SECRET",
        )
    )
    if storage_credentials:
        expected_cloud = (os.getenv("STAGING_CLOUDINARY_CLOUD_NAME") or "").strip()
        if not _enabled("STAGING_ALLOW_STORAGE"):
            errors.append("Cloudinary credentials require STAGING_ALLOW_STORAGE=true")
        if not expected_cloud or cloud_name != expected_cloud:
            errors.append("staging Cloudinary account does not match STAGING_CLOUDINARY_CLOUD_NAME")

    optional_shared_services = {
        "Google OAuth": ("STAGING_ALLOW_GOOGLE_OAUTH", ("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET")),
        "Redis": ("STAGING_ALLOW_REDIS", ("REDIS_URL",)),
        "Sentry": ("STAGING_ALLOW_SENTRY", ("SENTRY_DSN",)),
    }
    for label, (allow_flag, names) in optional_shared_services.items():
        if any((os.getenv(name) or "").strip() for name in names) and not _enabled(allow_flag):
            errors.append(f"{label} configuration requires {allow_flag}=true and staging-only credentials")

    return errors


def validate_runtime_safety() -> None:
    errors = staging_safety_errors()
    if errors:
        raise RuntimeError("Unsafe staging configuration: " + "; ".join(errors))
